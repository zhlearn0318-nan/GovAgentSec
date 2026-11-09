"""Trusted task-local authority. Store hashes, never prompts or business documents.

Only authenticated user/service control paths call create/tighten/observe/approve.
MCP arguments and request.context provenance are deliberately ignored.
"""
import hashlib
import json
import sqlite3
import time
from urllib.parse import urlsplit
from contextlib import contextmanager
from pathlib import Path
from .tickets import compute_action_digest

READ_ONLY = frozenset({'file.read', 'database.query', 'native.read'})
FIELDS = {
    'file.read': ('document_id',),
    'native.read': ('path',),
    'payment.transfer': ('amount', 'currency', '$resource'),
    'shell.execute': ('command',),
    'notification.submit': ('recipient', 'template_id'),
}


def value_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def sensitive_values(action):
    params = action.get('parameters', {})
    names = set(FIELDS.get(action.get('tool'), ()))
    names.update(k for k in params if k.lower() in {'path','file_path','url','recipient','recipients','amount','command','payee'})
    return {k: action.get('resource') if k == '$resource' else params.get(k) for k in sorted(names)}


class TaskPolicyError(RuntimeError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def resource_prefixes(values):
    """Canonical registry URI trees, not host paths or model-supplied filenames."""
    if not isinstance(values, list) or any(not isinstance(v, str) for v in values):
        raise TaskPolicyError('P003_INVALID_GRANT', '目录范围必须是 URI 前缀列表')
    for value in values:
        uri = urlsplit(value)
        if (not ((uri.scheme == 'govdoc' and uri.netloc in {'demo', 'protected'})
                 or (uri.scheme == 'nativefs' and uri.netloc == 'workspace'))
                or not value.endswith('/') or uri.query or uri.fragment
                or '%' in value or '\\' in value or '//' in uri.path
                or any(p in {'.', '..'} for p in uri.path.split('/'))):
            raise TaskPolicyError('P003_INVALID_GRANT', '仅支持规范的受管文档目录 URI')
    return sorted(set(values))


def scope_digest(body):
    return value_hash({k: body.get(k) for k in
        ('task_id', 'subject_id', 'revision', 'allowed_tools', 'resource_prefixes')})


class TaskPolicies:
    def __init__(self, filename):
        self.filename = str(filename)
        Path(filename).parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute('CREATE TABLE IF NOT EXISTS task_contracts(task_id TEXT PRIMARY KEY, body TEXT NOT NULL)')

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.filename, timeout=10)
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _load(self, db, task_id):
        row = db.execute('SELECT body FROM task_contracts WHERE task_id=?', (task_id,)).fetchone()
        if not row:
            raise TaskPolicyError('P001_CONTRACT_REQUIRED', '请先由可信用户入口建立任务权限契约')
        return json.loads(row[0])

    def _save(self, db, body):
        db.execute('INSERT OR REPLACE INTO task_contracts VALUES (?,?)', (body['task_id'], json.dumps(body, ensure_ascii=False)))

    def exists(self, task_id):
        with self.connection() as db:
            return db.execute('SELECT 1 FROM task_contracts WHERE task_id=?', (task_id,)).fetchone() is not None

    def create(self, task_id, subject_id, tools=None, user_values=None, prefixes=None, *, grant_source='user'):
        if grant_source not in {'user', 'registry_policy'}:
            raise TaskPolicyError('P003_INVALID_GRANT', '参数授权来源无效')
        tools = set({'file.read', 'database.query'} if tools is None else tools)
        if not task_id or not subject_id or not tools <= READ_ONLY:
            raise TaskPolicyError('P004_EXPANSION_REQUIRES_APPROVAL', '初始契约只允许只读模板内工具')
        grants = {}
        prefixes = resource_prefixes(prefixes) if prefixes is not None else None
        for tool, fields in (user_values or {}).items():
            if tool not in (set(FIELDS) | READ_ONLY) or not isinstance(fields, dict):
                raise TaskPolicyError('P003_INVALID_GRANT', '用户参数授权必须属于受管工具')
            grants[tool] = {field: value_hash(value) for field, value in fields.items()}
        with self.connection() as db:
            if db.execute('SELECT 1 FROM task_contracts WHERE task_id=?', (task_id,)).fetchone():
                raise TaskPolicyError('P005_CONTRACT_EXISTS', '任务契约不可覆盖；请收紧或发起新任务')
            body = dict(task_id=task_id, subject_id=subject_id, revision=1, allowed_tools=sorted(tools),
                        grants=grants, grant_source=grant_source, observed={}, pending={}, approvals={}, expires_at=time.time()+3600,
                        resource_prefixes=prefixes, requested_expansions={})
            self._save(db, body)
        return self.summary(task_id)

    def tighten(self, task_id, subject_id, tools, prefixes=None):
        with self.connection() as db:
            body = self._load(db, task_id)
            self._owner(body, subject_id)
            if not set(tools) <= set(body['allowed_tools']):
                raise TaskPolicyError('P004_EXPANSION_REQUIRES_APPROVAL', '运行中禁止静默扩权')
            if prefixes is not None:
                prefixes = resource_prefixes(prefixes)
                old = body.get('resource_prefixes')
                if old is not None and any(not any(p.startswith(parent) for parent in old) for p in prefixes):
                    raise TaskPolicyError('P004_EXPANSION_REQUIRES_APPROVAL', '运行中禁止扩大目录范围')
                body['resource_prefixes'] = prefixes
            body['allowed_tools'] = sorted(set(tools))
            body['revision'] += 1
            body['approvals'] = {}  # Previously issued scopes are invalidated.
            body['pending'] = {}
            body['requested_expansions'] = {}
            self._save(db, body)
        return self.summary(task_id)

    def request_expansion(self, request):
        """Trusted user control path only; MCP/context cannot request an expansion."""
        with self.connection() as db:
            body = self._load(db, request['task_id'])
            self._owner(body, request['subject']['id'])
            digest = compute_action_digest(request)
            body.setdefault('requested_expansions', {}).setdefault(digest, body['revision'])
            self._save(db, body)

    @staticmethod
    def resource_allowed(body, action):
        prefixes = body.get('resource_prefixes')
        return (action.get('tool') not in {'file.read', 'native.read', 'file.write'} or prefixes is None
                or any(action.get('resource', '').startswith(p) for p in prefixes))

    def observe(self, task_id, subject_id, tool, values):
        with self.connection() as db:
            body = self._load(db, task_id)
            self._owner(body, subject_id)
            body['observed'].setdefault(tool, {}).update({k:value_hash(v) for k,v in values.items()})
            self._save(db, body)

    @staticmethod
    def _owner(body, subject_id):
        if body['subject_id'] != subject_id:
            raise TaskPolicyError('P002_SUBJECT_MISMATCH', '任务契约与已验证主体不一致')
        if body['expires_at'] <= time.time():
            raise TaskPolicyError('P008_CONTRACT_EXPIRED', '任务契约已过期')

    def evaluate(self, request, *, native_approval_only=False):
        task = str(request.get('task_id',''))
        digest = compute_action_digest(request)
        action = request.get('action', {})
        with self.connection() as db:
            body = self._load(db, task)
            self._owner(body, request.get('subject',{}).get('id'))
            approved = body['approvals'].get(digest)
            if approved and (approved['used'] or approved['expires_at'] <= time.time()):
                raise TaskPolicyError('P009_SCOPE_CONSUMED_OR_EXPIRED', '一次性扩权已消费或过期')
            outside = not self.resource_allowed(body, action)
            diff = [] if action['tool'] in body['allowed_tools'] else [action['tool']]
            requested = body.get('requested_expansions', {}).get(digest) == body['revision']
            # Scoped tasks require an explicit user request before an approval can exist.
            if body.get('resource_prefixes') is not None and not approved and not requested and not native_approval_only:
                if outside:
                    raise TaskPolicyError('P014_RESOURCE_OUTSIDE_TASK', '目录不属于本任务；请显式申请一次性扩权')
                if diff:
                    raise TaskPolicyError('P015_TOOL_OUTSIDE_TASK', '工具不属于本任务；请显式申请一次性扩权')
            provenance = {}
            for field, value in sensitive_values(action).items():
                hashed = value_hash(value)
                provenance[field] = {'source': 'approved_snapshot' if approved else
                    body.get('grant_source','user') if value is not None and body['grants'].get(action['tool'],{}).get(field)==hashed else
                    'tool_untrusted' if body['observed'].get(action['tool'],{}).get(field)==hashed else 'unknown',
                    'value_hash':hashed}
            tainted = any(v['source'] in ('unknown','tool_untrusted') for v in provenance.values())
            reason = ('P004_EXPANSION_REQUIRES_APPROVAL' if outside and not approved else
                      'P006_PARAMETER_SOURCE_UNTRUSTED' if tainted else
                      'P004_EXPANSION_REQUIRES_APPROVAL' if diff and not approved else None)
            # Preserve the real diff/provenance for audit. This is the verified
            # demo administrator's authority, not fabricated user consent.
            if native_approval_only:
                reason = None
            summary = dict(task_id=task,revision=body['revision'],allowed_tools=body['allowed_tools'],
                           resource_prefixes=body.get('resource_prefixes'), scope_digest=scope_digest(body),
                           resource_outside_task=outside, explicit_expansion_requested=requested,
                           provenance=provenance,contract_diff=diff,ticket_ttl_seconds=30,one_time_expansion=bool(approved),
                           approval_mode='openclaw_native_only' if native_approval_only else 'business_approval')
            if reason:
                body['pending'][digest] = {'revision':body['revision'], 'summary':summary}
                self._save(db,body)
            return {**summary,'reason_code':reason,'pending':bool(reason),
                    'scope':{'task_id':task,'subject_id':body['subject_id'],'revision':body['revision'],
                             'action_digest':digest,'provenance_hash':value_hash(provenance),
                             'scope_digest':scope_digest(body),'expansion':bool(approved)}}

    def approve(self, request, approver_id, roles):
        digest = compute_action_digest(request)
        with self.connection() as db:
            body = self._load(db,request['task_id'])
            self._owner(body,request['subject']['id'])
            if not approver_id or approver_id == body['subject_id'] or 'business_approver' not in roles:
                raise TaskPolicyError('P007_APPROVER_REQUIRED', '必须由不同的已验证业务审批人确认快照')
            pending = body['pending'].get(digest)
            if not pending or pending['revision'] != body['revision']:
                raise TaskPolicyError('P010_PENDING_SNAPSHOT_REQUIRED', '无对应待批动作快照或契约已经变化')
            if digest in body['approvals']:
                raise TaskPolicyError('P009_SCOPE_CONSUMED_OR_EXPIRED', '不能重复审批此快照')
            body['approvals'][digest] = {'expires_at':time.time()+60,'used':False,'approver_id':approver_id}
            del body['pending'][digest]
            self._save(db,body)

    def consume_scope(self, request, scope):
        # Atomic current-revision check and one-use expansion consumption.
        with self.connection() as db:
            body = self._load(db,request['task_id'])
            self._owner(body,request['subject']['id'])
            if (scope['revision'] != body['revision'] or scope['action_digest'] != compute_action_digest(request)
                    or scope.get('scope_digest') != scope_digest(body)):
                raise TaskPolicyError('P011_CONTRACT_CHANGED', '票据签发后契约或动作变化')
            if scope['expansion']:
                grant = body['approvals'].get(scope['action_digest'])
                if not grant or grant['used'] or grant['expires_at'] <= time.time():
                    raise TaskPolicyError('P009_SCOPE_CONSUMED_OR_EXPIRED', '一次性扩权已消费或过期')
                grant['used'] = True
                self._save(db,body)

    def summary(self, task_id):
        with self.connection() as db:
            body = self._load(db, task_id)
        return {k:body[k] for k in ('task_id','subject_id','revision','allowed_tools','expires_at')} | {
            'resource_prefixes':body.get('resource_prefixes'), 'scope_digest':scope_digest(body),
            'pending':list(body['pending'].values()), 'provenance_mode':'trusted-input-hashes', 'ticket_ttl_seconds':30}
