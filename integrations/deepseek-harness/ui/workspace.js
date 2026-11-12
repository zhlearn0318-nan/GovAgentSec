(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const views = { process: ['防护过程', '查看输入、策略、工具与输出的实时安全检查。'], input: ['行为护栏 · 输入防护', '检查用户输入与外部内容，复检模型输出。'], runtime: ['权限闸门 · 运行时安全', '查看 AgentGuard 就绪状态、策略决定与执行证据。'], supply: ['供应链安全', '使用 Aegis 与 Group4 检查本地 Skill。'], trajectory: ['过程台账 · 任务轨迹', '查看真实回合、模型尝试、工具调用和防护证据。'], evolution: ['经验自演进', '查看候选隔离、质量与安全门控，以及后续人工确认流程。'] };
  const labels = { pending: '等待', active: '检查中', passed: '通过', monitoring: '监控中', review: '待审批', blocked: '拦截', skipped: '跳过', error: '异常' };
  views.settings = ['防护设置', '查看实际覆盖，按需调整运行策略。'];
  const phases = { input: '输入检查', tool_call: '工具参数', tool_result: '工具返回', tool_gate: '工具门控', approval: '原生审批请求', output: '输出复检', skill_admission: '技能准入', policy: '风险策略' };
  const decisions = { ALLOW: '放行', REVIEW: '需复核', BLOCK: '阻断' };
  const definitions = [['input', '输入安全检查', '边界校验 · PIGuard · Qwen3Guard'], ['policy', '风险策略决策', '检测结果与放行策略'], ['tools', '工具与外部内容', '参数检查 · 原生审批 · 返回内容检测'], ['output', '模型输出复检', '发送前检查文本与思考内容']];
  const create = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  function chip(node, text, tone = '') { node.textContent = text; node.dataset.tone = tone; }
  function navigate() {
    const view = Object.hasOwn(views, location.hash.slice(1)) ? location.hash.slice(1) : 'settings';
    document.querySelectorAll('[data-page]').forEach(node => { node.hidden = node.dataset.page !== view; });
    document.querySelectorAll('[data-view]').forEach(node => { if (node.dataset.view === view) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current'); });
    $('view-title').textContent = views[view][0]; $('view-description').textContent = views[view][1];
    $('breadcrumb-current').textContent = views[view][0];
    document.title = views[view][0] + ' · GovAgentSec';
  }
  window.addEventListener('hashchange', navigate); navigate();
  function returnToChat(event) {
    if (parent === window) return;
    event.preventDefault(); parent.postMessage('govagentsec:close-workspace', location.origin);
  }
  $('back-chat').addEventListener('click', returnToChat);
  $('sidebar-chat').addEventListener('click', returnToChat);
  window.addEventListener('keydown', event => { if (event.key === 'Escape' || (event.ctrlKey && event.shiftKey && event.code === 'KeyG')) returnToChat(event); });
  const rows = new Map();
  for (const [id, title, detail] of definitions) {
    const row = create('li', undefined, 'step'); row.dataset.stepId = id;
    const marker = create('span', '·', 'step-marker'); marker.setAttribute('aria-hidden', 'true');
    const copy = create('span', undefined, 'step-copy'); copy.append(create('strong', title), create('small', detail));
    const state = create('span', '等待', 'chip'); row.append(marker, copy, state); $('steps').append(row); rows.set(id, { row, marker, state });
  }
  const config = JSON.parse($('workspace-config').textContent);
  for (const path of config.scanRoots) $('scan-roots').append(create('li', path));
  let stopped = false, timer;
  const lifetime = new AbortController();
  const api = path => new URL(path, document.baseURI);
  async function get(path) {
    const response = await fetch(api(path), { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(8000)]) });
    if (!response.ok) throw Error('连接中断');
    return response.json();
  }
  function invalidateFlow(message) {
    chip($('overall'), message, 'bad');
    $('risk').textContent = '—'; $('score').textContent = '—'; $('decision').textContent = '待核验';
    $('updated').textContent = '实时状态不可用，等待恢复';
    for (const [id, { row, marker, state }] of rows) {
      row.dataset.status = 'error'; marker.textContent = '?'; chip(state, '待核验', 'warn');
      $('sidebar-' + id).textContent = '待核验';
    }
  }
  function renderState(state) {
    if (state.version !== '1' || !Array.isArray(state.steps) || state.steps.length !== rows.size || new Set(state.steps.map(step => step.id)).size !== rows.size
      || state.steps.some(step => !rows.has(step.id) || !Object.hasOwn(labels, step.status))) throw Error('状态无效');
    const ready = state.service?.status === 'ready', baseline = state.service?.mode === 'baseline';
    const service = ready ? (baseline ? '规则基线就绪' : '防护模型就绪') : state.service?.status === 'starting' ? '防护模型启动中' : '防护服务不可用';
    chip($('connection'), service, ready ? (baseline ? 'warn' : '') : 'bad');
    chip($('input-service'), service, ready ? '' : 'bad'); $('service-label').textContent = service;
    $('service-dot').dataset.ready = String(ready);
    for (const id of ['coverage-input', 'coverage-output', 'coverage-results']) chip($(id), ready ? (baseline ? '规则基线' : '已启用') : '服务不可用 · 默认拒绝', ready ? (baseline ? 'warn' : '') : 'bad');
    $('mode').textContent = baseline ? '规则基线' : state.service?.mode === 'real' ? '真实防护模型' : '未知';
    const review = state.steps.some(step => step.status === 'review');
    chip($('overall'), state.status === 'blocked' ? '操作已阻止' : review ? '工具等待审批' : state.status === 'allowed' ? '本次输出检查通过' : state.status === 'running' ? '检查中' : '等待新消息', state.status === 'blocked' ? 'bad' : review ? 'warn' : '');
    for (const step of state.steps) {
      const { row, marker, state: badge } = rows.get(step.id); row.dataset.status = step.status;
      marker.textContent = ({ passed: '✓', blocked: '!', error: '!', review: '?', skipped: '–' })[step.status] ?? '·';
      chip(badge, labels[step.status], ['blocked', 'error'].includes(step.status) ? 'bad' : step.status === 'review' ? 'warn' : '');
      $('sidebar-' + step.id).textContent = labels[step.status];
    }
    $('risk').textContent = ({ LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '严重' })[state.riskLevel] ?? '—';
    $('score').textContent = Number.isFinite(state.riskScore) ? Math.round(Math.max(0, Math.min(1, state.riskScore)) * 100) + '%' : '—';
    $('decision').textContent = decisions[state.decision] ?? '等待检测';
    $('updated').textContent = state.status === 'idle' ? '等待新的实际检测事件' : '最近更新 ' + new Date(state.updatedAt).toLocaleTimeString('zh-CN');
    $('input-notice').textContent = !ready ? '防护模型尚未就绪，相关操作将被阻止。' : baseline ? '当前仅运行规则基线，未加载真实防护模型。' : '当前使用本机防护模型；具体检查结果以“防护过程”中的实际事件为准。';
    if (!ready) invalidateFlow(service);
  }
  function table(id, data, empty) {
    const body = $(id); body.replaceChildren();
    if (!data.length) { const row = create('tr'), cell = create('td', empty, 'empty'); cell.colSpan = 4; row.append(cell); body.append(row); }
    for (const values of data) { const row = create('tr'); for (const value of values) row.append(create('td', String(value ?? '—'))); body.append(row); }
  }
  function renderActivity(activity, empty) {
    const records = activity.map(row => [new Date(row.time).toLocaleString('zh-CN', { hour12: false }), phases[row.phase] ?? row.phase, decisions[row.decision] ?? row.decision, row.riskLevel ?? '—']);
    table('activity', records, empty);
    table('runtime-activity', records, empty);
  }
  function renderRuntime(response) {
    if (!response.ok) throw Error('状态不可用');
    const state = response.data;
    renderOverview(state);
    chip($('runtime-ready'), !state.enabled ? '未配置受控 MCP' : !state.ready ? 'AgentGuard 不可用' : state.formalIdentityReady ? 'AgentGuard 就绪' : '服务就绪 · 等待正式身份', state.ready && state.formalIdentityReady ? '' : 'warn');
    $('runtime-scope').textContent = state.enabled && !state.formalIdentityReady ? '正式 OIDC 身份尚未配置；新版默认拒绝业务调用。下列审计包含本机其他宿主的历史记录。' : '本机 AgentGuard 审计，包含其他宿主的历史调用。';
    const counts = state.counts;
    $('runtime-stats').replaceChildren();
    for (const [name, value] of [['AgentGuard 请求总数', counts?.total], ['允许', counts?.allow], ['需审批', counts?.require_approval], ['拒绝', counts?.deny]]) {
      const card = create('div', undefined, 'stat'); card.append(create('small', name), create('strong', Number.isInteger(value) ? String(value) : '—')); $('runtime-stats').append(card);
    }
    table('runtime-requests', (state.requests ?? []).map(row => [row.tool + ' / ' + row.operation, ({ allow: '允许', require_approval: '需审批', deny: '拒绝' })[row.policy_effect] ?? row.policy_effect, ({ executed_isolated: '已隔离执行', pending_approval: '等待审批', blocked: '已阻断', authorized: '已授权' })[row.status] ?? row.status, row.reason_code]), state.enabled ? '暂无本机执行记录' : '当前未配置 AgentGuard 受控 MCP；原生工具审批仍在 Harness 中处理。');
    renderActivity(state.activity ?? [], '暂无检查记录，开始一次 Harness 对话后查看。');
  }
  function renderOverview(state) {
    const counts = state?.counts;
    for (const [id, key] of [['total', 'total'], ['allow', 'allow'], ['review', 'require_approval'], ['deny', 'deny']]) {
      const value = counts?.[key]; $('settings-' + id).textContent = Number.isSafeInteger(value) && value >= 0 ? String(value) : '—';
    }
    const evidence = state?.overview?.evidence;
    const executed = counts?.executed_isolated;
    $('settings-allow-note').textContent = Number.isSafeInteger(executed) && executed >= 0 ? `已隔离执行 ${executed} 次` : '隔离执行次数待核验';
    $('settings-evidence').textContent = evidence ? `${evidence.complete} / ${evidence.total}` : '—';
    for (const [index, id] of ['gateway', 'policy', 'mcp'].entries()) {
      const ready = state?.overview?.components?.[index]?.ready;
      chip($('component-' + id), ready === true ? '已就绪' : ready === false ? '未就绪' : '待核验', ready === true ? '' : 'warn');
    }
    chip($('coverage-capture'), config.trajectoryEnabled ? '已配置' : '未启用', config.trajectoryEnabled ? '' : 'warn');
    chip($('coverage-tools'), !state ? '待核验' : state.enabled && state.ready && state.formalIdentityReady ? '受控 MCP 就绪' : '原生审批', !state || state.enabled && !state.formalIdentityReady ? 'warn' : '');
    $('settings-runtime-note').textContent = !state ? '运行状态读取失败，请刷新重试。' : !state.enabled ? '受控 MCP 尚未配置；原生工具审批在聊天中处理。' : !state.ready ? 'AgentGuard 尚未就绪，请核对运行组件。' : !state.formalIdentityReady ? '服务已就绪，受控 MCP 业务身份尚待配置。' : '指标来自本机 AgentGuard 审计，包含其他宿主的历史记录。';
  }
  let runtimeAt = 0, polling = false;
  $('refresh-settings').addEventListener('click', () => { runtimeAt = 0; clearTimeout(timer); poll(); });
  async function poll() {
    if (polling || stopped) return;
    polling = true; $('refresh-settings').disabled = true;
    try { renderState(await get('state')); }
    catch {
      chip($('connection'), '状态连接中断', 'bad'); chip($('input-service'), '状态连接中断', 'bad'); $('input-notice').textContent = '无法获取实时检测状态，请检查 Harness 连接。'; $('service-label').textContent = '状态连接中断'; $('service-dot').dataset.ready = 'false';
      for (const id of ['coverage-input', 'coverage-output', 'coverage-results']) chip($(id), '状态连接中断', 'bad');
      invalidateFlow('状态连接中断');
    }
    if (Date.now() - runtimeAt >= 5000) {
      try { renderRuntime(await get('runtime')); }
      catch { renderOverview(null); chip($('runtime-ready'), '状态连接中断', 'bad'); $('runtime-stats').replaceChildren(); table('runtime-requests', [], '无法获取运行时状态，请检查 Harness 连接。'); renderActivity([], '审计连接中断，正在重试。'); }
      runtimeAt = Date.now();
    }
    polling = false; $('refresh-settings').disabled = false;
    if (!stopped) timer = setTimeout(poll, document.hidden ? 5000 : 1000);
  }
  let report;
  $('scan-form').addEventListener('submit', async event => {
    event.preventDefault(); $('scan-button').disabled = true; $('scan-button').textContent = '检查中…'; $('scan-result-panel').hidden = false;
    $('scan-status').textContent = '正在运行本地安全检查，请等待。'; chip($('scan-decision'), '检查中'); $('scan-findings').replaceChildren(); $('scan-details').hidden = true; $('download-report').hidden = true; report = undefined;
    try {
      const response = await fetch(api('scan'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: $('scan-path').value.trim() }), signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(75000)]) });
      const value = await response.json(); if (!response.ok || !value.ok) throw Error(value.error?.message ?? '扫描未完成');
      const data = value.data; if (!Object.hasOwn(decisions, data.decision)) throw Error('检查返回无效决定');
      chip($('scan-decision'), decisions[data.decision], data.decision === 'BLOCK' ? 'bad' : data.decision === 'REVIEW' ? 'warn' : '');
      $('scan-status').textContent = data.decision === 'ALLOW' ? '本次静态检查通过。Skill 尚未安装。' : data.decision === 'REVIEW' ? '发现需要人工复核的项目。Skill 尚未安装。' : '本次检查已阻断。Skill 尚未安装。';
      for (const finding of data.aegis_findings ?? []) { const article = create('article'); article.append(create('strong', finding.title ?? finding.rule_id ?? finding.code ?? '检测发现'), create('p', finding.message ?? finding.description ?? JSON.stringify(finding)), create('small', finding.severity ?? '')); $('scan-findings').append(article); }
      report = data; $('scan-report').textContent = JSON.stringify(data, null, 2); $('scan-details').hidden = false; $('download-report').hidden = false;
    } catch (error) { chip($('scan-decision'), '检查未完成', 'bad'); $('scan-status').textContent = error.name === 'TimeoutError' ? '检查超时，请稍后重试。' : error.message; }
    finally { $('scan-button').disabled = false; $('scan-button').textContent = '开始安全检查'; }
  });
  $('download-report').addEventListener('click', () => { if (!report) return; const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); const link = create('a'); link.href = url; link.download = 'govagentsec-skill-report.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); lifetime.abort(); }, { once: true });
  // Browser back/forward cache restores the DOM; resume its paused polling lifetime through a reload.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  poll();
})();
