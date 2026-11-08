"""U11 failure boundaries; actual OPA/JWT/ticket, synthetic host envelopes."""
import copy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'modules/agentguard-group2'))
from identity.demo_provider import DemoIdentity
from enforcement.tickets import compute_action_digest


class ChatFailures(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT/'local-validation')
        self.addCleanup(self.temp.cleanup)
        self.demo = DemoIdentity(self.temp.name)
        self.addCleanup(self.demo.disable)
        self.demo.handle('enable')
        self.office = 'Bearer '+self.demo.handle('login', {'user':'office-test'})['access_token']
        self.approver = 'Bearer '+self.demo.handle('login', {'user':'approver-test'})['access_token']
        self.session = 'agent:main:u11-unit'
        self.demo.handle('bind_session', {'session_key':self.session}, self.office)
        self.start = {'run_id':'run-a','session_key':self.session,'paths':['nativefs://workspace/A/test.txt']}
        self.assertEqual(self.demo.chat.handle('chat_start', self.start)['status'], 'ok')
        self.action = dict(tool='native.read',operation='read',resource='nativefs://workspace/A/test.txt',
            parameters={'path':'nativefs://workspace/A/test.txt','params_hash':'synthetic-hash'},data_level='internal',risk_level='low')
        self.payload = dict(run_id='run-a',session_key=self.session,tool_name='read',params={},action=self.action)
        self.gate = self.demo.service.gateway

    def test_no_scope_forged_rpc_and_changed_session(self):
        self.assertEqual(self.demo.handle('chat_start',self.start,self.office)['reason_code'],'DEMO_UNTRUSTED_FIELD')
        self.assertEqual(self.demo.handle('bind_session',dict(session_key=self.session,roles=['security_admin']),self.office)['reason_code'],'DEMO_UNTRUSTED_FIELD')
        for change in [{'run_id':'other'},{'session_key':'agent:main:other'}]:
            self.assertEqual(self.demo.chat.handle('chat_tool',self.payload|change)['reason_code'],'P001_CONTRACT_REQUIRED')
        original=self.demo.chat.handle('chat_start',self.start)
        retried=self.demo.chat.handle('chat_start',self.start|{'paths':['nativefs://workspace/B/secret.txt']})
        self.assertEqual(original,retried)
        task=self.gate.task_policies.summary(original['task_id'])
        self.assertEqual(task['resource_prefixes'],['nativefs://workspace/A/'])

    def test_opa_and_signer_failure(self):
        with patch.object(self.gate.opa,'decide',side_effect=RuntimeError('offline')):
            self.assertEqual(self.demo.chat.handle('chat_tool',self.payload)['reason_code'],'G001_OPA_UNAVAILABLE_FAIL_CLOSED')
        with patch.object(self.gate.tickets,'issue',side_effect=RuntimeError('signer offline')):
            self.assertEqual(self.demo.chat.handle('chat_tool',self.payload)['status'],'blocked')
        self.assertEqual(self.gate.business_adapters.documents.read_count,0)

    def pending(self):
        payload=copy.deepcopy(self.payload)
        payload['action']['resource']='nativefs://workspace/B/test.txt'
        payload['action']['parameters']['path']='nativefs://workspace/B/test.txt'
        denied=self.demo.chat.handle('chat_tool',payload)
        result=self.demo.handle('task_escalate',{'request_id':denied['request_id']},self.office)
        self.assertEqual(result['status'],'pending_approval')
        return payload,denied['request_id']

    def test_ticket_expiry_and_rebinding_revoke(self):
        payload,rid=self.pending()
        self.assertEqual(self.demo.handle('resolve',{'request_id':rid,'resolution':'approve'},self.approver)['status'],'authorized')
        saved=next(iter(self.demo.chat.permits.values()))
        original=self.gate.tickets._verify_envelope(saved['ticket'])
        saved['ticket']=self.gate.tickets.issue(saved['request']['task_id'],compute_action_digest(saved['request']),
            ttl_seconds=-1,scope=original['scope'])
        self.assertEqual(self.demo.chat.handle('chat_tool',payload)['reason_code'],'G204_TICKET_EXPIRED')
        self.demo.handle('bind_session',{'session_key':self.session},self.office)
        self.assertEqual(self.demo.chat.handle('chat_tool',payload)['reason_code'],'P001_CONTRACT_REQUIRED')
        self.assertFalse(self.demo.chat.permits)

    def test_tightening_and_approval_expiry(self):
        payload,rid=self.pending()
        request=self.demo.snapshots[rid]
        self.assertEqual(self.demo.handle('resolve',{'request_id':rid,'resolution':'approve'},self.approver)['status'],'authorized')
        policy=self.gate.task_policies
        with policy.connection() as db:
            body=policy._load(db,request['task_id'])
            body['approvals'][compute_action_digest(request)]['expires_at']=0
            policy._save(db,body)
        self.assertEqual(self.demo.chat.handle('chat_tool',payload)['reason_code'],'P009_SCOPE_CONSUMED_OR_EXPIRED')
        self.assertEqual(self.gate.business_adapters.documents.read_count,0)

    def test_audit_has_no_credentials_or_content(self):
        self.demo.chat.handle('chat_tool',self.payload)
        logs='\n'.join(p.read_text(encoding='utf-8') for p in Path(self.temp.name).rglob('*.jsonl'))
        self.assertNotIn(self.office,logs)
        self.assertNotIn(self.approver,logs)
        self.assertIn('scope_digest',logs)
        self.assertIn('demo_idp_verified_jwt',logs)
        self.assertNotIn('document_content',logs)


if __name__=='__main__':
    unittest.main(verbosity=2)
