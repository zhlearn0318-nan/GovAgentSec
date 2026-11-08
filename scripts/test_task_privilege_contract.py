"""U7 monotonic task policy and scoped one-use ticket tests."""
import copy
import unittest
from concurrent.futures import ThreadPoolExecutor
from lib.behavior_constraint_fixture import GuardCase, notice_action
from enforcement.task_policy import TaskPolicyError
from enforcement.tickets import compute_action_digest


class Contracts(GuardCase):
    def test_default_readonly_and_no_overwrite_or_silent_expansion(self):
        self.assertEqual(self.policies.summary('synthetic-task')['allowed_tools'],['database.query','file.read'])
        for attempt in [lambda:self.policies.create('synthetic-task','synthetic-duty'),
                        lambda:self.policies.tighten('synthetic-task','synthetic-duty',['notification.submit'])]:
            with self.assertRaises(TaskPolicyError):attempt()

    def test_tightening_invalidates_issued_ticket(self):
        req=self.request();ticket=self.gate.authorize(req)['ticket']
        self.policies.tighten('synthetic-task','synthetic-duty',['database.query'])
        self.assertEqual(self.gate.dispatch(req,ticket)['reason_code'],'P011_CONTRACT_CHANGED')
        self.assertEqual(self.gate.business_adapters.documents.read_count,0)

    def test_subject_binding_and_replay(self):
        req=self.request();ticket=self.gate.authorize(req)['ticket']
        other=copy.deepcopy(req);other['subject']['id']='other'
        self.assertEqual(self.gate.dispatch(other,ticket)['status'],'blocked')
        self.assertEqual(self.gate.business_adapters.documents.read_count,0)
        ticket=self.gate.authorize(req)['ticket']
        with ThreadPoolExecutor(max_workers=6) as pool:
            results=list(pool.map(lambda _:self.gate.dispatch(req,ticket),range(6)))
        self.assertEqual(sum(r['status']=='executed_isolated' for r in results),1)
        self.assertEqual(self.gate.business_adapters.documents.read_count,1)

    def test_expiry_and_action_tamper(self):
        req=self.request();ticket=self.gate.authorize(req,ttl_seconds=-1)['ticket']
        self.assertEqual(self.gate.dispatch(req,ticket)['reason_code'],'G204_TICKET_EXPIRED')
        ticket=self.gate.authorize(req)['ticket']
        changed=copy.deepcopy(req);changed['action']['data_level']='secret'
        self.assertEqual(self.gate.dispatch(changed,ticket)['reason_code'],'G205_TICKET_BINDING_MISMATCH')
        self.assertEqual(self.gate.business_adapters.documents.read_count,0)

    def test_approval_does_not_expand_base_and_self_approval_denied(self):
        req=self.request(notice_action('duty_office','typhoon_notice'))
        self.gate.invoke(req)
        self.assertEqual(self.service.resolve_approval(req,'approve','synthetic-duty',['business_approver'])['reason_code'],'D105_SELF_APPROVAL')
        self.assertEqual(self.notice_count(),0)
        self.assertEqual(self.approve(req)['status'],'executed_isolated')
        self.assertNotIn('notification.submit',self.policies.summary('synthetic-task')['allowed_tools'])
        self.assertEqual(self.notice_count(),1)

    def test_scope_is_signed_and_requires_real_approval_credential(self):
        req=self.request(notice_action('duty_office','typhoon_notice'));self.gate.invoke(req)
        self.policies.approve(req,'synthetic-reviewer',['business_approver'])
        self.assertNotEqual(self.gate.invoke(req)['status'],'executed_isolated')
        req['approval']=self.gate.approvals.issue(req,compute_action_digest(req),'synthetic-reviewer',['business_approver'])
        authorization=self.gate.authorize(req)
        self.assertEqual(authorization['status'],'authorized',authorization)
        scope=self.gate.tickets._verify_envelope(authorization['ticket'])['scope']
        self.assertTrue(scope['expansion']);self.assertEqual(scope['subject_id'],'synthetic-duty')
        self.assertEqual(self.gate.dispatch(req,authorization['ticket'])['status'],'executed_isolated')
        self.assertEqual(self.gate.dispatch(req,authorization['ticket'])['status'],'blocked')
        self.assertEqual(self.notice_count(),1)

    def test_no_oidc_contract_api_cannot_authorize_values(self):
        self.assertEqual(self.service.task_contract_authenticated({'operation':'create','task_id':'fake'},'Bearer gateway-admin')['http_status'],403)
        self.assertFalse(self.policies.exists('fake'))

    def test_missing_contract_created_without_trusting_arguments(self):
        req=self.request();req['task_id']='new-synthetic-task'
        pending=self.gate.invoke(req)
        self.assertEqual(pending['status'],'pending_approval')
        self.assertEqual(pending['governance']['provenance']['document_id']['source'],'unknown')
        self.assertEqual(self.gate.business_adapters.documents.read_count,0)

    def test_expansion_expiry_and_tampered_snapshot(self):
        req=self.request(notice_action('duty_office','typhoon_notice'));self.gate.invoke(req)
        changed=copy.deepcopy(req);changed['action']['parameters']['recipient']='synthetic_external_office'
        with self.assertRaises(TaskPolicyError):self.policies.approve(changed,'synthetic-reviewer',['business_approver'])
        self.policies.approve(req,'synthetic-reviewer',['business_approver'])
        # Expire the trusted grant, not the request-supplied clock.
        with self.policies.connection() as db:
            body=self.policies._load(db,req['task_id'])
            body['approvals'][compute_action_digest(req)]['expires_at']=0
            self.policies._save(db,body)
        self.assertEqual(self.gate.invoke(req)['reason_code'],'P009_SCOPE_CONSUMED_OR_EXPIRED')
        self.assertEqual(self.notice_count(),0)

    def test_verified_contract_endpoint_binds_subject_and_only_tightens(self):
        from types import SimpleNamespace
        original=self.service.config
        self.service.config=SimpleNamespace(oidc_enabled=True)
        def authenticate(request, token):
            if token != 'Bearer verified-test-token':
                raise ValueError('test identity rejected')
            return {'subject':{'id':'verified-test-user'}}
        self.service.verifier=SimpleNamespace(authenticate_request=authenticate)
        self.addCleanup(setattr,self.service,'config',original)
        payload={'operation':'create','task_id':'verified-task','user_values':{'file.read':{'document_id':'emergency_plan'}}}
        result=self.service.task_contract_authenticated(payload,'Bearer verified-test-token')
        self.assertEqual(result['contract']['subject_id'],'verified-test-user')
        self.assertEqual(self.service.task_contract_authenticated({**payload,'subject':'forged'},'Bearer verified-test-token')['status'],'blocked')
        result=self.service.task_contract_authenticated({'operation':'tighten','task_id':'verified-task','tools':['notification.submit']},'Bearer verified-test-token')
        self.assertEqual(result['reason_code'],'P004_EXPANSION_REQUIRES_APPROVAL')

if __name__=='__main__':unittest.main()
