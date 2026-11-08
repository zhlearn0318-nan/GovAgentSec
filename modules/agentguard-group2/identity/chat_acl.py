"""Private host hook bridge to U10. No HTTP/RPC entry for hook operations.

The worker never opens native files. It consumes the existing signed scope
before returning a permit to OpenClaw's unchanged sandbox tool implementation.
"""
import copy
import re
import uuid
from enforcement.documents import document_action
from enforcement.notifications import notice_action
from enforcement.task_policy import value_hash
from integrations.openclaw_mcp.agentguard_client import AgentGuardClient


class _ActionBuilder(AgentGuardClient):
    def __init__(self):
        pass

    def _invoke(self, action):
        return action


class ChatAcl:
    def __init__(self, demo):
        self.demo = demo
        self.sessions = {}
        self.runs = {}
        self.permits = {}

    def bind(self, session, bearer, subject):
        if not isinstance(session, str) or not re.fullmatch(r'agent:[a-zA-Z0-9_-]+:[^\s]{1,180}', session):
            return self.demo.blocked('P016_SESSION_REQUIRED')
        if 'office_user' not in subject['roles']:
            return self.demo.blocked('DEMO_TASK_ROLE_REQUIRED')
        self.sessions[session] = bearer
        self.runs = {k:v for k,v in self.runs.items() if v['session'] != session}
        self.permits = {k:v for k,v in self.permits.items() if k[0] != session}
        self.demo.audit('chat.identity_bound', subject=subject['id'], session_key_hash=value_hash(session))
        return {'status':'ok', 'production_oidc':False, 'label':'演示身份源（非生产）'}

    def revoke(self, bearer):
        sessions = {s for s, token in self.sessions.items() if token == bearer}
        self.sessions = {s:t for s,t in self.sessions.items() if s not in sessions}
        self.runs = {k:v for k,v in self.runs.items() if v['session'] not in sessions}
        self.permits = {k:v for k,v in self.permits.items() if k[0] not in sessions}

    def start(self, payload):
        session, run = payload.get('session_key'), payload.get('run_id')
        bearer = self.sessions.get(session)
        subject = self.demo.subject(bearer) if bearer else None
        if not subject or not run:
            return self.demo.blocked('P001_CONTRACT_REQUIRED')
        if run in self.runs:
            existing = self.runs[run]
            if existing['session'] != session or existing['subject'] != subject['id']:
                return self.demo.blocked('P002_SUBJECT_MISMATCH')
            # Embedded model retries can emit the start hook again. Keep the
            # original scope; later prompt changes never expand it.
            contract = self.demo.service.gateway.task_policies.summary(existing['task'])
            return {'status':'ok','task_id':existing['task'],'scope_digest':contract['scope_digest']}
        paths = payload.get('paths', [])
        # Exact path comes only from current user turn, through trusted hook.
        prefixes = sorted({p.rsplit('/', 1)[0]+'/' for p in paths})
        grants = {'native.read': {'path':paths[0]}} if len(paths) == 1 else {}
        tools = ['native.read', 'file.read', 'database.query']
        if payload.get('public_notice'):
            prefixes.append('govdoc://demo/public/')
            grants['file.read'] = {'document_id':'emergency_plan'}
        task = 'chat-acl-'+uuid.uuid4().hex
        result = self.demo.service.task_contract_authenticated(dict(operation='create',task_id=task,
            tools=tools,resource_prefixes=prefixes,user_values=grants), bearer)
        if result.get('status') != 'ok':
            return result
        self.demo.tasks[task] = subject['id']
        self.runs[run] = dict(session=session, task=task, subject=subject['id'])
        self.demo.audit('chat.scope_created', run_id=run, task_id=task,
            scope_digest=result['contract']['scope_digest'], subject=subject['id'])
        return {'status':'ok','task_id':task,'scope_digest':result['contract']['scope_digest']}

    def action(self, payload):
        tool, params = payload['tool_name'], payload.get('params', {})
        if tool == 'agentguard-notices__read_gov_document':
            if set(params) != {'document_id'}:
                raise ValueError('untrusted fields')
            return document_action(params['document_id'])
        if tool == 'agentguard-notices__submit_emergency_notice':
            if set(params) != {'recipient','template_id'}:
                raise ValueError('untrusted fields')
            return notice_action(params['recipient'],params['template_id'])
        builder = _ActionBuilder()
        if tool == 'agentguard-notices__list_notices' and set(params) <= {'limit'}:
            return builder.list_notices(params.get('limit', 5))
        if tool == 'agentguard-notices__request_test_payment' and set(params) == {'payee','amount','currency'}:
            return builder.request_payment(params['payee'],params['amount'],params['currency'])
        if tool == 'agentguard-notices__run_protected_command' and set(params) == {'command'}:
            return builder.check_dangerous_command(params['command'])
        if tool in {'read','write','edit','exec'}:
            action = payload['action']  # Built by trusted host hook, never by MCP arguments.
            expected = {'read':'native.read','write':'file.write','edit':'file.write','exec':'shell.execute'}[tool]
            if action['tool'] != expected:
                raise ValueError('tool mismatch')
            return action
        # Unknown tools and alternate execution channels are deliberately closed.
        raise ValueError('unsupported tool')

    def tool(self, payload):
        demo = self.demo
        run = self.runs.get(payload.get('run_id'))
        if not run or run['session'] != payload.get('session_key'):
            return demo.blocked('P001_CONTRACT_REQUIRED')
        bearer = self.sessions.get(run['session'])
        subject = demo.subject(bearer)
        if subject['id'] != run['subject']:
            return demo.blocked('P002_SUBJECT_MISMATCH')
        try:
            action = self.action(payload)
        except (ValueError, KeyError, TypeError):
            return demo.blocked('P017_TOOL_OR_PATH_UNSUPPORTED')
        key = (run['session'], value_hash(action), subject['id'])
        saved = self.permits.get(key)
        if saved:
            request, ticket = saved['request'], saved['ticket']
            result = demo.service.gateway.dispatch(request, ticket)
            # Keep consumed ticket as tombstone: a repeated call cannot obtain
            # another authorization by changing toolCallId or starting a turn.
            return self.safe(result, request, payload)
        request = demo.task_request(run['task'], action)
        request['context'].update(host_acl=True,run_id=payload['run_id'],
                                  session_key_hash=value_hash(run['session']))
        request['subject'] = subject
        rid = request['request_id']
        demo.snapshots[rid] = copy.deepcopy(request)
        result = demo.service.invoke(request, bearer)
        contract = demo.service.gateway.task_policies.summary(run['task'])
        demo.requests[rid] = dict(request_id=rid, task_id=run['task'], requester=subject['id'],
            scenario='chat', host_tool=payload['tool_name'], tool=action['tool'],
            target_resource=action['resource'], parameters_hash=value_hash(action['parameters']),
            data_level=action['data_level'],risk_level=action['risk_level'],
            status=result['status'],reason_code=result.get('reason_code'),
            policy_reason_codes=result.get('policy_reason_codes', []),
            scope_digest=contract['scope_digest'], resource_prefixes=contract['resource_prefixes'],
            ticket_ttl_seconds=30,approval_ttl_seconds=60)
        if result['status'] == 'authorized':
            result = demo.service.gateway.dispatch(request, result['ticket'])
        return self.safe(result, request, payload)

    def safe(self, result, request, payload):
        contract = self.demo.service.gateway.task_policies.summary(request['task_id'])
        self.demo.audit('chat.tool_gate', run_id=payload.get('run_id'),task_id=request['task_id'],
            scope_digest=contract['scope_digest'],tool=payload['tool_name'],
            reason_code=result.get('reason_code'),status=result['status'])
        return {k:result[k] for k in ('status','reason_code','http_status') if k in result} | {
            'request_id':request['request_id'],'task_id':request['task_id'],
            'scope_digest':contract['scope_digest'],'identity_source':'demo_idp_verified_jwt'}

    def approved(self, request, result):
        if result.get('status') != 'authorized' or result.get('http_status') != 200:
            return
        run = next((v for v in self.runs.values() if v['task']==request['task_id']), None)
        if not run:
            # Requests outlive a completed turn, but are still bound to its
            # authenticated session; no arbitrary client task-id lookup.
            session = next((s for s in self.sessions if value_hash(s)==request['context'].get('session_key_hash')),None)
        else:
            session = run['session']
        if session:
            key = (session, value_hash(request['action']), request['subject']['id'])
            self.permits[key] = {'request':copy.deepcopy(request),'ticket':result['ticket']}

    def handle(self, operation, payload):
        self.demo.status()  # activation expiry revokes identity before every hook
        try:
            if operation == 'chat_start':
                return self.start(payload)
            if operation == 'chat_tool':
                return self.tool(payload)
            if operation == 'chat_end':
                self.runs.pop(payload.get('run_id'), None)
                return {'status':'ok'}
            if operation == 'chat_result':
                run = self.runs.get(payload.get('run_id'))
                if run:
                    self.demo.audit('chat.host_result',task_id=run['task'],run_id=payload['run_id'],
                        tool=payload.get('tool_name'),success=payload.get('success') is True)
                return {'status':'ok'}
            return self.demo.blocked('DEMO_UNTRUSTED_FIELD')
        except Exception as exc:
            code = getattr(exc, 'code', 'P012_TASK_POLICY_UNAVAILABLE')
            self.demo.audit('chat.blocked',reason_code=code,run_id=payload.get('run_id'))
            return self.demo.blocked(code)
