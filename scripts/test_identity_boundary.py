import copy
import sys
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'modules/agentguard-group2'))
from service.app import AgentGuardService
from identity import OidcIdentityError
from enforcement import compute_action_digest

class Verifier:
    def __init__(self,roles=None): self.roles=roles or ['business_approver']
    def authenticate_request(self,request,authorization):
        if authorization!='Bearer verified-test-user': raise OidcIdentityError('I001_TEST_REJECTED','missing/invalid bearer')
        result=copy.deepcopy(request)
        result['subject']={'id':'verified-approver','roles':self.roles}
        return result

def service(oidc=True):
    instance=object.__new__(AgentGuardService)
    instance.config=SimpleNamespace(oidc_enabled=oidc,allow_development_identity=False)
    instance.verifier=Verifier()
    instance._approval_lock=threading.Lock()
    instance._pending_oidc_approvals={}
    instance.resolve_approval=Mock(return_value={'status':'rejected','http_status':200})
    instance.gateway=Mock()
    return instance

class IdentityBoundaryTests(unittest.TestCase):
    def test_default_development_execution_is_disabled(self):
        s=service(False)
        self.assertEqual(s.invoke({'subject':{'roles':['admin']}},None)['http_status'],503)
        self.assertEqual(s.resolve_approval_authenticated({'approver_id':'admin'},None)['http_status'],503)
        s.gateway.invoke.assert_not_called();s.resolve_approval.assert_not_called()

    def test_forged_body_roles_cannot_replace_bearer(self):
        s=service()
        result=s.resolve_approval_authenticated({'request':{},'approver_id':'admin','approver_roles':['business_approver']},None)
        self.assertEqual(result['http_status'],401);s.resolve_approval.assert_not_called()

    def test_verified_ordinary_user_cannot_supply_approver_role(self):
        s=service();s.verifier=Verifier(['employee'])
        result=s.resolve_approval_authenticated({'request':{},'approver_roles':['business_approver']},'Bearer verified-test-user')
        self.assertEqual(result['http_status'],403);s.resolve_approval.assert_not_called()

    def test_unknown_pending_request_cannot_be_approved(self):
        s=service()
        result=s.resolve_approval_authenticated({'request':{'task_id':'fake','action':{'tool':'database.query','parameters':{}}}},'Bearer verified-test-user')
        self.assertEqual(result['http_status'],409);s.resolve_approval.assert_not_called()

    def test_original_requester_and_signed_approver_override_forged_body(self):
        s=service()
        original={'task_id':'task-a','subject':{'id':'requester'},'action':{'tool':'database.query','parameters':{'limit':1}}}
        s._pending_oidc_approvals[('task-a',compute_action_digest(original))]=copy.deepcopy(original)
        forged=copy.deepcopy(original);forged['subject']['id']='attacker-controlled'
        s.resolve_approval_authenticated({'request':forged,'resolution':'reject','approver_id':'spoof','approver_roles':['admin']},'Bearer verified-test-user')
        args=s.resolve_approval.call_args.args
        self.assertEqual(args[0]['subject']['id'],'requester')
        self.assertEqual(args[2],'verified-approver');self.assertEqual(args[3],['business_approver'])

if __name__=='__main__':unittest.main()
