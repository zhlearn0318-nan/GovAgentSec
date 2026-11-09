import { getIdentitySession } from './identity-session.mjs';
import { getTaskContext, subscribeTaskContext } from './task-context.mjs';

const statusText = status => ({ ok: '已完成', authorized: '已批准，等待原任务重试', pending_approval: '需审批', executed_isolated: '已执行（合成）', blocked: '已阻断', rejected: '已拒绝', interrupted: '已中断', approval_error: '审批失败' }[status] ?? '状态待确认');
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const navigate = (section, requestId) => window.dispatchEvent(new CustomEvent('gov-navigate', { detail: { section, ...(requestId ? { requestId } : {}) } }));
const materialLabel = resource => typeof resource === 'string' && resource.startsWith('nativefs://workspace/')
  ? '工作区/' + resource.slice('nativefs://workspace/'.length)
  : typeof resource === 'string' && resource.startsWith('govdoc://demo/') ? '文档库/' + resource.slice('govdoc://demo/'.length) : '受控材料';
const materialNames={emergency_plan:'公开台风预案',material_inventory:'应急物资清单',duty_contacts:'内部值班通信录',command_contacts:'指挥中心联络表',protected_resource:'受保护物资材料'};
export function materialTaskDraft(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>5||ids.some(id=>typeof id!=='string'||!Object.hasOwn(materialNames,id))||new Set(ids).size!==ids.length)throw Error('MATERIAL_SELECTION_REQUIRED');
  return '请通过受控文档服务读取本任务已选的合成材料：'+ids.map(id=>`${materialNames[id]}（document_id: ${id}）`).join('、')+'。仅使用本任务授权材料，整理一份简短的台风应急简报，包含情况摘要、物资或值班事项、信息来源。未提供的信息请注明缺失；遇到权限限制请报告实际结果。';
}

