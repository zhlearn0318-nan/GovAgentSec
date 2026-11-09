"""U4b: real local RS256 + OidcVerifier + OPA + HMAC + isolated adapters."""
import copy
import hashlib
import json
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import jwt

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'modules/agentguard-group2'))
from identity.demo_provider import DemoIdentity, LABEL, ISSUER, AUDIENCE
from identity.oidc import OidcIdentityError


class DemoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'local-validation')
        self.addCleanup(self.temp.cleanup)
        self.demo = DemoIdentity(self.temp.name)
        self.addCleanup(self.demo.disable)

    def enable(self):
        self.assertFalse(self.demo.status()['enabled'])
        self.assertTrue(self.demo.handle('enable')['enabled'])
        self.office = self.login('approver-test')
        self.finance = self.login('finance-test')
        self.approver = self.login('maintenance-test')

    def login(self, user):
        result = self.demo.handle('login', {'user': user})
        self.assertFalse(result['production_oidc'])
        self.assertEqual(result['label'], LABEL)
        return 'Bearer ' + result['access_token']

    def submit(self, bearer=None, scenario='notice'):
        return self.demo.handle('invoke', {'scenario': scenario}, bearer or self.office)

    def resolve(self, request, bearer=None):
        return self.demo.handle('resolve', {'request_id': request['request_id'], 'resolution': 'approve'}, bearer or self.approver)

    def test_default_off_and_revocation(self):
        for operation in ['invoke', 'resolve', 'login']:
            self.assertEqual(self.demo.handle(operation)['reason_code'], 'DEMO_IDENTITY_DISABLED')
        self.enable()
        old = self.office
        pending = self.submit()
        self.demo.handle('disable')
        self.assertFalse(self.demo.status(old)['execution_enabled'])
        self.assertEqual(self.resolve(pending)['reason_code'], 'DEMO_IDENTITY_DISABLED')
        self.demo.handle('enable')
        self.assertEqual(self.submit(old)['http_status'], 401)
        self.assertEqual(self.demo._counts(), {'notices': 0, 'payments': 0})

    def test_login_lasts_thirty_minutes_and_extends_source_only(self):
        self.demo.handle('enable')
        self.demo.expires_at = time.time() + 5
        result = self.demo.handle('login', {'user': 'office-test'})
        claims = jwt.decode(result['access_token'], options={'verify_signature': False})
        self.assertEqual(claims['exp'] - claims['iat'], 1800)
        self.assertEqual(result['expires_at'], claims['exp'])
        self.assertGreaterEqual(self.demo.expires_at, claims['exp'])
        self.assertTrue(self.demo.status('Bearer ' + result['access_token'])['execution_enabled'])
        expiry = self.demo.expires_at
        denied = self.demo.handle('login', {'account': 'jingban', 'password': 'wrong'})
        self.assertEqual(denied['reason_code'], 'DEMO_LOGIN_FAILED')
        self.assertEqual(self.demo.expires_at, expiry)
        expired_claims = {**claims, 'iat': int(time.time()) - 1801, 'exp': int(time.time()) - 1}
        expired = jwt.encode(expired_claims, self.demo.key, algorithm='RS256', headers={'kid': self.demo.kid})
        self.demo.delegations[hashlib.sha256(expired.encode()).hexdigest()] = claims['sub']
        self.assertFalse(self.demo.status('Bearer ' + expired)['execution_enabled'])

    def test_notice_two_users_and_replay(self):
        self.enable()
        pending = self.submit()
        self.assertEqual(pending['status'], 'pending_approval')
        self.assertIn('A001_HIGH_RISK', pending['policy_reason_codes'])
        self.assertEqual(self.demo._counts()['notices'], 0)
        self.assertEqual(self.resolve(pending, self.office)['reason_code'], 'D105_SELF_APPROVAL')
        self.assertEqual(self.resolve(pending, self.finance)['reason_code'], 'A403_APPROVER_ROLE_REQUIRED')
        self.assertEqual(self.demo._counts()['notices'], 0)
        approved = self.resolve(pending)
        self.assertEqual(approved['status'], 'executed_isolated')
        self.assertEqual(self.demo._counts()['notices'], 1)
        replay = self.resolve(pending)
        self.assertEqual(replay['reason_code'], 'A409_ALREADY_RESOLVED')
        self.assertEqual(replay['status'], 'blocked')
        self.assertFalse(replay['executed'])
        self.assertEqual(self.demo._counts()['notices'], 1)

    def test_finance_role_and_ordinary_denial(self):
        self.enable()
        denied = self.submit(self.office, 'payment')
        self.assertIn('D003_ROLE_FORBIDDEN', denied['policy_reason_codes'])
        self.assertEqual(self.demo._counts()['payments'], 0)
        pending = self.submit(self.finance, 'payment')
        self.assertEqual(pending['status'], 'pending_approval')
        self.assertEqual(self.resolve(pending, self.finance)['reason_code'], 'D105_SELF_APPROVAL')
        self.assertEqual(self.resolve(pending)['status'], 'executed_isolated')
        self.assertEqual(self.demo._counts()['payments'], 1)

    def test_reject_forged_body_gateway_token_and_modified_jwt(self):
        self.enable()
        pending = self.submit()
        for field in ['subject', 'roles', 'approver_roles', 'clearance', 'request', 'resource', 'approval', 'ticket']:
            forged = self.demo.handle('resolve', {'request_id': pending['request_id'], field: 'forged'}, self.office)
            self.assertEqual(forged['http_status'], 403)
        for bad in [None, 'Bearer gateway-admin-token', self.office[:-10]+'ABCDEFGHIJ']:
            self.assertEqual(self.resolve(pending, bad or 'invalid')['http_status'], 401)
        # Verify the existing service boundary itself, not just the UI envelope.
        original = next(iter(self.demo.service._pending_oidc_approvals.values()))
        response = self.demo.service.resolve_approval_authenticated(dict(request=original,
            resolution='approve', approver_roles=['business_approver']), self.finance)
        self.assertEqual(response['reason_code'], 'A403_APPROVER_ROLE_REQUIRED')
        self.assertEqual(self.demo._counts()['notices'], 0)

    def test_jwt_claims_and_algorithm_boundaries(self):
        self.enable()
        claims = jwt.decode(self.office.removeprefix('Bearer '), options={'verify_signature': False})
        verifier = self.demo.service.verifier
        for changes in [{'exp': int(time.time())-1}, {'aud': 'production'}, {'iss': 'https://org.invalid'},
                        {'amr': []}, {'realm_access': {'roles': []}}, {'clearance': 99},
                        {'department': ''}, {'scope': ''}, {'azp': ''}]:
            token = jwt.encode({**claims, **changes}, self.demo.key, algorithm='RS256', headers={'kid': self.demo.kid})
            with self.assertRaises(OidcIdentityError):
                verifier.authenticate_request({}, 'Bearer '+token)
        forged = jwt.encode(claims, 'untrusted-demo-secret-long-enough', algorithm='HS256', headers={'kid': self.demo.kid})
        with self.assertRaises(OidcIdentityError):
            verifier.verify_token(forged)

    def test_configuration_checker_never_calls_demo_production(self):
        from check_identity import check
        config = {'mcp': {'servers': {'agentguard-notices': {'env': {
            'AGENTGUARD_MCP_IDENTITY_MODE': 'oidc', 'AGENTGUARD_MCP_TOKEN_FILE': 'synthetic-reference'}}}}}
        result = check(config, {'AGENTGUARD_OIDC_ENABLED': 'true', 'AGENTGUARD_OIDC_ISSUER': ISSUER,
                                'AGENTGUARD_OIDC_AUDIENCE': AUDIENCE})
        self.assertFalse(result['configured'])
        self.assertEqual(result['identity_kind'], 'demo_idp_non_production')
        self.assertFalse(result['demo_identity']['production_configured'])

    def test_metadata_is_in_process_and_version_is_never_production(self):
        with patch('urllib.request.urlopen', side_effect=AssertionError('network prohibited')), \
             patch('urllib.request.OpenerDirector.open', side_effect=AssertionError('network prohibited')):
            self.enable()
            self.assertIn('jwks=ok', self.demo.service.verifier.readiness())
            self.assertEqual(self.demo.subject(self.office)['identity_source'], 'demo_idp_verified_jwt')
        version = self.demo.service.version_payload()
        self.assertTrue(version['demo_identity'])
        self.assertFalse(version['production_oidc'])

    def test_digest_mutation_concurrent_resolution(self):
        self.enable()
        pending = self.submit()
        original = next(iter(self.demo.service._pending_oidc_approvals.values()))
        for changes in [{'resource': 'demo://other'}, {'data_level': 'public'}, {'parameters': {'recipient': 'other'}}]:
            forged = copy.deepcopy(original)
            forged['action'].update(changes)
            result = self.demo.service.resolve_approval_authenticated(dict(request=forged, resolution='approve'), self.approver)
            self.assertEqual(result['reason_code'], 'A409_VERIFIED_PENDING_REQUIRED')
            self.assertEqual(self.demo._counts()['notices'], 0)
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: self.resolve(pending), range(4)))
        self.assertEqual(sum(r['executed'] for r in results), 1)
        self.assertEqual(self.demo._counts()['notices'], 1)

    def test_expiry_opa_failure_and_audit_redaction(self):
        self.enable()
        with patch.object(self.demo.service.gateway.opa, 'decide', side_effect=RuntimeError('offline')):
            self.assertEqual(self.submit()['status'], 'blocked')
        self.assertEqual(self.demo._counts()['notices'], 0)
        self.demo.expires_at = time.time()-1
        self.assertEqual(self.submit()['reason_code'], 'DEMO_IDENTITY_DISABLED')
        audit = (Path(self.temp.name)/'identity-audit.jsonl').read_text(encoding='utf-8')
        self.assertIn('demo_identity.enabled', audit)
        self.assertIn('demo_identity.disabled', audit)
        self.assertIn('演示身份源（非生产）', audit)
        self.assertNotIn('组织身份已启用', audit)
        self.assertNotIn(self.office.removeprefix('Bearer '), audit)
        self.assertNotIn('PRIVATE KEY', audit)


if __name__ == '__main__':
    unittest.main(verbosity=2)
