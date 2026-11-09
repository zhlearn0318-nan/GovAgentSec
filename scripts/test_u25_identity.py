"""Real local JWT/OPA; passwords come from the labelled non-production design."""
import json
import re
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'modules/agentguard-group2'))
from identity.demo_provider import DemoIdentity
from enforcement.documents import REGISTRY, document_action

PASSWORDS=dict(re.findall(r'\| (jingban|shenpi|shenji|weihu) \| ([^|]+?) \|',
    (ROOT/'docs/U25_FOUR_ENTRY_WORKSPACE_IA.md').read_text(encoding='utf-8')))

class AccountPermissions(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT/'local-validation')
        self.addCleanup(self.temp.cleanup)
        self.demo=DemoIdentity(self.temp.name)
        self.addCleanup(self.demo.disable)
        self.demo.handle('enable')

    def login(self,name,old=None):
        r=self.demo.handle('login',dict(account=name,password=PASSWORDS[name]),old)
        self.assertIn('access_token',r)
        return 'Bearer '+r['access_token']

    def test_three_cumulative_tiers_policy_summary_and_no_secret_exposure(self):
        summaries=[]
        for level,(account,subject) in enumerate([('jingban','office-test'),
                ('shenpi','approver-test'),('weihu','maintenance-test')],1):
            token=self.login(account)
            status=self.demo.status(token)
            self.assertEqual(status['user']['id'],subject)
            summary=status['permission_summary']
            summaries.append(summary)
            self.assertEqual(summary['tier'],level)
            self.assertEqual(status['user']['tier'],level)
            self.assertEqual(status['user']['tier_label'],summary['tier_label'])
            self.assertEqual(summary['clearance'],[0,1,3][level-1])
            self.assertEqual(summary['material_ids'],list(REGISTRY)[:level] if level<3 else list(REGISTRY))
            self.assertEqual(summary['can_approve'],level>=2)
            self.assertEqual(summary['can_edit_rules'],account=='weihu')
            self.assertEqual(summary['can_switch_sandbox'],account=='weihu')
            self.assertEqual(summary['can_assess'],level>=2)
            self.assertNotIn('password',json.dumps(status))
            self.assertFalse(status['production_oidc'])
            self.assertEqual({u['account'] for u in status['users']},{'admin','jingban','shenpi','shenji','weihu'})
            for capability in ['workspace.read','audit.read','admission.read']:
                self.assertEqual(self.demo.handle('authorize',{'permission':capability},token)['status'],'ok')
            for capability in ['admission.manage','settings.manage']:
                result=self.demo.handle('authorize',{'permission':capability},token)
                self.assertEqual(result['status'],'ok' if account=='weihu' else 'blocked')
        for low,high in zip(summaries,summaries[1:]):
            for field in ['material_ids','tool_families','capabilities']:
                self.assertLessEqual(set(low[field]),set(high[field]))
            self.assertLess(set(low['material_ids']),set(high['material_ids']))
            self.assertLess(set(low['capabilities']),set(high['capabilities']))

    def test_public_auditor_is_read_only_and_not_a_fourth_execution_tier(self):
        bearer=self.login('shenji')
        state=self.demo.status(bearer)
        self.assertFalse(state['execution_enabled'])
        self.assertIsNone(state['permission_summary']['tier'])
        self.assertEqual(state['permission_summary']['material_ids'],[])
        for capability in ['audit.read','audit.assess','admission.read']:
            self.assertEqual(self.demo.handle('authorize',{'permission':capability},bearer)['status'],'ok')
        for capability in ['settings.manage','admission.manage']:
            self.assertEqual(self.demo.handle('authorize',{'permission':capability},bearer)['status'],'blocked')
        self.assertEqual(self.demo.handle('invoke',dict(scenario='notice'),bearer)['reason_code'],'DEMO_AUDITOR_READ_ONLY')
        self.assertEqual(self.demo.handle('bind_session',dict(session_key='agent:main:audit'),bearer)['status'],'blocked')

    def test_wrong_missing_disabled_and_source_off_fail(self):
        for payload in [dict(account='jingban',password='wrong'),dict(account='jingban'),dict(account='unknown',password='wrong')]:
            self.assertEqual(self.demo.handle('login',payload)['reason_code'],'DEMO_LOGIN_FAILED')
        account=self.demo.accounts[0]
        token=self.login(account['account'])
        account['enabled']=False
        self.assertEqual(self.demo.handle('login',dict(account=account['account'],password=PASSWORDS[account['account']]))['reason_code'],'DEMO_LOGIN_FAILED')
        self.assertEqual(self.demo.handle('authorize',{'permission':'audit.read'},token)['http_status'],401)
        self.demo.disable()
        self.assertEqual(self.demo.handle('login',dict(account='jingban',password=PASSWORDS['jingban']))['reason_code'],'DEMO_IDENTITY_DISABLED')

    def test_switch_logout_and_expiry_revoke_authority(self):
        token=self.login('jingban')
        fresh=self.login('weihu',token)
        self.assertEqual(self.demo.handle('authorize',{'permission':'audit.read'},token)['http_status'],401)
        self.assertEqual(self.demo.handle('authorize',{'permission':'settings.manage'},fresh)['status'],'ok')
        self.demo.handle('revoke',{},fresh)
        self.assertEqual(self.demo.handle('authorize',{'permission':'settings.manage'},fresh)['http_status'],401)
        active=self.login('weihu')
        self.demo.expires_at=time.time()-1
        self.assertEqual(self.demo.handle('authorize',{'permission':'settings.manage'},active)['reason_code'],'DEMO_IDENTITY_DISABLED')

    def test_tamper_cannot_grant_permission(self):
        token=self.login('shenpi')
        for payload in [{'permission':'admission.manage','roles':['workspace_maintainer']},{'permission':'all'}]:
            self.assertEqual(self.demo.handle('authorize',payload,token)['status'],'blocked')
        for field in ['tier','tier_label','clearance','roles']:
            self.assertEqual(self.demo.handle('login',dict(account='jingban',password=PASSWORDS['jingban'],**{field:3}))['reason_code'],'DEMO_UNTRUSTED_FIELD')
        self.assertEqual(self.demo.handle('authorize',{'permission':'audit.read'},'Bearer invalid')['http_status'],401)
        self.assertEqual(self.demo.handle('authorize',{'permission':'audit.read'})['http_status'],401)

    def test_password_users_reuse_double_approval_and_single_execution(self):
        officer=self.login('jingban');approver=self.login('shenpi')
        task=self.demo.handle('task_create',{'directory':'B'},officer)['task_id']
        denied=self.demo.handle('task_read',{'task_id':task,'document_id':'emergency_plan'},officer)
        request=self.demo.handle('task_escalate',{'request_id':denied['request_id']},officer)
        self.assertEqual(request['status'],'pending_approval')
        resolve={'request_id':request['request_id'],'resolution':'approve'}
        self.assertEqual(self.demo.handle('resolve',resolve,officer)['reason_code'],'D105_SELF_APPROVAL')
        self.assertEqual(self.count(),0)
        self.assertEqual(self.demo.handle('resolve',resolve,approver)['status'],'executed_isolated')
        self.assertEqual(self.count(),1)
        self.assertEqual(self.demo.handle('resolve',resolve,approver)['status'],'blocked')
        self.assertEqual(self.count(),1)

    def document_request(self,token,document):
        task='tier-document-'+uuid.uuid4().hex
        action=document_action(document)
        contract=self.demo.service.task_contract_authenticated(dict(operation='create',task_id=task,
            tools=['file.read'],resource_prefixes=[action['resource'].rsplit('/',1)[0]+'/'],
            user_values={'file.read':{'document_id':document}}),token)
        self.assertEqual(contract['status'],'ok')
        request=self.demo.task_request(task,action)
        return self.demo.service.verifier.authenticate_request(request,token)

    def count(self):
        return self.demo.service.gateway.business_adapters.documents.read_count

    def test_material_catalogue_and_runtime_policy_match_tiers(self):
        for account in ['jingban','shenpi','weihu']:
            token=self.login(account)
            session='agent:main:tier-'+account
            self.assertEqual(self.demo.handle('bind_session',{'session_key':session},token)['status'],'ok')
            catalogue=self.demo.handle('materials',{'session_key':session},token)
            self.assertEqual({m['document_id'] for m in catalogue['materials'] if m['selectable']},
                             set(self.demo.status(token)['permission_summary']['material_ids']))
        for account,document,rule in [
            ('jingban','command_contacts','D004_CLEARANCE_INSUFFICIENT'),
            ('shenpi','command_contacts','D004_CLEARANCE_INSUFFICIENT'),
            ('jingban','protected_resource','D005_PROTECTED_RESOURCE'),
            ('shenpi','protected_resource','D005_PROTECTED_RESOURCE')]:
            token=self.login(account)
            result=self.demo.service.invoke(self.document_request(token,document),token)
            self.assertEqual(result['status'],'blocked')
            self.assertIn(rule,result['policy_reason_codes'])
            self.assertEqual(self.count(),0)

    def test_sensitive_documents_middle_denied_without_read(self):
        middle=self.login('shenpi')
        for document in ['duty_contacts','command_contacts']:
            request=self.document_request(middle,document)
            result=self.demo.service.invoke(request,middle)
            self.assertEqual(result['status'],'blocked')
            self.assertIn('D004_CLEARANCE_INSUFFICIENT',result['policy_reason_codes'])
            self.assertEqual(self.count(),0)

    def test_high_tier_task_scope_and_ticket_constraints_still_apply(self):
        high=self.login('weihu')
        task=self.demo.handle('task_create',{'directory':'A'},high)['task_id']
        allowed=self.demo.handle('task_read',{'task_id':task,'document_id':'material_inventory'},high)
        self.assertEqual(allowed['status'],'executed_isolated')
        self.assertEqual(self.count(),1)
        before=self.count()
        # Highest tier can access the protected registry, but only through OPA,
        # task binding and a valid single-use execution ticket.
        request=self.document_request(high,'protected_resource')
        gate=self.demo.service.gateway
        expired=gate.authorize(request,ttl_seconds=-1)['ticket']
        self.assertEqual(gate.dispatch(request,expired)['reason_code'],'G204_TICKET_EXPIRED')
        self.assertEqual(self.count(),before)
        ticket=gate.authorize(request)['ticket']
        tampered=json.loads(json.dumps(request));tampered['action']=document_action('emergency_plan')
        self.assertEqual(gate.dispatch(tampered,ticket)['reason_code'],'G205_TICKET_BINDING_MISMATCH')
        self.assertEqual(self.count(),before)
        self.assertEqual(gate.dispatch(request,ticket)['status'],'executed_isolated')
        self.assertEqual(self.count(),before+1)
        self.assertEqual(gate.dispatch(request,ticket)['status'],'blocked')
        self.assertEqual(self.count(),before+1)

    def test_high_native_only_sensitive_read_and_no_forged_self_approval(self):
        high=self.login('weihu')
        self.assertEqual(self.demo.status(high)['permission_summary']['approval_mode'],'openclaw_native_only')
        for document in ['duty_contacts','command_contacts']:
            request=self.document_request(high,document)
            result=self.demo.service.invoke(request,high)
            self.assertEqual(result['status'],'executed_isolated',result)
            self.assertEqual(result['approval_mode'],'openclaw_native_only')
            self.assertIn('A004_SENSITIVE_DATA',result['policy_reason_codes'])
        self.assertEqual(self.demo.service._pending_oidc_approvals,{})
        low=self.login('jingban')
        request=self.document_request(low,'command_contacts')
        request['subject']=self.demo.subject(high)
        request['context']['native_approval_only']=True
        before=self.count()
        result=self.demo.service.invoke(request,low)
        self.assertEqual(result['status'],'blocked')
        self.assertIn('D004_CLEARANCE_INSUFFICIENT',result['policy_reason_codes'])
        self.assertEqual(self.count(),before)

    def test_high_native_tools_no_business_queue_and_other_tiers_unchanged(self):
        for account in ['weihu','shenpi','jingban']:
            token=self.login(account);session='agent:main:native-only-'+account
            self.demo.handle('bind_session',{'session_key':session},token)
            start=self.demo.chat.start(dict(session_key=session,run_id=session,paths=[]))
            self.assertEqual(start['status'],'ok',start)
            result=self.demo.chat.tool(dict(session_key=session,run_id=session,tool_call_id='write-1',
                tool_name='write',params={'path':'/workspace/A/test.txt'},action=dict(tool='file.write',operation='write',
                resource='nativefs://workspace/A/test.txt',parameters={'path':'nativefs://workspace/A/test.txt'},
                data_level='internal',risk_level='high')))
            self.assertEqual(result['status'],'host_authorized' if account=='weihu' else 'blocked',result)
            self.assertNotEqual(result['status'],'pending_approval')

    def test_native_only_does_not_override_deny_failure_or_default_gateway(self):
        token=self.login('weihu');request=self.document_request(token,'command_contacts')
        gate=self.demo.service.gateway;before=self.count()
        with patch.object(gate.opa,'decide',return_value={'effect':'deny','reason_codes':['DENY_TEST']}):
            self.assertEqual(self.demo.service.invoke(request,token)['reason_code'],'G002_POLICY_DENY')
        with patch.object(gate.opa,'decide',side_effect=RuntimeError('offline')):
            self.assertEqual(self.demo.service.invoke(request,token)['reason_code'],'G001_OPA_UNAVAILABLE_FAIL_CLOSED')
        with patch.object(gate,'demo_native_approval_subjects',frozenset()):
            self.assertEqual(self.demo.service.invoke(request,token)['status'],'pending_approval')
        self.assertEqual(self.count(),before)

if __name__=='__main__':unittest.main()