export function mountDemoIdentity(parent, gateway, onStatus = () => {}, options = { mode: 'settings' }) {
  const mode = options.mode ?? 'settings', session = getIdentitySession(gateway);
  const card = el('section', undefined, 'section'); card.setAttribute('aria-label', '演示身份源'); card.dataset.identityMode = mode;
  const style = el('style'); style.textContent = `.identity-body{padding:18px;display:grid;gap:14px;color:#233e3b}.identity-body h2,.identity-body h3,.identity-body p{margin:0}.identity-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.identity-body select{max-width:100%;padding:8px}.identity-body button:focus-visible,.identity-body select:focus-visible{outline:2px solid #1e695b;outline-offset:3px}.identity-note{font-size:12px;color:#62756d;line-height:1.65}.identity-request{padding:15px;border:1px solid #d6e2df;border-radius:8px;display:grid;gap:9px}.identity-request[data-focused=true]{outline:2px solid #1e695b}.identity-body details{font-size:12px}.identity-body details p{overflow-wrap:anywhere;margin-top:7px}.identity-confirm{padding:14px;background:#eef5f2;border-radius:8px;display:grid;gap:10px}`;
  const body = el('div', undefined, 'identity-body'); card.append(style, body); parent.prepend(card);
  style.textContent += '.identity-body button{justify-self:start}.identity-body fieldset{border:1px solid #d6e2df;border-radius:6px;margin:0;padding:10px 14px}.identity-body legend{font-size:13px;font-weight:600}.identity-body textarea:focus-visible{outline:2px solid #1e695b;outline-offset:2px}';
  let state = session.snapshot(), task = getTaskContext(), pendingBinding = null, disposed = false, busy = false, message = '', filter = 'mine', filterSelected = false;
  let selectedUser = '', selectedDirectory = 'A', advancedOpen = false;
  let materialCatalogue = null, materialDraft = new Set();
  const levelNames={public:'公开',internal:'内部',confidential:'机密',secret:'秘密'};
  const focusedRequest = () => options.requestId ?? new URL(location.href).searchParams.get('request') ?? '';
  const isOfficer = () => state.execution_enabled && state.user?.roles?.includes('office_user');
  const authorizationTime = expires => {
    const remaining = Math.max(0, Math.ceil(expires - Date.now() / 1000));
    return remaining ? `单次重试授权剩余 ${remaining} 秒，请立即返回原任务重试。` : '原动作授权已过期，需要重新申请。';
  };
  function processingLocation() {
    if (options.processingLocation) return options.processingLocation;
    const routing = options.routing;
    if (!routing) return '当前会话的数据处理位置尚未核验，可能使用外部服务。安全评审仅在本机，轨迹原文不外发评审。';
    return `默认会话模型：${routing.session?.current ?? '尚未核验'}。${routing.session?.api_configured ? '已配置外部 API，聊天内容可能由外部服务处理。' : '处理位置尚未核验。'}既有会话的模型设置可能不同。安全评审仅在本机，轨迹原文不外发评审。`;
  }
  function action(label, fn, disabled = false) {
    const button = el('button', label, 'secondary'); button.type = 'button'; button.disabled = disabled || busy || state.busy;
    button.onclick = async () => {
      if (busy || state.busy) return;
      busy = true; render();
      try { await fn(); }
      catch { message = '操作未确认，执行仍受限制。请检查连接或重新登录。'; }
      finally { busy = false; if (!disposed) render(); }
    };
    return button;
  }
  function result(value) {
    message = statusText(value.status);
    if(value.status==='blocked')message=({P004_TASK_RUNNING:'任务正在执行，结束后再修改材料。',P021_MATERIAL_PERMISSION_REQUIRED:'部分材料超出当前身份权限，原范围未改变。',P022_REAPPLICATION_NOT_AVAILABLE:'该授权不能重新申请，请核对是否已执行或尚未过期。',P002_SUBJECT_MISMATCH:'请以原经办身份重新绑定当前任务。'})[value.reason_code]??'请求未获授权，本次未执行。';
    if (value.status === 'authorized') message += '；请立即返回原任务重试，到期后需重新申请。';
    if (value.executed) message += '；仅处理本机合成记录。';
  }
  function credentials() {
    const box = el('div', undefined, 'identity-confirm');
    box.append(el('h2', mode === 'login' ? '登录演示身份' : '演示身份源'), el('p', '演示（非生产） · 仅处理合成数据', 'identity-note'));
    if (!state.enabled) {
      box.append(el('p', state.available ? '演示环境尚未开启，请由管理员准备后登录。' : '等待连接身份服务。', 'identity-note'));
      if(mode==='settings')box.append(action('开启演示身份源', async () => { await session.enable(); message = '演示已开启，最长 15 分钟后自动结束。'; }, !state.available));
      else box.append(action('前往环境设置',async()=>navigate('settings')));
    } else {
      const select = el('select'); select.setAttribute('aria-label', '选择演示用户');
      for (const user of state.users ?? []) { const option = el('option', user.label); option.value = user.id; select.append(option); }
      select.value = selectedUser || state.user?.id || state.users?.[0]?.id || ''; select.disabled = busy || state.busy;
      select.onchange = () => { selectedUser = select.value; };
      box.append(el('p', '选择经办或审批身份。双人审批请分别在独立标签页登录。', 'identity-note'), select,
        action('进入工作台', async () => { await session.login(select.value); navigate(focusedRequest() ? 'approvals' : 'home', focusedRequest()); }, !select.value));
      if (state.user) box.append(action('关闭当前委托', async () => { await session.logout(); message = '当前委托已撤销，关联聊天授权已收回。'; }));
      if (mode === 'settings') box.append(action('关闭演示身份源', async () => { await session.disable(); message = '本次演示已结束。'; }));
    }
    return box;
  }
  function binding() {
    const box = el('section', undefined, 'identity-confirm'); box.setAttribute('aria-label', '当前任务绑定');
    box.append(el('h3', task.sessionKey ? task.title || '当前聊天任务' : '尚未选择聊天'));
    if (!task.sessionKey) box.append(el('p', '先在 OpenClaw 选择或创建聊天，再开始任务。', 'identity-note'));
    else {
      const contracts = (state.tasks ?? []).filter(item => item.session_key === task.sessionKey && item.subject_id === state.user?.id);
      if (contracts.length === 1) {
        const resources = contracts[0].resource_prefixes ?? [];
        box.append(el('p', resources.length ? `本任务已确认的只读范围：${resources.map(materialLabel).join('、')}` : '本任务尚未授予材料读取范围。', 'identity-note'));
      } else if(!state.material_selections?.[task.sessionKey])box.append(el('p', '绑定身份后选择本次材料，只授予读取权限。', 'identity-note'));
    }
    if (pendingBinding === task.sessionKey && pendingBinding) {
      box.append(el('p', processingLocation(), 'identity-note'),
        action('确认绑定当前任务', async () => {
          const expected = pendingBinding;
          if (!expected || getTaskContext().sessionKey !== expected) { pendingBinding = null; message = '当前聊天已变化，请重新确认。'; return; }
          const answer = await session.request('bind_session', { session_key: expected }); pendingBinding = null; result(answer);
          if (answer.status === 'ok') {
            message = getTaskContext().sessionKey === expected ? '当前任务身份已绑定，请选择本次材料。' : '已绑定先前确认的任务；当前聊天已变化，请重新确认绑定。';
            if(getTaskContext().sessionKey===expected)await loadMaterials();
          }
        }, !isOfficer()), action('取消绑定', async () => { pendingBinding = null; }));
    } else if(!state.bound_sessions?.includes(task.sessionKey))box.append(action('以当前身份开始任务', async () => { pendingBinding = task.sessionKey; }, !task.sessionKey || !isOfficer()));
    if(state.bound_sessions?.includes(task.sessionKey)){
      const chosen=state.material_selections?.[task.sessionKey];
      if(chosen){
        box.append(el('p','本任务只读：'+chosen.map(id=>materialNames[id]??id).join('、')));
        const draft=el('textarea');draft.readOnly=true;draft.value=materialTaskDraft(chosen);draft.rows=3;draft.setAttribute('aria-label','本次任务指令');draft.style.cssText='width:100%;box-sizing:border-box;resize:vertical;padding:10px;font:inherit;line-height:1.6;border:1px solid #d6e2df;border-radius:6px';
        box.append(draft,action('复制任务指令',async()=>{
          try{await navigator.clipboard.writeText(draft.value);message='已复制。返回对话核对后发送，尚未发起模型调用。';}
          catch{message='请选中任务指令复制，返回对话核对后发送。';}
        }),el('p','选材限定本任务范围。业务服务仍会核验权限，要求审批时材料尚未读取。复制后返回对话发送。','identity-note'));
      }
      if(materialCatalogue?.sessionKey===task.sessionKey){
        const fieldset=el('fieldset');fieldset.append(el('legend','选择本次材料'));
        for(const m of materialCatalogue.materials){
          const label=el('label');label.style.cssText='display:flex;gap:8px;align-items:center;padding:7px 0';
          const check=el('input');check.type='checkbox';check.value=m.document_id;check.checked=materialDraft.has(m.document_id);check.disabled=!m.selectable||materialCatalogue.running||busy||state.busy;
          check.setAttribute('aria-label',m.label);check.onchange=()=>{check.checked?materialDraft.add(m.document_id):materialDraft.delete(m.document_id);};
          label.append(check,el('span',`${m.label} · ${levelNames[m.data_level]??m.data_level}${!m.selectable?' · 当前身份不可读':m.approval_required?' · 读取需审批':''}`));fieldset.append(label);
        }
        box.append(fieldset,action('确认本次只读材料',async()=>{
          const expected=task.sessionKey;if(!materialDraft.size){message='请至少选择一份材料。';return;}
          const r=await session.request('select_materials',{session_key:expected,material_ids:[...materialDraft]});result(r);
          if(r.status==='ok'){materialCatalogue=null;message='材料范围已确认。返回对话即可开始，新增材料需再次确认或申请。';}
        },materialCatalogue.running),action('收起材料选择',async()=>{materialCatalogue=null;}));
      }else box.append(action(chosen?'调整本次材料':'选择本次材料',loadMaterials,!isOfficer()));
    }
    return box;
  }
  async function loadMaterials(){
    const expected=task.sessionKey,r=await session.request('materials',{session_key:expected});
    if(getTaskContext().sessionKey!==expected)return;
    if(r.status!=='ok'){result(r);return;}
    materialCatalogue={...r,sessionKey:expected};materialDraft=new Set(r.selected);
  }
  function requestCard(request) {
    const item = el('article', undefined, 'identity-request'); item.dataset.requestId = request.request_id; item.dataset.status = request.status;
    if (focusedRequest() === request.request_id) item.dataset.focused = 'true';
    const chat = request.scenario === 'chat', title = chat ? '聊天工具申请' : request.scenario === 'document' ? '材料读取申请' : request.scenario === 'notice' ? '通知送审' : '测试付款';
    const executionLabel = chat && ({succeeded:'已执行成功',failed:'执行失败',awaiting_host_result:'执行中',pending_approval:'等待业务审批',blocked:'业务服务已阻断'})[request.execution_status];
    const label = executionLabel || (request.authorization_consumed_at ? '授权已使用，结果待核对' : request.authorization_expired ? '授权已过期' : statusText(request.status));
    item.append(el('strong', `${title} · ${label}`), el('p', '申请人：' + request.requester));
    const target = request.document_id ?? (request.target_resource ? materialLabel(request.target_resource) : null);
    if (target) item.append(el('p', '涉及材料：' + target));
    if(request.scope_invalidated&&request.reason_code==='P023_TASK_SCOPE_CHANGED')item.append(el('p','任务材料范围已更新，此旧授权已失效。请返回任务重新发起动作。','identity-note'));
    if (chat && request.resource_prefixes?.length) item.append(el('p', '原只读范围：' + request.resource_prefixes.map(materialLabel).join('、'), 'identity-note'));
    if (request.status === 'blocked' && ['P014_RESOURCE_OUTSIDE_TASK', 'P015_TOOL_OUTSIDE_TASK'].includes(request.reason_code)) {
      item.append(el('p', '该动作超出本任务范围，尚未执行。', 'identity-note'),
        action('申请一次性扩权', async () => result(await session.request('task_escalate', { request_id: request.request_id })), !state.execution_enabled || state.user?.id !== request.requester));
    }
    if (request.status === 'pending_approval') {
      const self = state.user?.id === request.requester, canApprove = state.execution_enabled && state.user?.roles?.includes('business_approver') && !self;
      item.append(el('p', chat ? '批准只授权原动作单次重试，不会立即读取材料。' : '批准后仅执行这一次合成业务动作。', 'identity-note'),
        action(chat ? '批准本次重试' : '批准并执行一次', async () => result(await session.request('resolve', { request_id: request.request_id, resolution: 'approve' })), !canApprove),
        action('拒绝', async () => result(await session.request('resolve', { request_id: request.request_id, resolution: 'reject' })), !canApprove));
      if (!canApprove) item.append(el('p', self ? '不能审批自己的申请，请另一位审批人处理。' : '需要审批身份处理。', 'identity-note'));
    }
    if (request.status === 'authorized') {
      const note = el('p', request.renewed_request_id ? '已建立新的申请；此旧授权已失效。' : request.authorization_consumed_at ? '单次授权已核销，执行结果见下方回执。' : request.authorization_expired ? '原动作授权已过期，需要重新申请。' : '已批准，请立即返回原会话重试原动作；过期需重新申请。', 'identity-note');
      if (!request.authorization_consumed_at && !request.authorization_expired && Number.isFinite(request.authorization_expires_at)) {
        note.dataset.authorizationExpires = String(request.authorization_expires_at); note.textContent = authorizationTime(request.authorization_expires_at);
      }
      item.append(note);
      if(request.can_reapply)item.append(action('重新申请原动作',async()=>{
        const r=await session.request('task_reapply',{request_id:request.request_id});result(r);
        if(r.status==='pending_approval')navigate('approvals',r.request_id);
      },!state.execution_enabled||state.user?.id!==request.requester));
      if(request.renewed_request_id)item.append(action('查看新的申请',async()=>navigate('approvals',request.renewed_request_id)));
    }
    if (chat) {
      const outcome = { not_started: '尚未执行原动作', awaiting_host_result: '原动作执行中，等待回执', succeeded: '原动作执行成功', failed: '原动作执行失败', pending_approval: '业务服务仍在等待审批，尚未执行。', blocked: '业务服务已阻断，尚未执行。', unknown: '执行结果未关联；请核对原会话回执。' };
      item.append(el('p', outcome[request.execution_status] ?? outcome.unknown, 'identity-note'));
      item.append(action('返回原任务', async () => window.dispatchEvent(new CustomEvent('gov-return-task', { detail: { requestId: request.request_id } })), !request.session_key || !state.user));
      if (!request.session_key) item.append(el('p', '原会话定位不可得，不能自动返回。', 'identity-note'));
    }
    const details = el('details'); details.append(el('summary', '核验证据'));
    for (const [label, value] of [['请求编号', request.request_id], ['任务编号', request.task_id], ['原因', request.reason_code], ['权限范围', request.resource_prefixes?.join('、')], ['范围摘要', request.scope_digest], ['参数摘要', request.parameters_hash], ['审批人', request.approver]]) if (value) details.append(el('p', `${label}：${value}`));
    item.append(details); return item;
  }
  function approvals() {
    const box = el('section'); box.setAttribute('aria-label', '演示审批队列');
    const row = el('div', undefined, 'identity-row'); row.append(el('h3', mode === 'receipts' ? '审批回执' : '待审批'));
    const select = el('select'); select.setAttribute('aria-label', '审批筛选');
    for (const [value, label] of [['pending', '待我处理'], ['mine', '我发起的'], ['all', '全部可见']]) { const option = el('option', label); option.value = value; select.append(option); }
    select.value = filter; select.onchange = () => { filter = select.value; filterSelected = true; render(); }; row.append(select); box.append(row);
    if (mode === 'receipts') box.append(el('p', '审批回执与调用图同屏核对；未采集的审批以回执为准。', 'identity-note'));
    if (state.trace_capture?.failed) box.append(el('p', '部分审批事件未写入调用图，请核对本页回执。', 'identity-error'));
    const rows = state.user ? (state.requests ?? []).filter(request => {
      if (options.sessionKey && request.session_key !== options.sessionKey) return false;
      if (focusedRequest() === request.request_id) return true;
      return filter === 'all' || (filter === 'mine' ? request.requester === state.user.id : request.status === 'pending_approval' && state.user.roles?.includes('business_approver') && request.requester !== state.user.id);
    }) : [];
    if (!rows.length) box.append(el('p', state.user ? '当前没有符合筛选条件的申请。' : '登录业务身份后查看审批。', 'identity-note'));
    for (const request of [...rows].reverse()) box.append(requestCard(request));
    return box;
  }
  function advanced() {
    const details = el('details'); details.open = advancedOpen; details.setAttribute('aria-label', '合成业务演示'); details.append(el('summary', '高级：合成业务演示'));
    details.ontoggle = () => { advancedOpen = details.open; };
    const operations = el('div', undefined, 'identity-body');
    operations.append(action('发起台风通知送审（合成）', async () => result(await session.request('invoke', { scenario: 'notice' })), !state.execution_enabled),
      action('发起测试付款 600 元（合成）', async () => result(await session.request('invoke', { scenario: 'payment' })), !state.execution_enabled), el('p', '只写本机送审箱和测试账本，不发送外部消息。', 'identity-note'));
    const tasks = el('section'); tasks.setAttribute('aria-label', '任务最小权限'); tasks.append(el('h3', '合成材料范围'));
    const directory = el('select'); directory.setAttribute('aria-label', '任务绑定目录');
    for (const [value, label] of [['A', '目录 A · 公开台风通知'], ['B', '目录 B · 内部物资清单']]) { const option = el('option', label); option.value = value; directory.append(option); }
    directory.value = selectedDirectory; directory.onchange = () => { selectedDirectory = directory.value; };
    tasks.append(directory, action('创建只读任务', async () => result(await session.request('task_create', { directory: directory.value })), !isOfficer()));
    for (const task of state.tasks ?? []) {
      const item = el('article', undefined, 'identity-request'); item.dataset.taskId = task.task_id;
      item.append(el('strong', '合成只读任务'), el('p', '可用材料：' + ((task.available_documents ?? []).join('、') || '无')));
      for (const id of task.available_documents ?? []) item.append(action('读取 ' + id, async () => result(await session.request('task_read', { task_id: task.task_id, document_id: id })), !isOfficer() || task.subject_id !== state.user?.id));
      if (!task.available_documents?.includes('material_inventory')) item.append(action('尝试读取目录 B（未授权演示）', async () => result(await session.request('task_read', { task_id: task.task_id, document_id: 'material_inventory' })), !isOfficer() || task.subject_id !== state.user?.id));
      tasks.append(item);
    }
    operations.append(tasks); details.append(operations); return details;
  }
  function render() {
    if (disposed) return;
    body.replaceChildren();
    if(mode==='receipts'&&!state.user){
      const row=el('div',undefined,'identity-row');
      row.append(el('span','登录业务身份后查看审批回执','identity-note'),action('登录',async()=>navigate('login',focusedRequest())));
      body.append(row);return;
    }
    if (mode === 'login' || mode === 'settings') body.append(credentials());
    else { body.append(el('strong', state.user ? `${state.users?.find(u=>u.id===state.user.id)?.label??'当前用户'} · 演示（非生产）` : '尚未登录业务身份')); if (!state.user) body.append(action('登录演示身份', async () => navigate('login', focusedRequest()))); }
    if (['home', 'settings'].includes(mode)) body.append(binding());
    if (mode === 'home') {
      const requests = state.user ? state.requests ?? [] : [], roles = state.user?.roles ?? [];
      const pending = requests.filter(request => request.status === 'pending_approval' &&
        (roles.includes('audit_reader') || (roles.includes('business_approver') ? request.requester !== state.user.id : request.requester === state.user.id))).length;
      const expandable = requests.filter(request => request.status === 'blocked' && state.execution_enabled &&
        request.requester === state.user.id && ['P014_RESOURCE_OUTSIDE_TASK', 'P015_TOOL_OUTSIDE_TASK'].includes(request.reason_code)).length;
      const summary = el('div', undefined, 'identity-row'); summary.setAttribute('aria-label', '身份待办');
      summary.append(el('strong', `待审批 ${pending} 项`), el('span', `待申请 ${expandable} 项`, 'identity-note'),
        action('查看待审批', async () => navigate('approvals')));
      body.append(summary);
    }
    if (['approvals', 'receipts', 'settings'].includes(mode)) body.append(approvals());
    if (mode === 'settings') body.append(advanced());
    if (mode === 'login') body.append(el('p', '组织登录：未接入。请联系管理员。', 'identity-note'));
    const status = el('p', message, 'identity-note'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); body.append(status);
  }
  let renderedState = '';
  const unsubscribe = session.subscribe(value => {
    const changed = JSON.stringify(value) !== renderedState; renderedState = JSON.stringify(value); state = value;
    if (!filterSelected) filter = mode === 'approvals' && state.user?.roles?.includes('audit_reader') ? 'all' : mode === 'approvals' && state.user?.roles?.includes('business_approver') ? 'pending' : 'mine';
    onStatus(value); if (changed) render();
  });
  const untask = subscribeTaskContext(value => {
    if(task.sessionKey!==value.sessionKey){materialCatalogue=null;materialDraft=new Set();}
    if (pendingBinding && pendingBinding !== value.sessionKey) { pendingBinding = null; message = '当前聊天已变化，请重新确认绑定。'; }
    else if (task.sessionKey !== value.sessionKey && ['home', 'settings'].includes(mode)) message = '';
    task = value; render();
  });
  const clock = setInterval(() => {
    for (const note of body.querySelectorAll('[data-authorization-expires]')) note.textContent = authorizationTime(Number(note.dataset.authorizationExpires));
  }, 1000);
  return () => { disposed = true; clearInterval(clock); unsubscribe(); untask(); card.remove(); };
}
