import { getIdentitySession } from './identity-session.mjs';
import { librarySummary } from './library-summary.mjs';

const statusText = status => ({ ok: '已完成', authorized: '已批准，等待原任务重试', pending_approval: '需审批', executed_isolated: '已执行（合成）', blocked: '已阻断', rejected: '已拒绝', interrupted: '已中断', approval_error: '审批失败' }[status] ?? '状态待确认');
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const navigate = (section, requestId) => window.dispatchEvent(new CustomEvent('gov-navigate', { detail: { section, ...(requestId ? { requestId } : {}) } }));
const materialLabel = resource => typeof resource === 'string' && resource.startsWith('nativefs://workspace/')
  ? '工作区/' + resource.slice('nativefs://workspace/'.length)
  : typeof resource === 'string' && resource.startsWith('govdoc://demo/') ? '文档库/' + resource.slice('govdoc://demo/'.length) : '受控材料';
export function mountDemoIdentity(parent, gateway, onStatus = () => {}, options = { mode: 'settings' }) {
  const mode = options.mode ?? 'settings', session = getIdentitySession(gateway);
  const card = el('section', undefined, 'section'); card.setAttribute('aria-label', '演示身份源'); card.dataset.identityMode = mode;
  const style = el('style'); style.textContent = `.identity-body{padding:18px;display:grid;gap:14px;color:#233e3b}.identity-body h2,.identity-body h3,.identity-body p{margin:0}.identity-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.identity-body select{max-width:100%;padding:8px}.identity-body button:focus-visible,.identity-body select:focus-visible{outline:2px solid #1e695b;outline-offset:3px}.identity-note{font-size:12px;color:#62756d;line-height:1.65}.identity-request{padding:15px;border:1px solid #d6e2df;border-radius:8px;display:grid;gap:9px}.identity-request[data-focused=true]{outline:2px solid #1e695b}.identity-body details{font-size:12px}.identity-body details p{overflow-wrap:anywhere;margin-top:7px}.identity-confirm{padding:14px;background:#eef5f2;border-radius:8px;display:grid;gap:10px}`;
  const body = el('div', undefined, 'identity-body'); card.append(style, body); parent.prepend(card);
  style.textContent += '.identity-body button{justify-self:start}.identity-body fieldset{border:1px solid #d6e2df;border-radius:6px;margin:0;padding:10px 14px}.identity-body legend{font-size:13px;font-weight:600}.identity-body textarea:focus-visible{outline:2px solid #1e695b;outline-offset:2px}.identity-login-form{display:grid;gap:12px;max-width:380px}.identity-login-form label{display:grid;gap:6px}.identity-login-form input{font:inherit;padding:10px;border:1px solid #c5d8d1;border-radius:6px;min-width:0}.identity-body table{border-collapse:collapse;max-width:100%}.identity-body td{padding:6px 12px 6px 0;text-align:left}';
  style.textContent += '.identity-summary{display:grid;grid-template-columns:1fr auto;gap:8px 16px}.identity-summary h2{font-size:14px;font-weight:650}.identity-summary .identity-row{grid-column:1/-1}.identity-summary .identity-note{grid-column:1/-1}.identity-actions{display:flex;gap:8px;align-items:start}@media(max-width:650px){.identity-summary{grid-template-columns:1fr}.identity-actions{flex-wrap:wrap}}';
  let state = session.snapshot(), disposed = false, busy = false, message = '', filter = 'mine', filterSelected = false;
  let receiptFilter = 'all';
  style.textContent += '.identity-approval-group{display:grid;gap:12px}.identity-approval-group+.identity-approval-group{border-top:1px solid #d6e2df;margin-top:24px;padding-top:20px}.identity-receipt-list{display:grid;gap:10px;max-height:560px;overflow:auto;padding:3px}';
  let loginAccount = '';
  const focusedRequest = () => options.requestId ?? new URL(location.href).searchParams.get('request') ?? '';
  const authorizationTime = expires => {
    const remaining = Math.max(0, Math.ceil(expires - Date.now() / 1000));
    return remaining ? `单次重试授权剩余 ${remaining} 秒，请立即返回原任务重试。` : '原动作授权已过期，需要重新申请。';
  };
  function action(label, fn, disabled = false) {
    const button = el('button', label, label==='允许一次'?'primary':'secondary'); button.type = 'button'; button.disabled = disabled || busy || state.busy;
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
    if(value.status==='blocked')message=({P004_TASK_RUNNING:'任务正在执行，结束后再修改材料。',P021_MATERIAL_PERMISSION_REQUIRED:'部分材料超出当前身份权限，原范围未改变。',P022_REAPPLICATION_NOT_AVAILABLE:'该授权不能重新申请，请核对是否已执行或尚未过期。',P002_SUBJECT_MISMATCH:'请登录原经办账号后重试。'})[value.reason_code]??'请求未获授权，本次未执行。';
    if (value.status === 'authorized') message += '；请立即返回原任务重试，到期后需重新申请。';
    if (value.executed) message += '；仅处理本机合成记录。';
  }
  function loginForm() {
    const box=el('section',undefined,'identity-confirm');box.setAttribute('aria-label','业务登录');
    box.append(el('h2','登录业务身份'),el('p','演示（非生产）','identity-note'));
    if(!state.enabled){
      box.append(el('p',state.available?'演示身份源未启用，请由管理员在防护设置的配置与维护中开启。':'身份服务暂不可用，请稍后重试。','identity-note'),action('前往防护设置',async()=>navigate('settings')));
      return box;
    }
    const form=el('form'),account=el('input'),password=el('input'),submit=el('button','登录','primary');
    account.name='account';account.autocomplete='username';account.value=loginAccount;account.required=true;account.setAttribute('aria-label','账号');account.oninput=()=>{loginAccount=account.value;};
    password.type='password';password.name='password';password.autocomplete='current-password';password.required=true;password.setAttribute('aria-label','密码');
    submit.type='submit';submit.disabled=busy||state.busy;
    const accountLabel=el('label','账号'),passwordLabel=el('label','密码');accountLabel.append(account);passwordLabel.append(password);
    form.append(accountLabel,passwordLabel,submit);form.className='identity-login-form';
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||state.busy)return;
      const name=account.value,secret=password.value;password.value='';busy=true;message='';render();
      try{await session.login(name,secret);message='已登录，身份与权限已用于当前工作区。';}
      catch{message='登录失败，请检查账号、密码或账号是否已启用。';}
      finally{busy=false;if(!disposed)render();}
    };
    const help=el('details');help.append(el('summary','演示账号说明（非生产）'));
    const table=el('table');table.setAttribute('aria-label','演示账号');
    for(const cells of [['权限级别','账号','演示口令'],['最高权限管理员（全部受管资料）','admin','Demo#Admin26'],['高级管理员（3级）','weihu','Demo#Weihu26'],['中级主管（2级）','shenpi','Demo#Shenpi26'],['基础经办（1级）','jingban','Demo#Jingban26'],['只读审计岗位','shenji','Demo#Shenji26']]){
      const row=el('tr');for(const value of cells)row.append(el('td',value));table.append(row);
    }
    help.append(table,el('p','高级管理员无需另一人审批，聊天中的动作确认仍由 OpenClaw 处理。当前工作区的待确认操作可由本人允许一次或拒绝，超出身份密级仍会阻断。仅供本机合成业务演示。','identity-note'));
    const sso=el('button','组织 SSO · 未接入','secondary');sso.type='button';sso.disabled=true;
    box.append(form,help,sso,el('p','刷新页面后需要重新登录。','identity-note'));return box;
  }
  function identitySummary(){
    const box=el('section',undefined,'identity-confirm identity-summary');box.setAttribute('aria-label','当前员工');
    box.append(el('h2',state.user.label??state.user.account??'当前员工'));
    const actions=el('div',undefined,'identity-actions');actions.append(action('切换账号',async()=>{await session.logout();message='原委托已撤销，请登录新账号。';}),action('退出登录',async()=>{await session.logout();message='已退出，关联任务授权已撤销。';}));box.append(actions);
    const permissions=state.permission_summary;
    if(permissions){
      const tier=Number.isInteger(permissions.tier)&&permissions.tier>=1&&permissions.tier<=3&&permissions.tier_label
        ? `${permissions.tier_label}（${permissions.tier}级）` : state.user.roles?.includes('audit_reader')?'只读审计':'尚未提供';
      const row=el('div',undefined,'identity-row');row.append(el('span','权限级别：'+tier),el('span',`材料：${permissions.material_ids?.length?permissions.clearance_label:'无业务读取权限'}`),el('span',`审批：${permissions.can_approve?'可处理他人申请':'不可审批'}`),el('span',`配置维护：${permissions.can_edit_rules?'可用':'无权限'}`));box.append(row);
      box.append(el('p','演示（非生产） · '+(permissions.approval_mode==='openclaw_native_only'?'无需另一人审批，保留 OpenClaw 原生确认。':state.user.roles?.includes('audit_reader')?'可查看审计并进行本地评估，不能执行业务动作。':state.personal_confirmation?'待确认操作可由本人允许一次；超出身份密级的材料不可读取。':'越任务范围需另一位审批人处理，超出身份密级的材料不可读取。'),'identity-note'));
    }else box.append(el('p','权限摘要暂不可用，请刷新后核对。','identity-note'));
    return box;
  }
  function sourceManagement(){
    const box=el('section',undefined,'identity-confirm');box.setAttribute('aria-label','演示源管理');
    box.append(el('h3','演示身份源'),el('p',state.enabled?'已启用 · 演示（非生产）':'未启用 · 演示（非生产）','identity-note'));
    if(!state.enabled)box.append(action('开启演示身份源',async()=>{await session.enable();message='演示身份源已开启，请到动态权限登录。';},!state.available),el('p','开启需要网关管理员权限。','identity-note'));
    else if(state.permission_summary?.can_switch_sandbox)box.append(action('关闭演示身份源',async()=>{await session.disable();message='演示身份源已关闭，所有演示委托已撤销。';}));
    else box.append(el('p','关闭演示身份源需要高级管理员账号。','identity-note'));
    if(!state.user)box.append(action('去动态权限登录',async()=>navigate('permissions')));
    return box;
  }
  const confirmationExpired = request => Number.isFinite(request.confirmation_expires_at) && request.confirmation_expires_at <= Date.now() / 1000;
  const isPending = request => request.status === 'pending_approval' && !request.authorization_expired && !request.authorization_consumed_at && !request.scope_invalidated && !confirmationExpired(request)
    && !['succeeded', 'failed', 'blocked'].includes(request.execution_status);
  function requestCard(request, receipt = false) {
    const item = el('article', undefined, 'identity-request'); item.dataset.requestId = request.request_id; item.dataset.status = request.status;
    if (focusedRequest() === request.request_id) item.dataset.focused = 'true';
    const chat = request.scenario === 'chat', title = chat ? (receipt ? '工具执行回执' : '聊天工具申请') : request.scenario === 'document' ? (receipt ? '材料读取回执' : '材料读取申请') : request.scenario === 'notice' ? '通知送审' : '测试付款';
    const executionLabel = chat && ({succeeded:'已执行成功',failed:'执行失败',awaiting_host_result:'执行中',pending_approval:'等待业务审批',blocked:'业务服务已阻断'})[request.execution_status];
    const label = request.status === 'pending_approval' && confirmationExpired(request) ? '确认已超时' : executionLabel || (request.authorization_consumed_at ? '授权已使用，结果待核对' : request.authorization_expired ? '授权已过期' : statusText(request.status));
    item.append(el('strong', `${title} · ${label}`), el('p', '申请人：' + (state.users?.find(u=>u.id===request.requester)?.label??request.requester)));
    const target = request.document_id ?? (request.target_resource ? materialLabel(request.target_resource) : null);
    if (target) item.append(el('p', '涉及材料：' + target));
    if(request.scope_invalidated&&request.reason_code==='P023_TASK_SCOPE_CHANGED')item.append(el('p','任务材料范围已更新，此旧授权已失效。请返回任务重新发起动作。','identity-note'));
    if (chat && request.resource_prefixes?.length) item.append(el('p', '原只读范围：' + request.resource_prefixes.map(materialLabel).join('、'), 'identity-note'));
    if (request.status === 'blocked' && ['P014_RESOURCE_OUTSIDE_TASK', 'P015_TOOL_OUTSIDE_TASK'].includes(request.reason_code)) {
      item.append(el('p', '该动作超出本任务范围，尚未执行。', 'identity-note'),
        action('申请一次性扩权', async () => result(await session.request('task_escalate', { request_id: request.request_id })), !state.execution_enabled || state.user?.id !== request.requester));
    }
    if (isPending(request)) {
      if (Number.isFinite(request.confirmation_expires_at)) item.dataset.confirmationExpires = String(request.confirmation_expires_at);
      const self = state.user?.id === request.requester, personal = self && request.can_confirm_self,
        canApprove = state.execution_enabled && (personal || state.user?.roles?.includes('business_approver') && !self);
      const buttons=el('div',undefined,'identity-row');buttons.append(
        action(personal ? '允许一次' : chat ? '批准本次重试' : '批准并执行一次', async () => result(await session.request('resolve', { request_id: request.request_id, resolution: 'approve' })), !canApprove),
        action('拒绝', async () => result(await session.request('resolve', { request_id: request.request_id, resolution: 'reject' })), !canApprove));
      item.append(el('p', personal ? '核对操作与资料后允许一次，原任务将继续。' : chat ? '批准只授权原动作单次重试，不会立即读取材料。' : '批准后仅执行这一次合成业务动作。', 'identity-note'),buttons);
      if (!canApprove) item.append(el('p', self ? '不能审批自己的申请，请另一位审批人处理。' : '需要审批身份处理。', 'identity-note'));
      if(personal)item.append(el('p','等待本人确认，允许后原操作继续一次；拒绝或超时不执行。','identity-note'));
    }
    if (request.status === 'authorized') {
      const note = el('p', request.renewed_request_id ? '已建立新的申请；此旧授权已失效。' : request.authorization_consumed_at ? '单次授权已核销，执行结果见下方回执。' : request.authorization_expired ? '原动作授权已过期，需要重新申请。' : '已批准，请立即返回原会话重试原动作；过期需重新申请。', 'identity-note');
      if (!request.authorization_consumed_at && !request.authorization_expired && Number.isFinite(request.authorization_expires_at)) {
        note.dataset.authorizationExpires = String(request.authorization_expires_at); note.textContent = authorizationTime(request.authorization_expires_at);
      }
      item.append(note);
      if(request.can_reapply)item.append(action('重新申请原动作',async()=>{
        const r=await session.request('task_reapply',{request_id:request.request_id});result(r);
        if(r.status==='pending_approval')navigate('permissions',r.request_id);
      },!state.execution_enabled||state.user?.id!==request.requester));
      if(request.renewed_request_id)item.append(action('查看新的申请',async()=>navigate('permissions',request.renewed_request_id)));
    }
    if (chat) {
      const outcome = { not_started: '尚未执行原动作', awaiting_host_result: '原动作执行中，等待回执', succeeded: '原动作执行成功', failed: '原动作执行失败', pending_approval: '业务服务仍在等待审批，尚未执行。', blocked: '业务服务已阻断，尚未执行。', unknown: '执行结果未关联；请核对原会话回执。' };
      item.append(el('p', outcome[request.execution_status] ?? outcome.unknown, 'identity-note'));
      if(mode!=='confirmations')item.append(action('返回原任务', async () => window.dispatchEvent(new CustomEvent('gov-return-task', { detail: { requestId: request.request_id } })), !request.session_key || !state.user));
      if (!request.session_key) item.append(el('p', '原会话定位不可得，不能自动返回。', 'identity-note'));
    }
    const details = el('details'); details.append(el('summary', '核验证据'));
    for (const [label, value] of [['请求编号', request.request_id], ['任务编号', request.task_id], ['原因', request.reason_code], ['权限范围', request.resource_prefixes?.join('、')], ['范围摘要', request.scope_digest], ['参数摘要', request.parameters_hash], ['审批人', request.approver]]) if (value) details.append(el('p', `${label}：${value}`));
    item.append(details); return item;
  }
  function approvals() {
    const box = el('section'); box.setAttribute('aria-label', '演示审批队列');
    const visible = state.user ? (state.requests ?? []).filter(request => !options.sessionKey || request.session_key === options.sessionKey) : [];
    if (mode === 'receipts') box.append(el('p', '审批与执行回执可结合调用图核对。', 'identity-note'));
    if (state.trace_capture?.failed) box.append(el('p', '部分审批事件未写入调用图，请核对本页回执。', 'identity-error'));
    const pending = el('section', undefined, 'identity-approval-group'); pending.setAttribute('aria-label', '待审批');
    const row = el('div', undefined, 'identity-row'); row.append(el('h3', mode === 'confirmations' ? '操作需要确认' : '待审批'));
    const select = el('select'); select.setAttribute('aria-label', '审批筛选');
    for (const [value, label] of [['pending', '待我处理'], ['mine', '我发起的'], ['all', '全部可见']]) { const option = el('option', label); option.value = value; select.append(option); }
    select.value = filter; select.onchange = () => { filter = select.value; filterSelected = true; render(); }; if(mode!=='confirmations')row.append(select); pending.append(row);
    const rows = visible.filter(request => {
      if (!isPending(request)) return false;
      if(mode==='confirmations')return request.can_confirm_self && request.requester === state.user.id;
      if (focusedRequest() === request.request_id) return true;
      return filter === 'all' || (filter === 'mine' ? request.requester === state.user.id : request.can_confirm_self && request.requester === state.user.id || state.user.roles?.includes('business_approver') && request.requester !== state.user.id);
    });
    row.append(el('span', `${rows.length} 项`, 'identity-note'));
    if (!rows.length) pending.append(el('p', '当前没有符合筛选条件的待审批事项。', 'identity-note'));
    for (const request of [...rows].reverse()) pending.append(requestCard(request));
    box.append(pending);
    // Chat confirmation cards never include completed records, even for a focused deep link.
    if (mode === 'confirmations') return box;
    const receipts = el('section', undefined, 'identity-approval-group'); receipts.setAttribute('aria-label', '执行回执');
    const receiptRow = el('div', undefined, 'identity-row'); receiptRow.append(el('h3', '执行回执'));
    const receiptSelect = el('select'); receiptSelect.setAttribute('aria-label', '回执筛选');
    for (const [value, label] of [['all', '全部可见'], ['mine', '我发起的']]) { const option = el('option', label); option.value = value; receiptSelect.append(option); }
    receiptSelect.value = receiptFilter; receiptSelect.onchange = () => { receiptFilter = receiptSelect.value; render(); };
    const records = visible.filter(request => !isPending(request) && (receiptFilter === 'all' || request.requester === state.user.id || focusedRequest() === request.request_id));
    receiptRow.append(receiptSelect, el('span', `${records.length} 项`, 'identity-note'));
    receipts.append(receiptRow, el('p', '查看已批准、已执行、已拒绝、已阻断或已过期的记录。已批准不代表已执行。', 'identity-note'));
    const list = el('div', undefined, 'identity-receipt-list');
    if (!records.length) list.append(el('p', '当前没有符合筛选条件的执行回执。', 'identity-note'));
    for (const request of [...records].reverse()) list.append(requestCard(request, true));
    receipts.append(list); box.append(receipts);
    return box;
  }
  function render() {
    if(disposed)return;
    const focus=body.getRootNode().activeElement;
    if(!busy&&!state.busy&&!state.user&&state.enabled&&body.contains(focus)&&focus?.matches('input'))return;
    body.replaceChildren();
    const permissionsPage=['permissions','login','home','approvals'].includes(mode);
    if(mode==='settings')body.append(sourceManagement());
    else if(!state.user){
      if(mode==='permissions'||mode==='login'||mode==='chat')body.append(loginForm());
      else{const row=el('div',undefined,'identity-row');row.append(el('span','先到动态权限登录','identity-note'),action('去动态权限登录',async()=>navigate('permissions',focusedRequest())));body.append(row);}
    }else if(permissionsPage||mode==='chat'){
      body.append(identitySummary(),librarySummary(state.permission_summary));
      body.append(el('p','当前账号自动用于此工作区的所有对话，资料按身份权限检查，无需逐个绑定或选材。','identity-note'));
      if(mode!=='chat')body.append(approvals());
    }else if(mode==='receipts'||mode==='confirmations')body.append(approvals());
    else body.append(el('p','当前身份：'+(state.user.label??state.user.account??'已登录')));
    const status=el('p',message,'identity-note');status.setAttribute('role','status');status.setAttribute('aria-live','polite');body.append(status);
  }
  let renderedState = '';
  const unsubscribe = session.subscribe(value => {
    const changed = JSON.stringify(value) !== renderedState; renderedState = JSON.stringify(value); state = value;
    if (!filterSelected) filter = mode === 'receipts' || state.user?.roles?.includes('audit_reader') ? 'all' : state.user?.roles?.includes('business_approver') ? 'pending' : 'mine';
    onStatus(value); if (changed) render();
  });
  const clock = setInterval(() => {
    for (const note of body.querySelectorAll('[data-authorization-expires]')) note.textContent = authorizationTime(Number(note.dataset.authorizationExpires));
    if ([...body.querySelectorAll('[data-confirmation-expires]')].some(node => Number(node.dataset.confirmationExpires) <= Date.now() / 1000)) render();
  }, 1000);
  return () => { disposed = true; clearInterval(clock); unsubscribe(); card.remove(); };
}
