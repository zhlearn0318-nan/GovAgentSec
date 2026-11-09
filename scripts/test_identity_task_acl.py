"""U10 real local JWT/OPA/contract/ticket/adapter tests; synthetic documents only."""
import copy
import json
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'modules/agentguard-group2'))
from identity.demo_provider import DemoIdentity, DIRECTORIES
from enforcement.documents import document_action
from enforcement.task_policy import TaskPolicyError
from enforcement.tickets import compute_action_digest


class IdentityTaskAcl(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'local-validation')
        self.addCleanup(self.temp.cleanup)
        self.demo = DemoIdentity(self.temp.name)
        self.addCleanup(self.demo.disable)
        self.assertFalse(self.demo.status()['enabled'])
        for op in ['task_create', 'task_read', 'task_escalate', 'resolve']:
            self.assertEqual(self.demo.handle(op)['reason_code'], 'DEMO_IDENTITY_DISABLED')
        self.demo.handle('enable')
        self.office = self.login('approver-test')
        self.approver = self.login('maintenance-test')
        self.auditor = self.login('auditor-test')
        self.gate = self.demo.service.gateway
        self.policies = self.gate.task_policies
        self.task = self.demo.handle('task_create', {'directory':'A'}, self.office)['task_id']

    def login(self, user):
        return 'Bearer ' + self.demo.handle('login', {'user':user})['access_token']

    def read(self, doc='material_inventory'):
        return self.demo.handle('task_read', {'task_id':self.task,'document_id':doc}, self.office)

    def request(self, doc='material_inventory'):
        req = self.demo.task_request(self.task, document_action(doc))
        return self.demo.service.verifier.authenticate_request(req, self.office)

    def pending(self):
        denied = self.read()
        self.assertEqual(denied['reason_code'], 'P014_RESOURCE_OUTSIDE_TASK')
        result = self.demo.handle('task_escalate', {'request_id':denied['request_id']}, self.office)
        self.assertEqual(result['status'], 'pending_approval', result)
        return result

    def resolve(self, pending, bearer=None):
        return self.demo.handle('resolve', {'request_id':pending['request_id'],'resolution':'approve'}, bearer or self.approver)

    def count(self):
        return self.gate.business_adapters.documents.read_count

    def test_a_visible_b_denied_explicit_approval_once_and_audit(self):
        state = self.demo.status(self.office)
        self.assertEqual(state['tasks'][0]['available_documents'], ['emergency_plan'])
        self.assertEqual(self.read('emergency_plan')['status'], 'executed_isolated')
        self.assertEqual(self.count(), 1)
        pending = self.pending()
        self.assertEqual(self.count(), 1)
        self.assertEqual(self.resolve(pending, self.office)['reason_code'], 'D105_SELF_APPROVAL')
        self.assertEqual(self.count(), 1)
        approved = self.resolve(pending)
        self.assertTrue(approved['executed'], approved)
        self.assertEqual(self.count(), 2)
        self.assertTrue(approved['receipt_id'])
        self.assertEqual(self.resolve(pending)['reason_code'], 'A409_ALREADY_RESOLVED')
        self.assertEqual(self.read()['reason_code'], 'P009_SCOPE_CONSUMED_OR_EXPIRED')
        self.assertEqual(self.count(), 2)
        self.assertEqual(self.policies.summary(self.task)['resource_prefixes'], [DIRECTORIES['A']])
        audit = (Path(self.temp.name)/'identity-audit.jsonl').read_text(encoding='utf8')
        for word in ['P014_RESOURCE_OUTSIDE_TASK','D105_SELF_APPROVAL','scope_digest','receipt_id','demo_idp_verified_jwt']:
            self.assertIn(word, audit)
        for secret in [self.office[7:], 'PRIVATE KEY', 'document_content', '组织身份已启用']:
            self.assertNotIn(secret, audit)

    def test_auditor_read_only_and_default_disable(self):
        state = self.demo.status(self.auditor)
        self.assertEqual(state['user']['id'], 'auditor-test')
        self.assertFalse(state['execution_enabled'])
        self.assertTrue(state['audit'])
        for operation, payload in [('task_create',{}), ('invoke',{'scenario':'notice'}), ('task_read',{'task_id':self.task,'document_id':'emergency_plan'}), ('resolve',{'request_id':'x'})]:
            self.assertEqual(self.demo.handle(operation,payload,self.auditor)['reason_code'], 'DEMO_AUDITOR_READ_ONLY')
        # Bypassing the demo presentation cannot manufacture a permitted OPA role.
        self.assertEqual(self.demo.service.invoke(self.request('emergency_plan'), self.auditor)['status'],'blocked')
        self.assertEqual(self.count(),0)
        self.demo.disable()
        self.assertFalse(self.demo.status(self.office)['execution_enabled'])
        self.assertEqual(self.read()['reason_code'],'DEMO_IDENTITY_DISABLED')

    def test_missing_identity_forged_fields_and_other_owner(self):
        for bearer in [None, 'Bearer gateway-admin']:
            self.assertEqual(self.demo.handle('task_create',{},bearer)['http_status'],401)
        for key in ['subject','roles','resource','resource_prefixes','approval','ticket','clearance']:
            result=self.demo.handle('task_read',{'task_id':self.task,'document_id':'emergency_plan',key:'forged'},self.office)
            self.assertEqual(result['http_status'],403)
        req=self.request('emergency_plan')
        req['subject']['id']='other'
        self.assertEqual(self.gate.invoke(req)['reason_code'],'P002_SUBJECT_MISMATCH')
        self.assertEqual(self.count(),0)

    def test_scopes_only_tighten_and_old_ticket_invalid(self):
        req=self.request('emergency_plan')
        ticket=self.gate.authorize(req)['ticket']
        for prefixes in [[DIRECTORIES['B']], ['govdoc://demo/']]:
            with self.assertRaises(TaskPolicyError):
                self.policies.tighten(self.task,'approver-test',['file.read'],prefixes)
        self.policies.tighten(self.task,'approver-test',['file.read'],[])
        self.assertEqual(self.gate.dispatch(req,ticket)['reason_code'],'P011_CONTRACT_CHANGED')
        self.assertEqual(self.read('emergency_plan')['reason_code'],'P014_RESOURCE_OUTSIDE_TASK')
        self.assertEqual(self.count(),0)

    def test_prefix_boundary_and_invalid_paths(self):
        for prefix in ['C:/private/', '../', 'govdoc://demo/public', 'govdoc://demo/public/../internal/',
                       'govdoc://demo/public/%2e%2e/', 'govdoc://demo/public//', 'govdoc://demo/public/?x=1']:
            with self.assertRaises(TaskPolicyError):
                self.policies.create('bad-'+prefix, 'approver-test', prefixes=[prefix])
        contract=self.policies.summary(self.task)
        self.assertFalse(self.policies.resource_allowed(contract,{'tool':'file.read','resource':'govdoc://demo/publicity/x'}))
        for doc in ['../public.txt','C:\\private.txt','unknown']:
            self.assertEqual(self.read(doc)['reason_code'],'G016_DOCUMENT_UNAVAILABLE')
        self.assertEqual(self.count(),0)

    def test_tool_outside_scope_hard_denied(self):
        self.policies.tighten(self.task,'approver-test',[],[DIRECTORIES['A']])
        self.assertEqual(self.read('emergency_plan')['reason_code'],'P015_TOOL_OUTSIDE_TASK')
        self.assertEqual(self.count(),0)

    def test_no_implicit_approval_and_opa_denials_not_overridden(self):
        denied=self.read()
        self.assertEqual(self.resolve(denied)['reason_code'],'A409_VERIFIED_PENDING_REQUIRED')
        for doc,code in [('command_contacts','D004_CLEARANCE_INSUFFICIENT'),('protected_resource','D005_PROTECTED_RESOURCE')]:
            denied=self.read(doc)
            self.assertIn(code,denied['policy_reason_codes'])
            self.assertEqual(self.demo.handle('task_escalate',{'request_id':denied['request_id']},self.office)['status'],'blocked')
        self.assertEqual(self.count(),0)

    def test_changed_snapshot_and_concurrent_approval(self):
        pending=self.pending()
        original=self.demo.snapshots[pending['request_id']]
        for changes in [{'resource':'govdoc://demo/public/typhoon'},{'data_level':'public'}, {'parameters':{'document_id':'emergency_plan'}}]:
            forged=copy.deepcopy(original);forged['action'].update(changes)
            result=self.demo.service.resolve_approval_authenticated({'request':forged,'resolution':'approve'},self.approver)
            self.assertEqual(result['reason_code'],'A409_VERIFIED_PENDING_REQUIRED')
        self.assertEqual(self.count(),0)
        with ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(lambda _:self.resolve(pending),range(4)))
        self.assertEqual(sum(r['executed'] for r in results),1)
        self.assertEqual(self.count(),1)

    def test_ticket_expiry_replay_and_scope_binding(self):
        req=self.request('emergency_plan')
        auth=self.gate.authorize(req,ttl_seconds=-1)
        self.assertEqual(self.gate.dispatch(req,auth['ticket'])['reason_code'],'G204_TICKET_EXPIRED')
        self.assertEqual(self.count(),0)
        auth=self.gate.authorize(req)
        envelope=self.gate.tickets._verify_envelope(auth['ticket'])
        self.assertEqual(envelope['scope']['scope_digest'],self.policies.summary(self.task)['scope_digest'])
        forged=copy.deepcopy(req);forged['action']=document_action('material_inventory')
        self.assertEqual(self.gate.dispatch(forged,auth['ticket'])['reason_code'],'G205_TICKET_BINDING_MISMATCH')
        self.assertEqual(self.count(),0)
        with ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(lambda _:self.gate.dispatch(req,auth['ticket']),range(4)))
        self.assertEqual(sum(r['status']=='executed_isolated' for r in results),1)
        self.assertEqual(self.count(),1)

    def test_approval_expiry_revision_and_dependency_failure(self):
        pending=self.pending();req=self.request()
        self.policies.approve(req,'maintenance-test',['business_approver'])
        with self.policies.connection() as db:
            body=self.policies._load(db,self.task)
            body['approvals'][compute_action_digest(req)]['expires_at']=0
            self.policies._save(db,body)
        self.assertEqual(self.gate.invoke(req)['reason_code'],'P009_SCOPE_CONSUMED_OR_EXPIRED')
        self.policies.tighten(self.task,'approver-test',['file.read'],[])
        self.assertEqual(self.resolve(pending)['reason_code'],'P014_RESOURCE_OUTSIDE_TASK')
        with patch.object(self.gate.opa,'decide',side_effect=RuntimeError('offline')):
            self.assertEqual(self.read('emergency_plan')['reason_code'],'G001_OPA_UNAVAILABLE_FAIL_CLOSED')
        self.assertEqual(self.count(),0)


if __name__=='__main__':
    unittest.main(verbosity=2)
