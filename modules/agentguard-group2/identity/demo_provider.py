"""Local, opt-in demonstration IdP. No HTTP issuer, production keys or network login.

Reuse Keycloak's fixed test claims and the existing OidcVerifier JWT/subject path.
The stdio worker is owned by the authenticated Control UI plugin, never an MCP tool.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import secrets
import sqlite3
import sys
import time
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from identity.oidc import OidcIdentityError, OidcVerifier
from enforcement.notifications import notice_action
from enforcement.documents import REGISTRY, document_action
from enforcement.task_policy import sensitive_values
from service.app import AgentGuardService
from service.config import ServiceConfig
from identity.chat_acl import ChatAcl

LABEL = '演示身份源（非生产）'
ISSUER = 'https://agentguard-demo.invalid/in-process'
AUDIENCE = 'agentguard-demo-only'
IDENTITY_SOURCE = 'demo_idp_verified_jwt'
ROOT = Path(__file__).resolve().parents[1]
USER_LABELS = {'office-test': '经办', 'finance-test': '财务 / 高风险操作者', 'approver-test': '处长审批', 'auditor-test': '审计（只读）'}
DIRECTORIES = {'A': 'govdoc://demo/public/', 'B': 'govdoc://demo/internal/'}


def demo_users():
    realm = json.loads((ROOT / 'identity/keycloak/agentguard-realm.json').read_text(encoding='utf-8'))
    return {u['username']: dict(id=u['username'], label=USER_LABELS[u['username']],
        department=u['attributes']['department'][0], clearance=int(u['attributes']['clearance'][0]),
        roles=u['realmRoles'], mfa=True, amr=['mfa'], mfa_synthetic=True)
        for u in realm['users'] if u['username'] in USER_LABELS}


class _MemoryJwks(jwt.PyJWKClient):
    def __init__(self, keys):
        super().__init__(ISSUER + '/jwks', cache_jwk_set=False)
        self.keys = keys

    def fetch_data(self):
        return self.keys


class DemoVerifier(OidcVerifier):
    """Only metadata/key transport is in memory; verification remains inherited."""
    def __init__(self, jwks, delegations=None):
        super().__init__(ISSUER, AUDIENCE, require_mfa=True, require_https=True,
                         reject_redirects=True, required_scope='agentguard.demo', require_client_binding=True)
        self.jwk_client = _MemoryJwks(jwks)
        self.delegations = delegations

    def verify_token(self, token):
        claims = super().verify_token(token)
        if self.delegations is not None and hashlib.sha256(token.encode()).hexdigest() not in self.delegations:
            raise OidcIdentityError('DEMO_DELEGATION_REVOKED', '当前用户委托已撤销，请重新登录')
        return claims

    def _read_json(self, url):
        if url == ISSUER + '/.well-known/openid-configuration':
            return {'issuer': ISSUER, 'jwks_uri': ISSUER + '/jwks'}
        if url == ISSUER + '/jwks' and hasattr(self, 'jwk_client'):
            return self.jwk_client.fetch_data()
        raise OidcIdentityError('DEMO_METADATA_REJECTED', '仅允许进程内演示元数据')

    def subject_from_claims(self, claims):
        subject = super().subject_from_claims(claims)
        subject['identity_source'] = IDENTITY_SOURCE
        return subject


class _DemoGuard(AgentGuardService):
    def __init__(self, verifier, state):
        self.demo_verifier = verifier
        super().__init__(ServiceConfig(opa_mode='cli', state_dir=str(state), enable_local_adapters=True,
            oidc_enabled=True, oidc_issuer=ISSUER, oidc_audience=AUDIENCE),
            environ={'AGENTGUARD_TICKET_SECRET_HEX': secrets.token_hex(32)})
        self.gateway.host_dispatch_enabled = True
        for tool, operation in [('native.read','read'),('file.write','write'),('shell.execute','execute')]:
            self.gateway.registry[(tool,operation)] = {'module':'database_query.wat','argument':'item_count'}

    def _build_verifier(self):
        return self.demo_verifier

    def version_payload(self):
        return {**super().version_payload(), 'identity_source': IDENTITY_SOURCE,
                'demo_identity': True, 'production_oidc': False, 'identity_label': LABEL}


class DemoIdentity:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.users = demo_users()
        self.service = None
        self.key = None
        self.expires_at = 0
        self.requests = {}
        self.tasks = {}
        self.snapshots = {}
        self.events = []
        self.chat = ChatAcl(self)
        self.delegations = {}

    def audit(self, event, **fields):
        entry = dict(at=datetime.now(timezone.utc).isoformat(), event=event,
                     identity_source=IDENTITY_SOURCE, label=LABEL, production_oidc=False, **fields)
        self.events.append(entry)
        with (self.directory / 'identity-audit.jsonl').open('a', encoding='utf-8') as file:
            file.write(json.dumps(entry, ensure_ascii=False) + '\n')

    def disable(self, reason='operator'):
        if self.service:
            self.audit('demo_identity.disabled', reason=reason)
            self.service.close()
        self.service = None
        self.key = None
        self.expires_at = 0
        self.requests = {}
        self.tasks = {}
        self.snapshots = {}
        self.chat = ChatAcl(self)
        self.delegations.clear()
        return self.status()

    def status(self, bearer=None):
        if self.service and time.time() >= self.expires_at:
            self.disable('activation_expired')
        subject = None
        reason = 'DEMO_IDENTITY_DISABLED' if not self.service else 'DEMO_DELEGATION_REQUIRED'
        if self.service and bearer:
            try:
                subject = self.subject(bearer)
                reason = 'DEMO_AUDITOR_READ_ONLY' if 'audit_reader' in subject['roles'] else 'DEMO_DELEGATION_ACTIVE'
            except OidcIdentityError as exc:
                reason = exc.code
        return dict(enabled=self.service is not None, label=LABEL, production_oidc=False,
            issuer_transport='in-process-rs256-jwks', default_enabled=False, mfa_synthetic=True,
            execution_enabled=subject is not None and 'audit_reader' not in subject['roles'], user=subject, expires_at=self.expires_at,
            users=list(self.users.values()), requests=list(self.requests.values()),
            tasks=self.task_summaries(subject), audit=self.events[-40:] if subject else [],
            chat_session_bindings=(len(self.chat.sessions) if subject else 0),
            delegation_reason=reason,
            gateway_login_is_business_identity=False)

    def revoke(self, bearer, subject):
        token = bearer.split(' ', 1)[1]
        self.delegations.pop(hashlib.sha256(token.encode()).hexdigest(), None)
        self.chat.revoke(bearer)
        self.audit('demo_identity.delegation_revoked', subject=subject['id'])
        return {'status':'ok','execution_enabled':False,'reason_code':'DEMO_DELEGATION_REVOKED',
                'label':LABEL,'production_oidc':False}

    def task_summaries(self, subject):
        if not subject or not self.service:
            return []
        result = []
        for task_id, owner in self.tasks.items():
            if owner != subject['id'] and not {'business_approver', 'audit_reader'}.intersection(subject['roles']):
                continue
            contract = self.service.gateway.task_policies.summary(task_id)
            visible = [doc_id for doc_id in REGISTRY if 'file.read' in contract['allowed_tools']
                       and self.service.gateway.task_policies.resource_allowed(contract, document_action(doc_id))]
            result.append({**contract, 'available_documents': visible})
        return result

    @staticmethod
    def task_request(task_id, action):
        return dict(request_id='demo-action-'+uuid.uuid4().hex, task_id=task_id,
            timestamp=datetime.now(timezone.utc).isoformat(), action=action,
            context=dict(enforcement_point='gateway', destination_zone='internal', business_hours=True,
                         repeat_count=0, identity_source=IDENTITY_SOURCE),
            environment={'sandbox': {'enabled': False, 'profile': ''}}, approval={})

    def task_operation(self, operation, payload, bearer, subject):
        if 'office_user' not in subject['roles']:
            self.audit('demo_identity.task_denied', subject=subject['id'], reason_code='DEMO_TASK_ROLE_REQUIRED')
            return self.blocked('DEMO_TASK_ROLE_REQUIRED')
        if operation == 'task_create':
            directory = payload.get('directory', 'A')
            if directory not in DIRECTORIES:
                return self.blocked('P003_INVALID_GRANT')
            task_id = 'demo-acl-'+uuid.uuid4().hex
            document_id = 'emergency_plan' if directory == 'A' else 'material_inventory'
            result = self.service.task_contract_authenticated(dict(operation='create', task_id=task_id,
                tools=['file.read'], resource_prefixes=[DIRECTORIES[directory]],
                user_values={'file.read': {'document_id':document_id}}), bearer)
            if result['status'] == 'ok':
                self.tasks[task_id] = subject['id']
                self.audit('demo_identity.task_created', subject=subject['id'], task_id=task_id,
                           scope_digest=result['contract']['scope_digest'])
            return {**result, 'task_id':task_id, 'label':LABEL, 'production_oidc':False}
        if operation == 'task_read':
            task_id = payload.get('task_id')
            if self.tasks.get(task_id) != subject['id']:
                return self.blocked('P002_SUBJECT_MISMATCH')
            try:
                action = document_action(payload.get('document_id'))
            except Exception:
                return self.blocked('G016_DOCUMENT_UNAVAILABLE')
            request = self.task_request(task_id, action)
            request_id = request['request_id']
            self.snapshots[request_id] = copy.deepcopy(request)
            result = self.service.invoke(request, bearer)
            contract = self.service.gateway.task_policies.summary(task_id)
            self.requests[request_id] = dict(request_id=request_id, task_id=task_id, requester=subject['id'],
                scenario='document', document_id=payload['document_id'], tool=action['tool'],
                data_level=action['data_level'], risk_level=action['risk_level'],
                scope_digest=contract['scope_digest'], resource_prefixes=contract['resource_prefixes'],
                ticket_ttl_seconds=30, approval_ttl_seconds=60,
                status=result['status'], reason_code=result.get('reason_code'),
                policy_reason_codes=result.get('policy_reason_codes', []))
        else:  # Explicit request, bound to an existing server-side denied action.
            request_id = payload.get('request_id')
            record = self.requests.get(request_id)
            request = self.snapshots.get(request_id)
            if not request or not record or record['requester'] != subject['id']:
                return self.blocked('P002_SUBJECT_MISMATCH')
            if record['status'] != 'blocked' or record.get('reason_code') not in {'P014_RESOURCE_OUTSIDE_TASK','P015_TOOL_OUTSIDE_TASK'}:
                return self.blocked('P010_PENDING_SNAPSHOT_REQUIRED')
            result = self.service.request_task_expansion_authenticated(copy.deepcopy(request), bearer)
            record.update(status=result['status'], reason_code=result.get('reason_code'))
        return self.safe_receipt(result, request_id, subject, operation)

    def safe_receipt(self, result, request_id, subject, operation):
        safe = {k: result[k] for k in ('status', 'http_status', 'reason_code', 'policy_reason_codes') if k in result}
        if result.get('http_status', 200) >= 400:
            safe['status'] = 'blocked'
        record = self.requests.get(request_id, {})
        safe.update(request_id=request_id, task_id=record.get('task_id', request_id), subject=subject['id'],
            label=LABEL, production_oidc=False, identity_source=IDENTITY_SOURCE,
            gateway_login_is_business_identity=False,
            executed=result['status']=='executed_isolated' and result.get('http_status',200)<400,
            counts=self._counts(), read_count=self.service.gateway.business_adapters.documents.read_count,
            scope_digest=record.get('scope_digest'), document_id=record.get('document_id'),
            receipt_id=(result.get('receipt') or {}).get('receipt_id'), external_delivery=False)
        self.audit('demo_identity.'+operation, **{k:v for k,v in safe.items() if k not in {'label','production_oidc','identity_source'}})
        return safe

    def subject(self, bearer):
        if not self.service:
            raise OidcIdentityError('DEMO_IDENTITY_DISABLED', '演示身份源未开启，执行与审批已禁用')
        return self.service.verifier.authenticate_request({}, bearer)['subject']

    @staticmethod
    def blocked(code, status=403):
        return dict(status='blocked', http_status=status, reason_code=code, label=LABEL,
                    production_oidc=False, identity_source=IDENTITY_SOURCE, executed=False)

    def _counts(self):
        if not self.service:
            return {'notices': 0, 'payments': 0}
        adapters = self.service.gateway.business_adapters
        dbfile = adapters.root / 'business/notice_outbox.sqlite'
        notices = 0
        if dbfile.exists():
            with closing(sqlite3.connect(dbfile)) as db:
                notices = db.execute('SELECT count(*) FROM notice_outbox').fetchone()[0]
        return {'notices': notices, 'payments': adapters.payment_count()}

    def handle(self, operation, payload=None, bearer=None):
        payload = payload or {}
        allowed = {'status': set(), 'enable': set(), 'disable': set(), 'login': {'user'},
                   'invoke': {'scenario'}, 'resolve': {'request_id', 'resolution'},
                   'task_create': {'directory'}, 'task_read': {'task_id','document_id'},
                   'task_escalate': {'request_id'}, 'bind_session': {'session_key'}, 'revoke': set()}
        if operation not in allowed or not isinstance(payload, dict) or set(payload) - allowed[operation]:
            self.audit('demo_identity.rejected', reason_code='DEMO_UNTRUSTED_FIELD')
            return self.blocked('DEMO_UNTRUSTED_FIELD')
        self.status()  # Enforce activation expiry on every operation.
        if operation == 'status':
            return self.status(bearer)
        if operation == 'disable':
            return self.disable()
        if operation == 'enable':
            if not self.service:
                self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
                self.kid = uuid.uuid4().hex
                public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key()))
                public.update(kid=self.kid, use='sig', alg='RS256')
                self.service = _DemoGuard(DemoVerifier({'keys': [public]}, self.delegations), self.directory / self.kid)
                self.expires_at = time.time() + 900
                self.audit('demo_identity.enabled', activation_id=self.kid, transport='in-process', mfa_synthetic=True)
            return self.status()
        if not self.service:
            return self.blocked('DEMO_IDENTITY_DISABLED')
        try:
            if operation == 'login':
                user = self.users.get(payload.get('user'))
                if not user:
                    return self.blocked('DEMO_USER_UNKNOWN')
                if bearer:
                    previous = self.subject(bearer)
                    self.revoke(bearer, previous)
                now = int(time.time())
                claims = dict(iss=ISSUER, aud=AUDIENCE, sub=user['id'], preferred_username=user['id'],
                    iat=now, exp=min(now+300, int(self.expires_at)), department=user['department'],
                    clearance=user['clearance'], realm_access={'roles': user['roles']}, amr=['mfa'],
                    azp='agentguard', scope='agentguard.demo', demo_identity=True, mfa_synthetic=True, jti=uuid.uuid4().hex)
                token = jwt.encode(claims, self.key, algorithm='RS256', headers={'kid': self.kid})
                self.delegations[hashlib.sha256(token.encode()).hexdigest()] = user['id']
                subject = self.subject('Bearer ' + token)  # Never trust even our own unverified claims.
                self.audit('demo_identity.login', subject=subject['id'])
                return dict(access_token=token, token_type='Bearer', expires_at=claims['exp'], user=subject,
                            label=LABEL, production_oidc=False, mfa_synthetic=True)
            subject = self.subject(bearer)
            if operation == 'revoke':
                return self.revoke(bearer, subject)
            if 'audit_reader' in subject['roles']:
                self.audit('demo_identity.read_only_denied', subject=subject['id'], reason_code='DEMO_AUDITOR_READ_ONLY')
                return self.blocked('DEMO_AUDITOR_READ_ONLY')
            if operation == 'bind_session':
                return self.chat.bind(payload.get('session_key'), bearer, subject)
            if operation.startswith('task_'):
                return self.task_operation(operation, payload, bearer, subject)
            if operation == 'invoke':
                scenario = payload.get('scenario', 'notice')
                if scenario == 'notice':
                    action = notice_action('duty_office', 'typhoon_notice')
                elif scenario == 'payment':
                    action = dict(tool='payment.transfer', operation='transfer', resource='erp://payments/demo-only',
                        parameters={'amount': 600, 'currency': 'CNY'}, risk_level='high', data_level='internal')
                else:
                    return self.blocked('DEMO_SCENARIO_UNKNOWN')
                task_id = 'demo-idp-' + uuid.uuid4().hex
                request = dict(request_id=task_id, task_id=task_id, timestamp=datetime.now(timezone.utc).isoformat(),
                    action=action, context=dict(enforcement_point='gateway', destination_zone='internal',
                        business_hours=True, repeat_count=0, identity_source=IDENTITY_SOURCE),
                    environment={'sandbox': {'enabled': False, 'profile': ''}}, approval={})
                contract = self.service.task_contract_authenticated(dict(operation='create', task_id=task_id,
                    user_values={action['tool']: sensitive_values(action)}), bearer)
                if contract.get('status') != 'ok':
                    return self.blocked(contract.get('reason_code', 'DEMO_CONTRACT_FAILED'))
                result = self.service.invoke(request, bearer)
                self.requests[task_id] = dict(request_id=task_id, requester=subject['id'], scenario=scenario,
                    tool=action['tool'], data_level=action['data_level'], risk_level=action['risk_level'],
                    status=result['status'], reason_code=result.get('reason_code'),
                    policy_reason_codes=result.get('policy_reason_codes', []))
            else:
                task_id = payload.get('request_id')
                record = self.requests.get(task_id)
                if not record:
                    return self.blocked('DEMO_REQUEST_UNKNOWN', 409)
                snapshot = self.snapshots.get(task_id)
                original = (copy.deepcopy(snapshot) if snapshot else
                    next((copy.deepcopy(r) for (task, _), r in self.service._pending_oidc_approvals.items()
                          if task == task_id), None))
                if original is None:
                    return self.blocked('A409_VERIFIED_PENDING_REQUIRED', 409)
                result = self.service.resolve_approval_authenticated(dict(request=original,
                    resolution=payload.get('resolution', 'approve'), note='演示身份源：仅合成数据人工确认'), bearer)
                if original.get('context', {}).get('host_acl'):
                    self.chat.approved(original, result)
                    if result.get('status') == 'authorized' and result.get('http_status') == 200:
                        record.update(status='authorized', approver=subject['id'])
                if result['status'] in {'executed_isolated', 'rejected', 'interrupted'} and result.get('http_status') != 409:
                    record.update(status=result['status'], approver=subject['id'])
            return self.safe_receipt(result, task_id, subject, operation)
        except OidcIdentityError as exc:
            self.audit('demo_identity.rejected', reason_code=exc.code)
            return self.blocked(exc.code, 401)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--state-dir', required=True, type=Path)
    args = parser.parse_args()
    demo = DemoIdentity(args.state_dir)
    try:
        for line in sys.stdin:
            envelope = {}
            try:
                envelope = json.loads(line)
                operation = envelope.get('operation', '')
                result = (demo.chat.handle(operation, envelope.get('payload') or {}) if operation.startswith('chat_')
                          else demo.handle(operation, envelope.get('payload'), envelope.get('bearer')))
            except Exception:
                demo.audit('demo_identity.error', reason_code='DEMO_DEPENDENCY_FAILED')
                demo.disable('dependency_failure')
                result = demo.blocked('DEMO_DEPENDENCY_FAILED', 503)
            print(json.dumps({'id': envelope.get('id'), 'result': result}, ensure_ascii=False), flush=True)
    finally:
        demo.disable('worker_exit')


if __name__ == '__main__':
    main()
