"""Private host hook bridge to U10. No HTTP/RPC entry for hook operations.

The worker never opens native files. It consumes the existing signed scope
before returning a permit to OpenClaw's unchanged sandbox tool implementation.
"""
import base64
import copy
import json
import math
import re
import uuid
import time
from datetime import datetime, timezone
from enforcement.documents import REGISTRY, document_action
from enforcement.notifications import notice_action
from enforcement.task_policy import value_hash
from integrations.openclaw_mcp.agentguard_client import AgentGuardClient
from identity.oidc import OidcIdentityError


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
        # Display correlation only; permits and the one-use ticket remain the authority.
        self.host_calls = {}
        self.material_selections = {}
        self.automatic_sessions = set()
        self.scope_generations = {}
        self.retired_permits = []
        self.document_calls = {}
        self.grid_calls = {}

    def bind(self, session, bearer, subject):
        if not isinstance(session, str) or not re.fullmatch(r'agent:[a-zA-Z0-9_-]+:[^\s]{1,180}', session):
            return self.demo.blocked('P016_SESSION_REQUIRED')
        if 'office_user' not in subject['roles']:
            return self.demo.blocked('DEMO_TASK_ROLE_REQUIRED')
        if not self.revoke_session_scope(session, 'rebind'):
            return self.demo.blocked('P012_TASK_POLICY_UNAVAILABLE')
        self.sessions[session] = bearer
        self.demo.audit('chat.identity_bound', subject=subject['id'], session_key_hash=value_hash(session))
        return {'status':'ok', 'production_oidc':False, 'label':'演示身份源（非生产）'}

    def revoke(self, bearer):
        sessions = {s for s, token in self.sessions.items() if token == bearer}
        for session in sessions:
            self.revoke_session_scope(session, 'delegation_revoked')

    def activate(self, session, bearer, subject):
        """Called by the logged-in chat client before send, never by model input."""
        owner = self.sessions.get(session) if isinstance(session, str) else None
        if owner == bearer and session in self.automatic_sessions:
            return {'status':'ok', 'material_policy':'identity_registry'}
        if owner and owner != bearer:
            try:
                self.demo.subject(owner)
            except OidcIdentityError as exc:
                if exc.code not in {'I005_TOKEN_EXPIRED','DEMO_DELEGATION_REVOKED','DEMO_USER_DISABLED'}:
                    return self.demo.blocked('P012_TASK_POLICY_UNAVAILABLE')
            else:
                return self.demo.blocked('P027_CONVERSATION_IDENTITY_CONFLICT')
        result = self.bind(session, bearer, subject)
        if result.get('status') == 'ok':
            self.automatic_sessions.add(session)
            result['material_policy'] = 'identity_registry'
        return result

    def revoke_session_scope(self, session, reason):
        # This private path only removes authority. The old bearer can already
        # be revoked; owners and task IDs come from stored server-side records.
        self.sessions.pop(session, None)
        self.material_selections.pop(session, None)
        self.automatic_sessions.discard(session)
        self.document_calls = {k:v for k,v in self.document_calls.items() if k[0]!=session}
        self.runs = {k:v for k,v in self.runs.items() if v['session'] != session}
        self.clear_host_calls(session=session)
        self.scope_generations[session] = self.scope_generations.get(session,0)+1
        records = [r for r in self.demo.requests.values() if r.get('scenario')=='chat'
                   and r.get('session_key')==session]
        for record in records:
            record['scope_invalidated'] = True
            if not record.get('authorization_consumed_at'):
                record.update(status='blocked', reason_code='P023_TASK_SCOPE_CHANGED')
        for key, permit in list(self.permits.items()):
            if key[0] == session:
                self.retired_permits.append({**permit, 'scope_invalidated':True})
                del self.permits[key]
        revoked = True
        for task, owner in sorted({(r['task_id'],r['requester']) for r in records}):
            try:
                self.demo.service.gateway.task_policies.tighten(task, owner, [], [])
            except Exception as exc:
                if getattr(exc, 'code', None) != 'P008_CONTRACT_EXPIRED':
                    revoked = False
        self.demo.audit('chat.scope_revoked', session_key_hash=value_hash(session), reason=reason,
                        revoked=revoked, scope_generation=self.scope_generations[session])
        return revoked

    def materials(self, session, bearer, subject):
        if not isinstance(session,str) or self.sessions.get(session) != bearer or 'office_user' not in subject['roles']:
            return self.demo.blocked('P002_SUBJECT_MISMATCH')
        labels = {'grid_curves':'A园区脱敏用电曲线与采集事件.csv','grid_records':'A园区企业档案与生产检修记录','grid_other':'B园区受限资料'}
        rows = []
        for document_id in self.demo.document_registry:
            action = self.demo.document_action(document_id)
            request = self.demo.task_request('material-preview', action)
            request['subject'] = subject
            try:
                decision = self.demo.service.gateway.decide(request)
            except Exception:
                self.demo.audit('chat.materials_unavailable',subject=subject['id'],reason_code='P012_TASK_POLICY_UNAVAILABLE')
                return self.demo.blocked('P012_TASK_POLICY_UNAVAILABLE')
            rows.append(dict(document_id=document_id, label=labels.get(document_id, self.demo.library.catalogue().get(document_id,{}).get('title',document_id)),
                data_level=action['data_level'], selectable=decision.get('effect') in {'allow','require_approval'},
                approval_required=decision.get('effect') == 'require_approval' and not self.demo.service.gateway.native_approval_only({'subject':subject})))
        return dict(status='ok', materials=rows, selected=self.material_selections.get(session, []),
                    explicitly_selected=session in self.material_selections,
                    running=any(r['session']==session for r in self.runs.values()))

    def select_materials(self, session, ids, bearer, subject):
        if session in self.automatic_sessions:
            return self.demo.blocked('P028_AUTOMATIC_MATERIAL_POLICY')
        if not isinstance(ids, list) or not ids or len(ids)>len(self.demo.document_registry) or any(not isinstance(i,str) or i not in self.demo.document_registry for i in ids) or len(set(ids))!=len(ids):
            return self.demo.blocked('P003_INVALID_GRANT')
        catalogue = self.materials(session, bearer, subject)
        if catalogue.get('status') != 'ok':
            return catalogue
        if catalogue['running']:
            return self.demo.blocked('P004_TASK_RUNNING')
        permitted = {m['document_id'] for m in catalogue['materials'] if m['selectable']}
        if not set(ids)<=permitted:
            return self.demo.blocked('P021_MATERIAL_PERMISSION_REQUIRED')
        # Reuse the existing contract revision check to invalidate old signed
        # tickets. Keep request snapshots and ticket ledger tombstones intact.
        records = [r for r in self.demo.requests.values() if r.get('scenario')=='chat'
                   and r.get('session_key')==session and r.get('requester')==subject['id']]
        for task in sorted({r['task_id'] for r in records}):
            tightened = self.demo.service.task_contract_authenticated(dict(operation='tighten',task_id=task,
                tools=[],resource_prefixes=[]),bearer)
            if tightened.get('status') != 'ok' and tightened.get('reason_code') != 'P008_CONTRACT_EXPIRED':
                return tightened  # Partial revocation is safe; never restore a revoked ticket.
        generation = self.scope_generations.get(session,0)+1
        self.scope_generations[session] = generation
        for record in records:
            record['scope_invalidated'] = True
            if (record.get('status') in {'authorized','pending_approval'} or record.get('reason_code') in {'P014_RESOURCE_OUTSIDE_TASK','P015_TOOL_OUTSIDE_TASK'}) and not record.get('authorization_consumed_at'):
                record.update(status='blocked',reason_code='P023_TASK_SCOPE_CHANGED')
        for key,permit in list(self.permits.items()):
            if key[0]==session:
                self.retired_permits.append({**permit,'scope_invalidated':True})
                del self.permits[key]
        self.material_selections[session] = sorted(ids)
        self.demo.audit('chat.materials_selected', subject=subject['id'], session_key_hash=value_hash(session),
                        document_ids=sorted(ids),scope_generation=generation,revoked_task_count=len({r['task_id'] for r in records}))
        return dict(status='ok', selected=sorted(ids), operation='read')

    def current_scope(self, record):
        return (not record.get('scope_invalidated') and record.get('scope_generation',0)
                == self.scope_generations.get(record.get('session_key'),0))

    def clear_host_calls(self, *, session=None, run_id=None):
        for key, (request_id, _) in list(self.host_calls.items()):
            if key[0] == session or key[1] == run_id:
                record = self.demo.requests.get(request_id)
                if record and record.get('execution_status') == 'awaiting_host_result':
                    record['execution_status'] = 'unknown'
                del self.host_calls[key]

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
        automatic = session in self.automatic_sessions
        explicit = self.material_selections.get(session)
        if automatic:
            catalog = self.materials(session, bearer, subject)
            if catalog.get('status') != 'ok':
                return catalog
            explicit = [m['document_id'] for m in catalog['materials'] if m['selectable']]
        paths = payload.get('paths', []) if automatic or explicit is None else []
        # Exact path comes only from current user turn, through trusted hook.
        prefixes = sorted({p.rsplit('/', 1)[0]+'/' for p in paths})
        grants = {'native.read': {'path':paths[0]}} if len(paths) == 1 else {}
        tools = ['native.read', 'file.read', 'database.query']
        if explicit is None and payload.get('public_notice'):
            prefixes.append('govdoc://demo/public/')
            grants['file.read'] = {'document_id':'emergency_plan'}
        task = 'chat-acl-'+uuid.uuid4().hex
        result = self.demo.service.task_contract_authenticated(dict(operation='create',task_id=task,
            tools=tools,resource_prefixes=prefixes,user_values=grants), bearer)
        if result.get('status') != 'ok':
            return result
        self.demo.tasks[task] = subject['id']
        self.runs[run] = dict(session=session, task=task, subject=subject['id'],
                             scope_generation=self.scope_generations.get(session,0))
        if explicit is not None:
            material_tasks = {}
            for document_id in explicit:
                action = self.demo.document_action(document_id)
                material_task = 'chat-material-'+uuid.uuid4().hex
                if automatic:
                    # Subject and IDs came from the verified bearer and OPA registry preview.
                    contract = self.demo.service.gateway.task_policies.create(material_task, subject['id'],
                        tools=['file.read'], prefixes=[action['resource'].rsplit('/',1)[0]+'/'],
                        user_values={'file.read':{'document_id':document_id}}, grant_source='registry_policy')
                    self.demo.audit('chat.registry_scope_created', run_id=run, task_id=material_task,
                        subject=subject['id'], document_id=document_id, scope_digest=contract['scope_digest'])
                    created = {'status':'ok'}
                else:
                    created = self.demo.service.task_contract_authenticated(dict(operation='create', task_id=material_task,
                        tools=['file.read'],resource_prefixes=[action['resource'].rsplit('/',1)[0]+'/'],
                        user_values={'file.read':{'document_id':document_id}}),bearer)
                if created.get('status') != 'ok':
                    self.runs.pop(run,None)
                    return created
                self.demo.tasks[material_task] = subject['id']
                material_tasks[document_id] = material_task
            self.runs[run]['material_tasks'] = material_tasks
        self.demo.audit('chat.scope_created', run_id=run, task_id=task,
            scope_digest=result['contract']['scope_digest'], subject=subject['id'])
        return {'status':'ok','task_id':task,'scope_digest':result['contract']['scope_digest']}

    def action(self, payload):
        tool, params = payload['tool_name'], payload.get('params', {})
        if tool == 'agentguard-notices__read_gov_document':
            if set(params) != {'document_id'}:
                raise ValueError('untrusted fields')
            return self.demo.document_action(params['document_id'])
        if tool == 'agentguard-notices__submit_emergency_notice':
            if set(params) != {'recipient','template_id'}:
                raise ValueError('untrusted fields')
            return notice_action(params['recipient'],params['template_id'])
        builder = _ActionBuilder()
        if tool == 'agentguard-notices__list_notices' and set(params) <= {'limit'}:
            return builder.list_notices(params.get('limit', 5))
        if tool == 'agentguard-notices__get_control_request_status':
            value = params.get('control_request_id')
            if set(params) != {'control_request_id'} or not isinstance(value,str) or not re.fullmatch(r'mcp-req-[0-9a-f]{32}',value):
                raise ValueError('untrusted fields')
            return dict(tool='database.query',operation='query',resource='db://public/control-status',
                parameters={'control_request_id':value,'item_count':1},risk_level='low',data_level='internal')
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
        if run.get('scope_generation',0) != self.scope_generations.get(run['session'],0):
            return demo.blocked('P023_TASK_SCOPE_CHANGED')
        bearer = self.sessions.get(run['session'])
        subject = demo.subject(bearer)
        if subject['id'] != run['subject']:
            return demo.blocked('P002_SUBJECT_MISMATCH')
        denied = demo.tool_catalog.check(payload.get('tool_name'), subject) if demo.tool_catalog else 'P026_TOOL_ADMISSION_REQUIRED'
        if denied:
            demo.audit('chat.tool_gate', run_id=payload['run_id'], task_id=run['task'],
                tool=payload.get('tool_name'), reason_code=denied, status='blocked')
            return demo.blocked(denied)
        try:
            action = self.action(payload)
        except (ValueError, KeyError, TypeError):
            return demo.blocked('P017_TOOL_OR_PATH_UNSUPPORTED')
        key = (run['session'], value_hash(action), subject['id'])
        saved = self.permits.get(key)
        if saved:
            if saved.get('scope_generation',0) != run.get('scope_generation',0):
                return demo.blocked('P023_TASK_SCOPE_CHANGED')
            request, ticket = saved['request'], saved['ticket']
            if payload.get('_document_adapter'):
                return self.document_ready(request,ticket,payload)
            result = demo.service.gateway.dispatch(request, ticket)
            # Keep consumed ticket as tombstone: a repeated call cannot obtain
            # another authorization by changing toolCallId or starting a turn.
            return self.safe(result, request, payload)
        # Native file actions may carry a document correlation ID too. Their
        # authority remains the native-path contract, never a registry grant.
        task = run['task']
        if action['tool'] == 'file.read':
            task = run.get('material_tasks',{}).get(action.get('parameters',{}).get('document_id'),task)
        request = demo.task_request(task, action)
        request['context'].update(host_acl=True,run_id=payload['run_id'],
                                  session_key_hash=value_hash(run['session']))
        if payload.get('_document_adapter'):
            request['context']['host_document_adapter'] = True
        request['subject'] = subject
        rid = request['request_id']
        demo.snapshots[rid] = copy.deepcopy(request)
        result = demo.service.invoke(request, bearer)
        contract = demo.service.gateway.task_policies.summary(task)
        demo.requests[rid] = dict(request_id=rid, task_id=task, requester=subject['id'],
            session_key=run['session'], run_id=payload['run_id'], execution_status='not_started',
            origin_tool_call_id=payload.get('tool_call_id'),
            scenario='chat', host_tool=payload['tool_name'], tool=action['tool'],
            target_resource=action['resource'], parameters_hash=value_hash(action['parameters']),
            document_id=action['parameters'].get('document_id') if action['tool']=='file.read' else None,
            data_level=action['data_level'],risk_level=action['risk_level'],
            status=result['status'],reason_code=result.get('reason_code'),
            approval_mode=result.get('approval_mode','business_approval'),
            policy_reason_codes=result.get('policy_reason_codes', []),
            scope_digest=contract['scope_digest'], resource_prefixes=contract['resource_prefixes'],
            scope_generation=run.get('scope_generation',0),
            ticket_ttl_seconds=30,approval_ttl_seconds=60)
        if result['status']=='pending_approval':
            demo.requests[rid]['confirmation_expires_at']=time.time()+60
        if result['status']=='authorized' and payload.get('_document_adapter'):
            self.authorization_display(request,result)
            return self.document_ready(request,result['ticket'],payload)
        if result['status'] == 'authorized':
            self.authorization_display(request, result)
            result = demo.service.gateway.dispatch(request, result['ticket'])
        return self.safe(result, request, payload)

    def document_ready(self, request, ticket, payload):
        key=(payload['session_key'],payload.get('tool_call_id'))
        if not isinstance(key[1],str) or not key[1] or key in self.document_calls:
            return self.demo.blocked('DOCUMENT_CALL_REPLAY')
        self.document_calls[key]={'request':copy.deepcopy(request),'ticket':ticket,'run_id':payload['run_id']}
        return {'status':'document_prepared','request_id':request['request_id']}

    def document_execute(self,payload):
        key=(payload.get('session_key'),payload.get('tool_call_id'))
        pending=self.document_calls.get(key)
        if not pending or pending.get('used'):
            return self.demo.blocked('DOCUMENT_CALL_REPLAY')
        pending['used']=True
        request=pending['request']
        subject=self.demo.subject(self.sessions.get(key[0]))
        if subject['id']!=request['subject']['id'] or pending['run_id'] not in self.runs:
            return self.demo.blocked('P002_SUBJECT_MISMATCH')
        if payload.get('params')!={'document_id':request['action']['parameters']['document_id']}:
            return self.demo.blocked('DOCUMENT_ACTION_CHANGED')
        result=self.demo.service.gateway.dispatch(request,pending['ticket'])
        business=(result.get('receipt') or {}).get('business_result') or {}
        ok=(result.get('status')=='executed_isolated' and business.get('adapter') in {'isolated_synthetic_document','isolated_managed_document'}
            and business.get('document_id')==payload['params']['document_id'] and business.get('side_effect') is False)
        record=self.demo.requests[request['request_id']]
        record.update(execution_status='succeeded' if ok else 'failed',status=result['status'],authorization_consumed_at=datetime.now(timezone.utc).isoformat())
        self.demo.audit('chat.document_result',request_id=request['request_id'],run_id=pending['run_id'],subject=subject['id'],status=result['status'])
        safe={'status':'executed_isolated' if ok else 'blocked','document_id':payload['params']['document_id'],'executed':ok,'reason_code':result.get('reason_code')}
        if ok: safe['content']=business['document_content']
        return safe

    def grid_prepare(self, payload):
        run = self.runs.get(payload.get('run_id'))
        session, call = payload.get('session_key'), payload.get('tool_call_id')
        if not run or run['session'] != session or not isinstance(call,str) or not call:
            return self.demo.blocked('P001_CONTRACT_REQUIRED')
        subject = self.demo.subject(self.sessions.get(session))
        if subject['id'] != run['subject'] or self.demo.tool_catalog.check('gov_analyze_grid',subject):
            return self.demo.blocked('P025_TOOL_PERMISSION_DENIED')
        if payload.get('params',{}) != {'period':'2024-09'}:
            return self.demo.blocked('DEMO_UNTRUSTED_FIELD')
        for document_id in ['grid_curves','grid_records']:
            if document_id not in run.get('material_tasks', {}):
                return self.demo.blocked('DOCUMENT_ACCESS_REQUIRED')
            if self.demo.document_access.allowed(subject,document_id) is False:
                return self.demo.blocked('DOCUMENT_ACCESS_REQUIRED')
        if (session,call) in self.grid_calls:
            return self.demo.blocked('DOCUMENT_CALL_REPLAY')
        self.grid_calls[(session,call)] = dict(run_id=payload['run_id'],subject=subject['id'],params=copy.deepcopy(payload.get('params',{})))
        return {'status':'grid_prepared'}

    def grid_execute(self, payload):
        key=(payload.get('session_key'),payload.get('tool_call_id'))
        pending=self.grid_calls.get(key)
        if not pending or pending.get('used'):
            return self.demo.blocked('DOCUMENT_CALL_REPLAY')
        pending['used']=True
        run=self.runs.get(pending['run_id'])
        if not run or payload.get('params',{}) != pending['params']:
            return self.demo.blocked('DOCUMENT_ACTION_CHANGED')
        subject=self.demo.subject(self.sessions.get(key[0]))
        if subject['id'] != pending['subject']:
            return self.demo.blocked('P002_SUBJECT_MISMATCH')
        documents=[]
        for document_id in ['grid_curves','grid_records']:
            result=self.demo.read_document(subject,document_id,task_id=run['material_tasks'][document_id],run_id=pending['run_id'])
            if result.get('status') != 'ok':
                return result
            documents.append(result)
        return {'status':'ok','documents':documents,'subject':self.demo.public_subject(subject),'run_id':pending['run_id']}

    def reapply(self, request_id, bearer, subject):
        if not isinstance(request_id,str):
            return self.demo.blocked('P022_REAPPLICATION_NOT_AVAILABLE')
        record = self.demo.requests.get(request_id)
        original = self.demo.snapshots.get(request_id)
        if not record or not original or record.get('requester') != subject['id'] or self.sessions.get(record.get('session_key')) != bearer:
            return self.demo.blocked('P002_SUBJECT_MISMATCH')
        if not self.current_scope(record):
            return self.demo.blocked('P023_TASK_SCOPE_CHANGED')
        if (record.get('scenario') != 'chat' or record.get('status') != 'authorized'
                or record.get('authorization_consumed_at') or record.get('renewed_request_id')
                or not record.get('authorization_expires_at') or time.time()<record['authorization_expires_at']):
            return self.demo.blocked('P022_REAPPLICATION_NOT_AVAILABLE')
        contract = self.demo.service.gateway.task_policies.summary(original['task_id'])
        task = 'chat-renew-'+uuid.uuid4().hex
        created = self.demo.service.task_contract_authenticated(dict(operation='create',task_id=task,
            tools=[t for t in contract['allowed_tools'] if t in {'file.read','native.read','database.query'}],
            resource_prefixes=contract['resource_prefixes']),bearer)
        if created.get('status')!='ok':
            return created
        request = self.demo.task_request(task,copy.deepcopy(original['action']))
        request['context'] = copy.deepcopy(original['context'])
        request['subject'] = subject
        # A fresh contract has no approved snapshot. Re-evaluate OPA and scope;
        # do not directly mint or recycle a ticket from the expired request.
        result = self.demo.service.request_task_expansion_authenticated(request,bearer)
        if result.get('status') != 'pending_approval':
            return self.demo.blocked(result.get('reason_code','P022_REAPPLICATION_NOT_AVAILABLE'))
        rid = request['request_id']
        self.demo.tasks[task] = subject['id']
        self.demo.snapshots[rid] = copy.deepcopy(request)
        renewed = {k:copy.deepcopy(v) for k,v in record.items() if k not in {
            'approver','authorization_expires_at','authorization_consumed_at','execution_run_id',
            'execution_completed_at','tool_call_id','last_host_status','last_host_reason_code'}}
        renewed.update(request_id=rid,task_id=task,status='pending_approval',execution_status='not_started',
                       reason_code=result.get('reason_code'),replaces_request_id=request_id,
                       policy_reason_codes=result.get('policy_reason_codes',[]),
                       scope_digest=created['contract']['scope_digest'])
        self.demo.requests[rid]=renewed
        record['renewed_request_id']=rid
        return self.demo.safe_receipt(result,rid,subject,'task_escalate')

    def safe(self, result, request, payload):
        contract = self.demo.service.gateway.task_policies.summary(request['task_id'])
        record = self.demo.requests.get(request['request_id'])
        if record:
            record.update(last_host_status=result['status'], last_host_reason_code=result.get('reason_code'))
            if result['status'] == 'host_authorized':
                record.update(authorization_consumed_at=datetime.now(timezone.utc).isoformat(),
                              execution_run_id=payload['run_id'], execution_status='unknown')
                call = payload.get('tool_call_id')
                if isinstance(call, str) and call and len(call) <= 256:
                    key = (payload['session_key'], payload['run_id'], call)
                    # Duplicate host IDs are ambiguous. Never overwrite an earlier mapping.
                    if key not in self.host_calls:
                        self.host_calls[key] = (request['request_id'], payload['tool_name'])
                        record.update(tool_call_id=call, execution_status='awaiting_host_result')
                    else:
                        previous = self.demo.requests.get(self.host_calls[key][0])
                        if previous and previous.get('execution_status') == 'awaiting_host_result':
                            previous['execution_status'] = 'unknown'
                        self.host_calls[key] = (None, payload['tool_name'])
        self.demo.audit('chat.tool_gate', run_id=payload.get('run_id'),task_id=request['task_id'],
            request_id=request['request_id'],
            scope_digest=contract['scope_digest'],tool=payload['tool_name'],
            approval_mode=(record or {}).get('approval_mode','business_approval'),
            reason_code=result.get('reason_code'),status=result['status'])
        return {k:result[k] for k in ('status','reason_code','http_status') if k in result} | {
            'request_id':request['request_id'],'task_id':request['task_id'],
            'scope_digest':contract['scope_digest'],'identity_source':'demo_idp_verified_jwt'}

    def authorization_display(self, request, result):
        """Read expiry from our service's issued ticket, for display only.

        The caller accepts only an internal authorized result; no UI or tool
        supplied ticket enters this helper. Dispatch still verifies and consumes it.
        """
        if result.get('status') != 'authorized' or result.get('http_status') != 200:
            return
        record = self.demo.requests.get(request['request_id'])
        if record is None:
            return
        try:
            encoded = result['ticket'].split('.', 1)[0]
            body = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
            expiry = body['exp']
            if body['task_id'] == request['task_id'] and isinstance(expiry, (int, float)) and not isinstance(expiry, bool) and math.isfinite(expiry):
                record['authorization_expires_at'] = expiry
        except (KeyError, TypeError, ValueError):
            # Missing metadata must not change authorization or invent a deadline.
            pass

    def host_result(self, payload):
        run_id, session, call = payload.get('run_id'), payload.get('session_key'), payload.get('tool_call_id')
        run = self.runs.get(run_id)
        if not run or run['session'] != session:
            return {'status':'ok'}
        key = (session, run_id, call) if isinstance(call, str) and call else None
        matched = self.host_calls.get(key) if key else None
        request_id = None
        execution_recorded = False
        if matched and matched[1] == payload.get('tool_name'):
            request_id = matched[0]
            record = self.demo.requests.get(request_id)
            if record and record.get('execution_status') == 'awaiting_host_result':
                success = payload.get('success')
                control_status = payload.get('control_status')
                execution_status = control_status if control_status in {'pending_approval','blocked'} else ('succeeded' if success is True else 'failed' if success is False else 'unknown')
                record.update(execution_status=execution_status,
                              execution_completed_at=datetime.now(timezone.utc).isoformat())
                execution_recorded = True
            # Leave an ID tombstone until run end so duplicate callbacks cannot remap it.
        result_task = self.demo.requests.get(request_id,{}).get('task_id',run['task'])
        self.demo.audit('chat.host_result', task_id=result_task, run_id=run_id,
                        request_id=request_id, result_linked=request_id is not None,
                        execution_recorded=execution_recorded,
                        tool=payload.get('tool_name'), success=payload.get('success') is True)
        return {'status':'ok'}

    def approved(self, request, result):
        if result.get('status') != 'authorized' or result.get('http_status') != 200:
            return
        record = self.demo.requests.get(request.get('request_id'),{})
        if not self.current_scope(record):
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
            if key in self.permits:
                self.retired_permits.append(self.permits[key])
            self.permits[key] = {'request':copy.deepcopy(request),'ticket':result['ticket'],
                                 'scope_generation':record.get('scope_generation',0)}
            self.authorization_display(request, result)

    def handle(self, operation, payload):
        self.demo.status()  # activation expiry revokes identity before every hook
        try:
            if operation == 'chat_start':
                return self.start(payload)
            if operation == 'chat_tool':
                return self.tool(payload)
            if operation == 'chat_document_prepare':
                return self.tool({**payload,'tool_name':'agentguard-notices__read_gov_document','_document_adapter':True})
            if operation == 'chat_document_execute':
                return self.document_execute(payload)
            if operation == 'chat_grid_prepare':
                return self.grid_prepare(payload)
            if operation == 'chat_grid_execute':
                return self.grid_execute(payload)
            if operation == 'chat_confirmation_status':
                record=self.demo.requests.get(payload.get('request_id'),{})
                run=self.runs.get(payload.get('run_id'))
                if not run or record.get('session_key')!=run['session']:
                    return self.demo.blocked('P002_SUBJECT_MISMATCH')
                if record.get('status')=='pending_approval' and time.time()>=record.get('confirmation_expires_at',0):
                    record.update(status='rejected',reason_code='PERSONAL_CONFIRMATION_EXPIRED')
                return {'status':record.get('status','blocked')}
            if operation == 'chat_end':
                run_id = payload.get('run_id')
                self.runs.pop(run_id, None)
                self.clear_host_calls(run_id=run_id)
                return {'status':'ok'}
            if operation == 'chat_result':
                return self.host_result(payload)
            return self.demo.blocked('DEMO_UNTRUSTED_FIELD')
        except Exception as exc:
            code = getattr(exc, 'code', 'P012_TASK_POLICY_UNAVAILABLE')
            self.demo.audit('chat.blocked',reason_code=code,run_id=payload.get('run_id'))
            return self.demo.blocked(code)
