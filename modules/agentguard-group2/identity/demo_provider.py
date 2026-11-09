"""Local, opt-in demonstration IdP. No HTTP issuer, production keys or network login.

Reuse Keycloak's fixed test claims and the existing OidcVerifier JWT/subject path.
The stdio worker is owned by the authenticated Control UI plugin, never an MCP tool.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import hmac
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
from identity.tool_catalog import ToolCatalog
from identity.personal_confirmation import confirm as confirm_personal

LABEL = '演示身份源（非生产）'
ISSUER = 'https://agentguard-demo.invalid/in-process'
AUDIENCE = 'agentguard-demo-only'
IDENTITY_SOURCE = 'demo_idp_verified_jwt'
LOGIN_TTL_SECONDS = 30 * 60
ROOT = Path(__file__).resolve().parents[1]
USER_LABELS = {'office-test': '经办', 'finance-test': '财务 / 高风险操作者', 'approver-test': '处长审批', 'auditor-test': '审计（只读）'}
DIRECTORIES = {'A': 'govdoc://demo/public/', 'B': 'govdoc://demo/internal/'}


def demo_users():
    realm = json.loads((ROOT / 'identity/keycloak/agentguard-realm.json').read_text(encoding='utf-8'))
    users = {u['username']: dict(id=u['username'], label=USER_LABELS[u['username']], enabled=u.get('enabled', False),
        department=u['attributes']['department'][0], clearance=int(u['attributes']['clearance'][0]),
        roles=u['realmRoles'], mfa=True, amr=['mfa'], mfa_synthetic=True)
        for u in realm['users'] if u['username'] in USER_LABELS}
    # The three public demo accounts form a cumulative hierarchy. Existing
    # internal-only fixtures remain available to isolated security regressions.
    users['office-test'].update(label='基础经办', tier=1, tier_label='基础经办',
        clearance=0, roles=['office_user'])
    users['approver-test'].update(label='中级主管', tier=2, tier_label='中级主管',
        clearance=1, roles=['office_user', 'business_approver'])
    users['maintenance-test'] = dict(id='maintenance-test', label='高级管理员', enabled=True,
        department='演示维护', clearance=3, tier=3, tier_label='高级管理员',
        roles=['office_user', 'business_approver', 'workspace_maintainer', 'security_admin', 'finance_operator'],
        mfa=True, amr=['mfa'], mfa_synthetic=True)
    users['superadmin-test'] = {**users['maintenance-test'], 'id':'superadmin-test', 'label':'最高权限管理员'}
    return users


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
        self.gateway.demo_native_approval_subjects = frozenset({'maintenance-test','superadmin-test'})
        self.gateway.host_document_dispatch_enabled = True
        for tool, operation in [('native.read','read'),('file.write','write'),('shell.execute','execute')]:
            self.gateway.registry[(tool,operation)] = {'module':'database_query.wat','argument':'item_count'}

    def _build_verifier(self):
        return self.demo_verifier

    def version_payload(self):
        return {**super().version_payload(), 'identity_source': IDENTITY_SOURCE,
                'demo_identity': True, 'production_oidc': False, 'identity_label': LABEL}


class DemoIdentity:
    def __init__(self, directory, *, personal_confirmation=False):
        self.personal_confirmation = personal_confirmation
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.users = demo_users()
        self.accounts = json.loads((ROOT / 'identity/demo_accounts.json').read_text(encoding='utf-8'))['accounts']
        self.permission_policy = json.loads((ROOT / 'data/agent_guard.json').read_text(encoding='utf-8'))['agent_guard']
        for account in self.accounts:
            self.users[account['subject']]['account'] = account['account']
        self.service = None
        self.tool_catalog = None
        self.key = None
        self.expires_at = 0
        self.requests = {}
        self.tasks = {}
        self.snapshots = {}
        self.events = []
        self.trace_events = []
        self.trace_projection_failed = False
        self.chat = ChatAcl(self)
        self.delegations = {}

    def audit(self, event, **fields):
        entry = dict(audit_id=uuid.uuid4().hex, at=datetime.now(timezone.utc).isoformat(), event=event,
                     identity_source=IDENTITY_SOURCE, label=LABEL, production_oidc=False, **fields)
        with (self.directory / 'identity-audit.jsonl').open('a', encoding='utf-8') as file:
            file.write(json.dumps(entry, ensure_ascii=False) + '\n')
        self.events.append(entry)
        try:
            self.project_trace(entry)
        except Exception:
            # Observation cannot grant, revoke or break an otherwise valid action.
            self.trace_projection_failed = True

    def project_trace(self, entry):
        """Private transport projection of an already persisted audit, never UI input."""
        record = self.requests.get(entry.get('request_id'), {})
        if record.get('scenario') != 'chat':
            return
        event, status = entry['event'], entry.get('status')
        kind = None
        if event == 'demo_identity.task_escalate' and status == 'pending_approval':
            kind = 'approval.requested'
        elif event == 'demo_identity.resolve':
            kind = {'authorized': 'approval.approved', 'rejected': 'approval.rejected',
                    'blocked': 'approval.denied'}.get(status)
        elif event == 'chat.personal_confirmation' and entry.get('resolution')=='reject':
            kind,status='approval.rejected','rejected'
        elif event == 'chat.document_result' and record.get('approver'):
            kind,status='approval.execution',record.get('execution_status','unknown')
        elif event == 'chat.host_result' and entry.get('result_linked') and entry.get('execution_recorded') and record.get('approver'):
            kind, status = 'approval.execution', record.get('execution_status', 'unknown')
        if not kind:
            return
        execution = kind == 'approval.execution'
        actor = self.users.get(entry.get('subject'), {})
        self.trace_events.append(dict(
            audit_id=entry['audit_id'], timestamp=entry['at'], event_type=kind,
            run_id=entry.get('run_id') if execution else record.get('run_id'),
            origin_run_id=record.get('run_id'), session_key=record.get('session_key'),
            request_id=record['request_id'], task_id=record.get('task_id'),
            tool_call_id=record.get('tool_call_id' if execution else 'origin_tool_call_id'),
            tool=record.get('host_tool'), status=status, reason_code=entry.get('reason_code'),
            actor_roles=actor.get('roles', []), production_oidc=False))

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
            personal_confirmation=self.personal_confirmation,
            issuer_transport='in-process-rs256-jwks', default_enabled=False, mfa_synthetic=True,
            execution_enabled=subject is not None and bool({'office_user','finance_operator','business_approver'}.intersection(subject['roles'])),
            user=self.public_subject(subject), permission_summary=self.permission_summary(subject), expires_at=self.expires_at,
            users=[self.public_subject(self.users[a['subject']]) for a in self.accounts
                   if a.get('enabled') and self.users[a['subject']].get('enabled')],
            requests=self.request_summaries(subject),
            tasks=self.task_summaries(subject), audit=self.events[-40:] if subject else [],
            chat_session_bindings=(len(self.chat.sessions) if subject else 0),
            bound_sessions=[s for s,t in self.chat.sessions.items() if bearer and t==bearer],
            material_selections={s:ids for s,ids in self.chat.material_selections.items() if bearer and self.chat.sessions.get(s)==bearer},
            delegation_reason=reason,
            gateway_login_is_business_identity=False)

    def public_subject(self, subject):
        if not subject:
            return None
        user = self.users[subject['id']]
        return {**subject, 'label':user['label'], 'account':user.get('account'),
                'tier':user.get('tier'), 'tier_label':user.get('tier_label')}

    def permission_summary(self, subject):
        """Policy-derived upper bounds; actual actions still need OPA and task ACL."""
        if not subject:
            return None
        roles = set(subject['roles'])
        maintenance = 'workspace_maintainer' in roles
        assess = maintenance or bool({'business_approver', 'audit_reader'}.intersection(roles))
        capabilities = ['workspace.read', 'audit.read', 'admission.read']
        if assess:
            capabilities.append('audit.assess')
        if maintenance:
            capabilities.extend(['admission.manage', 'settings.manage'])
        policy = self.permission_policy
        catalog = self.tool_catalog.summary(subject) if self.tool_catalog else []
        tools = sorted({row['tool'] for row in catalog if row['available']})
        can_read = any(p['role'] in roles and p['tool']=='file.read' and 'read' in p['operations']
                       for p in policy['permissions']) and 'file.read' in tools
        materials = [document_id for document_id, (_,resource,level,_) in REGISTRY.items()
                     if can_read and policy['data_levels'][level] <= subject['clearance']
                     and ('security_admin' in roles or not any(resource.lower().startswith(p.lower())
                          for p in policy['protected_resource_prefixes']))]
        user = self.users[subject['id']]
        return dict(source='server-policy-summary', capabilities=capabilities,
            tier=user.get('tier'), tier_label=user.get('tier_label'),
            clearance=subject['clearance'], clearance_label=['公开','内部','机密','秘密'][subject['clearance']],
            material_ids=materials, tool_families=tools, can_approve='business_approver' in roles,
            materials=[dict(document_id=key, data_level=value[2], readable=key in materials)
                       for key,value in REGISTRY.items()],
            tool_catalog=catalog,
            can_edit_rules=maintenance, can_switch_sandbox=maintenance, can_assess=assess,
            approval_mode='openclaw_native_only' if self.service.gateway.native_approval_only({'subject':subject}) else 'business_approval')

    def authorize(self, bearer, permission):
        subject = self.subject(bearer)
        summary = self.permission_summary(subject)
        if permission not in summary['capabilities']:
            return self.blocked('BUSINESS_PERMISSION_DENIED')
        return dict(status='ok',user=self.public_subject(subject),permission_summary=summary,
                    production_oidc=False,label=LABEL)

    def password_user(self, account_name, password):
        if not isinstance(account_name,str) or not isinstance(password,str) or len(password)>256:
            return None
        account = next((a for a in self.accounts if a['account']==account_name),None)
        if not account or not account.get('enabled'):
            return None
        candidate = hashlib.pbkdf2_hmac('sha256',password.encode(),bytes.fromhex(account['salt']),120000).hex()
        if not hmac.compare_digest(candidate,account['password_hash']):
            return None
        user = self.users[account['subject']]
        return user if user.get('enabled') else None

    def request_summaries(self, subject):
        if not subject:
            return []
        review = bool({'business_approver', 'audit_reader'}.intersection(subject['roles']))
        visible = []
        for record in self.requests.values():
            if record['requester'] != subject['id'] and not review:
                continue
            row = copy.deepcopy(record)
            row['can_confirm_self'] = bool(self.personal_confirmation and row.get('scenario')=='chat'
                and row.get('requester')==subject['id'] and row.get('status')=='pending_approval')
            expiry = row.get('authorization_expires_at')
            row['authorization_expired'] = bool(expiry is not None and time.time() >= expiry
                and not row.get('authorization_consumed_at'))
            row['can_reapply'] = bool(row.get('scenario')=='chat' and row.get('status')=='authorized'
                and row['authorization_expired'] and not row.get('renewed_request_id'))
            visible.append(row)
        return visible

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
            row = {**contract, 'available_documents': visible}
            # Only a unique live host run locates this contract; historical tasks
            # never inherit the currently selected conversation.
            runs = [(run_id, run) for run_id, run in self.chat.runs.items()
                    if run['task'] == task_id and run['subject'] == owner]
            if len(runs) == 1:
                run_id, run = runs[0]
                row.update(session_key=run['session'], run_id=run_id)
            result.append(row)
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
            if record.get('scenario')=='chat' and not self.chat.current_scope(record):
                return self.blocked('P023_TASK_SCOPE_CHANGED')
            if record['status'] != 'blocked' or record.get('reason_code') not in {'P014_RESOURCE_OUTSIDE_TASK','P015_TOOL_OUTSIDE_TASK'}:
                return self.blocked('P010_PENDING_SNAPSHOT_REQUIRED')
            result = self.service.request_task_expansion_authenticated(copy.deepcopy(request), bearer)
            record.update(status=result['status'], reason_code=result.get('reason_code'))
            if result['status']=='pending_approval':
                record['confirmation_expires_at']=time.time()+60
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
        subject = self.service.verifier.authenticate_request({}, bearer)['subject']
        account = next((a for a in self.accounts if a['subject']==subject['id']),None)
        if not self.users.get(subject['id'],{}).get('enabled') or account and not account.get('enabled'):
            raise OidcIdentityError('DEMO_USER_DISABLED','当前演示账号不可用')
        return subject

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
        allowed = {'status': set(), 'enable': set(), 'disable': set(), 'login': {'user','account','password'},
                   'authorize': {'permission'},
                   'invoke': {'scenario'}, 'resolve': {'request_id', 'resolution'}, 'activate_chat': {'session_key'},
                   'task_create': {'directory'}, 'task_read': {'task_id','document_id'},
                   'task_escalate': {'request_id'}, 'bind_session': {'session_key'}, 'revoke': set(),
                   'materials': {'session_key'}, 'select_materials': {'session_key','material_ids'},
                   'task_reapply': {'request_id'}}
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
                self.tool_catalog = ToolCatalog(self.permission_policy, self.directory / 'tool-admission.json')
                self.expires_at = time.time() + LOGIN_TTL_SECONDS
                self.audit('demo_identity.enabled', activation_id=self.kid, transport='in-process', mfa_synthetic=True)
            return self.status()
        if not self.service:
            return self.blocked('DEMO_IDENTITY_DISABLED')
        try:
            if operation == 'login':
                # The legacy user path is private stdio/test compatibility only.
                # Public gateway RPC accepts account+password exclusively.
                user = (self.password_user(payload.get('account'),payload.get('password')) if 'account' in payload or 'password' in payload
                        else self.users.get(payload.get('user')))
                if not user or not user.get('enabled'):
                    return self.blocked('DEMO_LOGIN_FAILED',401)
                if bearer:
                    previous = self.subject(bearer)
                    self.revoke(bearer, previous)
                now = int(time.time())
                claims = dict(iss=ISSUER, aud=AUDIENCE, sub=user['id'], preferred_username=user['id'],
                    iat=now, exp=now+LOGIN_TTL_SECONDS, department=user['department'],
                    clearance=user['clearance'], realm_access={'roles': user['roles']}, amr=['mfa'],
                    azp='agentguard', scope='agentguard.demo', demo_identity=True, mfa_synthetic=True, jti=uuid.uuid4().hex)
                token = jwt.encode(claims, self.key, algorithm='RS256', headers={'kid': self.kid})
                self.delegations[hashlib.sha256(token.encode()).hexdigest()] = user['id']
                subject = self.subject('Bearer ' + token)  # Never trust even our own unverified claims.
                # A successful login gets its full lifetime, even near source expiry.
                # Existing tokens keep their own expiry and are never renewed here.
                self.expires_at = max(self.expires_at, claims['exp'])
                self.audit('demo_identity.login', subject=subject['id'])
                return dict(access_token=token, token_type='Bearer', expires_at=claims['exp'], user=self.public_subject(subject),
                            label=LABEL, production_oidc=False, mfa_synthetic=True)
            subject = self.subject(bearer)
            if operation == 'authorize':
                return self.authorize(bearer,payload.get('permission'))
            if operation == 'revoke':
                return self.revoke(bearer, subject)
            if 'audit_reader' in subject['roles']:
                self.audit('demo_identity.read_only_denied', subject=subject['id'], reason_code='DEMO_AUDITOR_READ_ONLY')
                return self.blocked('DEMO_AUDITOR_READ_ONLY')
            if operation == 'bind_session':
                return self.chat.bind(payload.get('session_key'), bearer, subject)
            if operation == 'activate_chat':
                return self.chat.activate(payload.get('session_key'), bearer, subject)
            if operation == 'materials':
                return self.chat.materials(payload.get('session_key'),bearer,subject)
            if operation == 'select_materials':
                return self.chat.select_materials(payload.get('session_key'),payload.get('material_ids'),bearer,subject)
            if operation == 'task_reapply':
                return self.chat.reapply(payload.get('request_id'),bearer,subject)
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
                if self.personal_confirmation and record.get('scenario')=='chat' and record.get('requester')==subject['id']:
                    return confirm_personal(self,task_id,payload.get('resolution'),bearer,subject)
                if record.get('scenario')=='chat' and not self.chat.current_scope(record):
                    return self.blocked('P023_TASK_SCOPE_CHANGED',409)
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
    parser.add_argument('--personal-confirmation', action='store_true')
    args = parser.parse_args()
    demo = DemoIdentity(args.state_dir, personal_confirmation=args.personal_confirmation)
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
            print(json.dumps({'id': envelope.get('id'), 'result': result,
                              'trace_events': demo.trace_events,
                              'trace_projection_failed': demo.trace_projection_failed}, ensure_ascii=False), flush=True)
            demo.trace_events = []
            demo.trace_projection_failed = False
    finally:
        demo.disable('worker_exit')


if __name__ == '__main__':
    main()
