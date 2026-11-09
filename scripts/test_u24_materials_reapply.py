"""Real local OPA/JWT/tickets; isolated synthetic registry, no host file IO."""
import copy
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'modules/agentguard-group2'))
from identity.demo_provider import DemoIdentity


class MaterialsAndReapply(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT/'local-validation')
        self.addCleanup(self.temp.cleanup)
        self.d=DemoIdentity(self.temp.name);self.addCleanup(self.d.disable)
        self.d.handle('enable')
        self.officer=self.login('office-test');self.approver=self.login('approver-test')
        self.session='agent:main:u24-materials'
        self.d.handle('bind_session',{'session_key':self.session},self.officer)
    def login(self,user):
        return 'Bearer '+self.d.handle('login',{'user':user})['access_token']
    def select(self,ids):
        return self.d.handle('select_materials',{'session_key':self.session,'material_ids':ids},self.officer)
    def start(self,run='r1',**extra):
        return self.d.chat.handle('chat_start',dict(run_id=run,session_key=self.session,**extra))
    def tool(self,doc,run='r1'):
        return self.d.chat.handle('chat_tool',dict(run_id=run,session_key=self.session,
            tool_call_id='call-'+doc,tool_name='agentguard-notices__read_gov_document',params={'document_id':doc}))
    def test_pending_mcp_receipt_is_not_execution_success(self):
        self.select(['emergency_plan']);self.start()
        gate=self.tool('emergency_plan')
        self.assertEqual(gate['status'],'host_authorized')
        self.d.chat.handle('chat_result',dict(run_id='r1',session_key=self.session,
            tool_call_id='call-emergency_plan',tool_name='agentguard-notices__read_gov_document',
            success=False,control_status='pending_approval'))
        self.assertEqual(self.d.requests[gate['request_id']]['execution_status'],'pending_approval')
        self.assertEqual(self.d.service.gateway.business_adapters.documents.read_count,0)
    def test_two_explicit_materials_and_unselected_block(self):
        self.assertEqual(self.select(['emergency_plan','material_inventory'])['status'],'ok')
        self.assertEqual(self.start(paths=['nativefs://workspace/private.txt'],public_notice=True)['status'],'ok')
        tasks=[]
        for doc in ['emergency_plan','material_inventory']:
            r=self.tool(doc);self.assertEqual(r['status'],'host_authorized',r);tasks.append(r['task_id'])
        self.assertEqual(len(set(tasks)),2)
        denied=self.tool('command_contacts');self.assertEqual(denied['status'],'blocked')
        self.assertEqual(self.d.service.gateway.business_adapters.documents.read_count,0)
        self.assertEqual(self.d.chat.runs['r1']['material_tasks'].keys(),{'emergency_plan','material_inventory'})
        # Trusted hook's later path hint cannot widen explicit selection.
        action=dict(tool='native.read',operation='read',resource='nativefs://workspace/private.txt',
                    parameters={'path':'nativefs://workspace/private.txt'},data_level='internal',risk_level='low')
        r=self.d.chat.handle('chat_tool',dict(run_id='r1',session_key=self.session,tool_call_id='unselected',tool_name='read',params={},action=action))
        self.assertEqual(r['reason_code'],'P014_RESOURCE_OUTSIDE_TASK')
    def test_atomic_selection_and_identity_and_parameters(self):
        self.assertEqual(self.select(['emergency_plan'])['status'],'ok')
        for ids in [['material_inventory','command_contacts'],['../private'],['emergency_plan','emergency_plan'],[]]:
            self.assertEqual(self.select(ids)['status'],'blocked')
            self.assertEqual(self.d.chat.material_selections[self.session],['emergency_plan'])
        r=self.d.handle('select_materials',{'session_key':self.session,'material_ids':['emergency_plan'],'clearance':3},self.officer)
        self.assertEqual(r['reason_code'],'DEMO_UNTRUSTED_FIELD')
        other=self.login('office-test')
        self.assertEqual(self.d.handle('materials',{'session_key':self.session},other)['status'],'blocked')
        self.start();self.assertEqual(self.select(['material_inventory'])['reason_code'],'P004_TASK_RUNNING')
    def test_catalogue_has_no_paths_and_denies_secret(self):
        data=self.d.handle('materials',{'session_key':self.session},self.officer)
        self.assertEqual(data['status'],'ok')
        self.assertFalse(next(r for r in data['materials'] if r['document_id']=='command_contacts')['selectable'])
        self.assertFalse(next(r for r in data['materials'] if r['document_id']=='protected_resource')['selectable'])
        self.assertFalse(any(k in str(data) for k in ['govdoc://','public.txt','ticket','Bearer']))
    def test_opa_unavailable_cannot_replace_selection(self):
        self.assertEqual(self.select(['emergency_plan'])['status'],'ok')
        with patch.object(self.d.service.gateway.opa,'decide',side_effect=RuntimeError('unavailable')):
            self.assertEqual(self.select(['material_inventory'])['reason_code'],'P012_TASK_POLICY_UNAVAILABLE')
        self.assertEqual(self.d.chat.material_selections[self.session],['emergency_plan'])
        self.assertEqual(self.d.service.gateway.business_adapters.documents.read_count,0)
    def pending(self, approve=True):
        self.start(paths=['nativefs://workspace/A/a.txt'])
        action=dict(tool='native.read',operation='read',resource='nativefs://workspace/B/b.txt',
                    parameters={'path':'nativefs://workspace/B/b.txt'},data_level='internal',risk_level='low')
        self.payload=dict(run_id='r1',session_key=self.session,tool_call_id='native-first',tool_name='read',params={},action=action)
        r=self.d.chat.handle('chat_tool',self.payload);self.assertEqual(r['reason_code'],'P014_RESOURCE_OUTSIDE_TASK')
        rid=r['request_id'];r=self.d.handle('task_escalate',{'request_id':rid},self.officer)
        self.assertEqual(r['status'],'pending_approval')
        if approve:
            self.assertEqual(self.d.handle('resolve',{'request_id':rid,'resolution':'approve'},self.approver)['status'],'authorized')
        return rid
    def test_narrowing_selection_revokes_old_ticket_and_native_retry(self):
        rid=self.pending();old=copy.deepcopy(next(iter(self.d.chat.permits.values())))
        old_revision=self.d.service.gateway.task_policies.summary(old['request']['task_id'])['revision']
        self.d.chat.handle('chat_end',{'run_id':'r1'})
        self.assertEqual(self.select(['emergency_plan'])['status'],'ok')
        self.assertGreater(self.d.service.gateway.task_policies.summary(old['request']['task_id'])['revision'],old_revision)
        self.assertTrue(self.d.requests[rid]['scope_invalidated'])
        self.assertEqual(self.d.chat.retired_permits[-1]['ticket'],old['ticket'])
        self.assertFalse(self.d.chat.permits)
        # Even the privately saved original ticket cannot bypass the new scope.
        self.assertEqual(self.d.service.gateway.dispatch(old['request'],old['ticket'])['status'],'blocked')
        self.start('narrowed',paths=['nativefs://workspace/B/b.txt'])
        self.payload.update(run_id='narrowed',tool_call_id='old-approved-action')
        result=self.d.chat.handle('chat_tool',self.payload)
        reads=0;target=Path(self.temp.name)/'synthetic-native.txt';target.write_text('合成数据',encoding='utf8')
        if result['status']=='host_authorized':
            target.read_text(encoding='utf8');reads+=1
        self.assertEqual(reads,0)
        self.assertEqual(result['reason_code'],'P014_RESOURCE_OUTSIDE_TASK')
        self.assertEqual(self.d.handle('task_reapply',{'request_id':rid},self.officer)['reason_code'],'P023_TASK_SCOPE_CHANGED')
        self.assertEqual(self.d.handle('resolve',{'request_id':rid,'resolution':'approve'},self.approver)['reason_code'],'P023_TASK_SCOPE_CHANGED')
        self.assertEqual(self.d.service.gateway.business_adapters.documents.read_count,0)
    def test_scope_change_cannot_approve_old_pending_request(self):
        rid=self.pending(approve=False)
        self.d.chat.handle('chat_end',{'run_id':'r1'})
        self.assertEqual(self.select(['emergency_plan'])['status'],'ok')
        self.assertEqual(self.d.handle('resolve',{'request_id':rid,'resolution':'approve'},self.approver)['reason_code'],'P023_TASK_SCOPE_CHANGED')
        self.assertEqual(self.d.handle('task_escalate',{'request_id':rid},self.officer)['reason_code'],'P023_TASK_SCOPE_CHANGED')
        self.assertFalse(self.d.chat.permits)
        self.assertEqual(self.d.service.gateway.business_adapters.documents.read_count,0)
    def test_same_scope_keeps_approved_cross_run_retry(self):
        self.pending();self.d.chat.handle('chat_end',{'run_id':'r1'});self.start('same-scope')
        self.payload.update(run_id='same-scope',tool_call_id='approved-once')
        self.assertEqual(self.d.chat.handle('chat_tool',self.payload)['status'],'host_authorized')
        self.assertEqual(self.d.chat.handle('chat_tool',self.payload)['status'],'blocked')
    def test_rebinding_invalidates_pending_before_it_can_be_approved(self):
        rid=self.pending(approve=False)
        generation=self.d.chat.scope_generations[self.session]
        self.d.chat.handle('chat_end',{'run_id':'r1'})
        self.assertEqual(self.d.handle('bind_session',{'session_key':self.session},self.officer)['status'],'ok')
        self.assertGreater(self.d.chat.scope_generations[self.session],generation)
        self.assertEqual(self.d.handle('resolve',{'request_id':rid,'resolution':'approve'},self.approver)['reason_code'],'P023_TASK_SCOPE_CHANGED')
        self.start('rebound',paths=['nativefs://workspace/A/a.txt'])
        self.payload.update(run_id='rebound')
        self.assertEqual(self.d.chat.handle('chat_tool',self.payload)['reason_code'],'P014_RESOURCE_OUTSIDE_TASK')
        self.assertFalse(self.d.chat.permits)
        self.assertEqual(self.d.service.gateway.business_adapters.documents.read_count,0)
    def test_rebinding_invalidates_old_signed_ticket(self):
        rid=self.pending();old=copy.deepcopy(next(iter(self.d.chat.permits.values())))
        self.d.chat.handle('chat_end',{'run_id':'r1'})
        fresh=self.login('office-test')
        self.assertEqual(self.d.handle('bind_session',{'session_key':self.session},fresh)['status'],'ok')
        self.assertEqual(self.d.service.gateway.dispatch(old['request'],old['ticket'])['status'],'blocked')
        self.assertTrue(self.d.requests[rid]['scope_invalidated'])
        self.assertEqual(self.d.chat.retired_permits[-1]['ticket'],old['ticket'])
    def test_logout_revokes_contract_without_reauthenticating_old_bearer(self):
        rid=self.pending();old=copy.deepcopy(next(iter(self.d.chat.permits.values())))
        self.assertEqual(self.d.handle('revoke',{},self.officer)['status'],'ok')
        self.assertNotIn(self.session,self.d.chat.sessions)
        self.assertEqual(self.d.service.gateway.dispatch(old['request'],old['ticket'])['status'],'blocked')
        self.assertEqual(self.d.handle('resolve',{'request_id':rid,'resolution':'approve'},self.approver)['reason_code'],'P023_TASK_SCOPE_CHANGED')
        self.assertEqual(self.d.service.gateway.business_adapters.documents.read_count,0)
    def test_revocation_failure_does_not_bind_new_identity_or_keep_live_scope(self):
        rid=self.pending()
        with patch.object(self.d.service.gateway.task_policies,'tighten',side_effect=RuntimeError('unavailable')):
            result=self.d.handle('bind_session',{'session_key':self.session},self.officer)
        self.assertEqual(result['reason_code'],'P012_TASK_POLICY_UNAVAILABLE')
        self.assertNotIn(self.session,self.d.chat.sessions)
        self.assertFalse(self.d.chat.permits)
        self.assertTrue(self.d.requests[rid]['scope_invalidated'])
        self.assertEqual(self.d.chat.handle('chat_tool',self.payload)['status'],'blocked')
    def test_expired_reapply_new_approval_and_old_ticket_stays_invalid(self):
        rid=self.pending();old=copy.deepcopy(next(iter(self.d.chat.permits.values())))
        expiry=self.d.requests[rid]['authorization_expires_at']
        self.assertEqual(self.d.handle('task_reapply',{'request_id':rid},self.officer)['status'],'blocked')
        self.d.chat.handle('chat_end',{'run_id':'r1'})
        with patch('time.time',return_value=expiry+1):
            renewed=self.d.handle('task_reapply',{'request_id':rid},self.officer)
            self.assertEqual(renewed['status'],'pending_approval',renewed)
            new_id=renewed['request_id'];self.assertNotEqual(new_id,rid)
            self.assertNotEqual(self.d.requests[new_id]['task_id'],self.d.requests[rid]['task_id'])
            self.assertEqual(self.d.handle('task_reapply',{'request_id':rid},self.officer)['status'],'blocked')
            self.assertEqual(self.d.handle('resolve',{'request_id':new_id,'resolution':'approve'},self.officer)['status'],'blocked')
            r=self.d.handle('resolve',{'request_id':new_id,'resolution':'approve'},self.approver)
            self.assertEqual(r['status'],'authorized',r)
            self.assertEqual(self.d.service.gateway.dispatch(old['request'],old['ticket'])['status'],'blocked')
            self.start('retry',paths=['nativefs://workspace/A/a.txt'])
            self.payload.update(run_id='retry',tool_call_id='approved-retry')
            self.assertEqual(self.d.chat.handle('chat_tool',self.payload)['status'],'host_authorized')
            self.d.chat.handle('chat_result',dict(run_id='retry',session_key=self.session,
                tool_call_id='approved-retry',tool_name='read',success=True))
            self.assertEqual(self.d.requests[new_id]['execution_status'],'succeeded')
            self.assertEqual(self.d.chat.handle('chat_tool',self.payload)['status'],'blocked')
            self.assertEqual(self.d.handle('task_reapply',{'request_id':new_id},self.officer)['status'],'blocked')
        self.assertEqual(len(self.d.chat.retired_permits),1)
        self.assertEqual(self.d.service.gateway.business_adapters.documents.read_count,0)
    def test_status_tool_mapping_and_extra_fields(self):
        self.start()
        payload=dict(run_id='r1',session_key=self.session,tool_call_id='status',
            tool_name='agentguard-notices__get_control_request_status',params={'control_request_id':'mcp-req-'+'a'*32})
        r=self.d.chat.handle('chat_tool',payload);self.assertEqual(r['status'],'host_authorized',r)
        payload['params']['subject']='admin'
        self.assertEqual(self.d.chat.handle('chat_tool',payload)['reason_code'],'P017_TOOL_OR_PATH_UNSUPPORTED')
    def test_hard_denial_has_no_reapplication(self):
        self.start();r=self.tool('command_contacts')
        self.assertEqual(self.d.handle('task_reapply',{'request_id':r['request_id']},self.officer)['status'],'blocked')
        self.assertEqual(self.d.service.gateway.business_adapters.documents.read_count,0)


if __name__=='__main__':unittest.main()
