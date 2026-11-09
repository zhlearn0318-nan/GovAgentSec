"""Real local JWT/OPA; synthetic document registry. No model/API calls."""
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'modules/agentguard-group2'))
from identity.demo_provider import DemoIdentity
from enforcement.documents import REGISTRY, document_action


class AutomaticChatIdentity(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory(dir=ROOT/'local-validation')
        self.addCleanup(temp.cleanup)
        self.demo=DemoIdentity(temp.name)
        self.demo.handle('enable')
        self.addCleanup(self.demo.disable)

    def login(self, account, previous=None):
        password={'jingban':'Demo#Jingban26','shenpi':'Demo#Shenpi26','weihu':'Demo#Weihu26','shenji':'Demo#Shenji26'}[account]
        return 'Bearer '+self.demo.handle('login',{'account':account,'password':password},previous)['access_token']

    def start(self, token, session=None):
        session=session or 'agent:main:auto-'+uuid.uuid4().hex
        self.assertEqual(self.demo.handle('activate_chat',{'session_key':session},token)['status'],'ok')
        run=uuid.uuid4().hex
        self.assertEqual(self.demo.chat.start({'session_key':session,'run_id':run})['status'],'ok')
        return session,run

    def test_all_chats_use_server_registry_and_real_read_policy(self):
        for account,ids in [('jingban',{'emergency_plan'}),('shenpi',{'emergency_plan','material_inventory'}),('weihu',set(REGISTRY))]:
            token=self.login(account)
            for _ in range(2):
                session,run=self.start(token)
                state=self.demo.chat.runs[run]
                self.assertEqual(set(state['material_tasks']),ids)
                for doc in REGISTRY:
                    task=state['material_tasks'].get(doc,state['task'])
                    req=self.demo.task_request(task,document_action(doc))
                    before=self.demo.service.gateway.business_adapters.documents.read_count
                    result=self.demo.service.invoke(req,token)
                    delta=self.demo.service.gateway.business_adapters.documents.read_count-before
                    self.assertEqual(result['status'],'executed_isolated' if doc in ids else 'blocked',result)
                    self.assertEqual(delta,1 if doc in ids else 0)
                    if doc in ids:
                        req['subject']=self.demo.subject(token)
                        scope=self.demo.service.gateway.task_policies.evaluate(req)
                        self.assertEqual(scope['provenance']['document_id']['source'],'registry_policy')
                self.assertNotIn(session,self.demo.chat.material_selections)

    def test_switch_revokes_all_chats_and_inflight_runs(self):
        old=self.login('weihu')
        runs=[self.start(old) for _ in range(2)]
        new=self.login('jingban',old)
        for session,run in runs:
            self.assertNotIn(session,self.demo.chat.sessions)
            self.assertNotIn(run,self.demo.chat.runs)
            result=self.demo.chat.tool({'session_key':session,'run_id':run,'tool_name':'agentguard-notices__read_gov_document','params':{'document_id':'command_contacts'}})
            self.assertEqual(result['status'],'blocked')
            _,fresh=self.start(new,session)
            self.assertEqual(set(self.demo.chat.runs[fresh]['material_tasks']),{'emergency_plan'})
        self.assertEqual(self.demo.service.gateway.business_adapters.documents.read_count,0)

    def test_idempotent_activation_preserves_run_and_other_window_cannot_take_over(self):
        token=self.login('shenpi');session,run=self.start(token)
        before=self.demo.chat.scope_generations[session]
        self.assertEqual(self.demo.handle('activate_chat',{'session_key':session},token)['status'],'ok')
        self.assertEqual(self.demo.chat.scope_generations[session],before)
        self.assertIn(run,self.demo.chat.runs)
        other=self.login('weihu')
        self.assertEqual(self.demo.handle('activate_chat',{'session_key':session},other)['reason_code'],'P027_CONVERSATION_IDENTITY_CONFLICT')
        self.assertEqual(self.demo.chat.sessions[session],token)

    def test_untrusted_scope_fields_and_manual_selection_rejected(self):
        token=self.login('jingban');session,_=self.start(token)
        for key,value in [('material_ids',['command_contacts']),('clearance',3),('subject','admin'),('grant_source','registry_policy')]:
            self.assertEqual(self.demo.handle('activate_chat',{'session_key':session,key:value},token)['status'],'blocked')
        self.assertEqual(self.demo.handle('select_materials',{'session_key':session,'material_ids':['command_contacts']},token)['reason_code'],'P028_AUTOMATIC_MATERIAL_POLICY')
        payload={'operation':'create','task_id':'bad','tools':['file.read'],'grant_source':'registry_policy'}
        self.assertEqual(self.demo.service.task_contract_authenticated(payload,token)['status'],'blocked')
        self.assertEqual(self.demo.service.gateway.business_adapters.documents.read_count,0)

    def test_auditor_and_missing_identity_do_not_activate(self):
        for token in [None,self.login('shenji')]:
            result=self.demo.handle('activate_chat',{'session_key':'agent:main:audit'},token)
            self.assertEqual(result['status'],'blocked')
        self.assertEqual(self.demo.chat.sessions,{})

    def test_opa_unavailable_cannot_create_automatic_run(self):
        token=self.login('shenpi');session='agent:main:opa-down'
        self.demo.handle('activate_chat',{'session_key':session},token)
        with patch.object(self.demo.service.gateway.opa,'decide',side_effect=RuntimeError('offline')):
            result=self.demo.chat.start({'session_key':session,'run_id':'failed-run'})
        self.assertEqual(result['reason_code'],'P012_TASK_POLICY_UNAVAILABLE')
        self.assertNotIn('failed-run',self.demo.chat.runs)
        self.assertEqual(self.demo.service.gateway.business_adapters.documents.read_count,0)

    def test_native_paths_keep_their_own_scope_despite_document_correlation(self):
        token=self.login('shenpi');session='agent:main:native-scope'
        self.demo.handle('activate_chat',{'session_key':session},token)
        path='nativefs://workspace/A/test.txt'
        self.demo.chat.start({'session_key':session,'run_id':'native','paths':[path]})
        for target,expected in [(path,'host_authorized'),('nativefs://workspace/B/test.txt','blocked')]:
            action={'tool':'native.read','operation':'read','resource':target,'parameters':{'path':target,'document_id':'material_inventory'},'data_level':'internal','risk_level':'low'}
            result=self.demo.chat.tool({'session_key':session,'run_id':'native','tool_call_id':uuid.uuid4().hex,'tool_name':'read','params':{},'action':action})
            self.assertEqual(result['status'],expected,result)
            record=self.demo.requests[result['request_id']]
            self.assertEqual(record['task_id'],self.demo.chat.runs['native']['task'])
        self.assertEqual(self.demo.service.gateway.business_adapters.documents.read_count,0)

if __name__=='__main__': unittest.main()
