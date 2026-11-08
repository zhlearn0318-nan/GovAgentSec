import { traceGraph, compareTraces, nodePresentation, graphLanes } from './view-model.mjs';
const status = { complete: '完整', partial: '采集不完整', interrupted: '运行中 / 采集中断', blocked: '已阻断', invalid: '哈希校验失败' };
const state = { blocked: '阻断', failed: '失败', pending: '待审批', approved: '审批通过', risk: '风险', normal: '' };
const missing = { run_start: '运行开始', run_end: '运行结束', llm_output: '模型输出', model_call_events: '逐次模型事件', skill_usage_unobserved: 'Skill 使用未观测', tool_result: '工具结果', capture_failed: '采集失败', token_usage: 'token 用量' };
const css = `:host{display:block;color:#233b37;font:14px 'Microsoft YaHei UI',system-ui,sans-serif}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button,input,select{border:1px solid #d6e2de;border-radius:6px;padding:8px 11px;background:white;color:inherit}button:hover{border-color:#168676}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #72bdb2;outline-offset:2px}button[aria-pressed=true],.primary{background:#176f64;color:white;border-color:#176f64}button:disabled{opacity:.5;cursor:default}.bar,.tabs,.metrics{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.bar{margin-bottom:16px}.hint{font-size:12px;color:#637570;margin:8px 0}.layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:18px}.list{max-height:72vh;overflow:auto;border-right:1px solid #dce6e2;padding-right:12px}.trace-row{display:flex;align-items:start;gap:8px;border-bottom:1px solid #e4ebe8;padding:12px 0}.trace-row button{border:0;text-align:left;width:100%;padding:4px;background:transparent}.trace-row button.active{background:#e3f0eb}.trace-row small{display:block;font-size:11px;color:#637570;margin-top:6px;overflow-wrap:anywhere}h3{font-size:18px;margin:0 0 10px;font-weight:600}.tabs{margin:14px 0}.badge{font-size:12px;border:1px solid #d7e2dd;border-radius:4px;padding:3px 6px}.warning{background:#fff2db;color:#825a16;padding:10px;border-left:3px solid #bd8b35;margin:10px 0}.error{background:#fff0ec;color:#a63f32;border-left-color:#bd4a3a}.metrics{font:12px Consolas,monospace;gap:18px;margin:14px 0}.viewer{min-width:0;display:grid;grid-template-columns:minmax(0,1fr);gap:12px}.viewer:has(.detail:not([hidden])){grid-template-columns:minmax(0,1fr) 260px}[hidden]{display:none!important}.canvas-wrap{min-height:160px;overflow:auto;max-height:64vh;border:1px solid #dce6e2;border-radius:8px}.canvas{position:relative;min-width:1000px;background:#fbfdfc}.lanes{height:36px;display:grid;grid-template-columns:repeat(5,1fr);position:sticky;top:0;z-index:2;background:#edf4f0;font-size:12px;text-align:center;align-items:center}.canvas svg{position:absolute;left:0;top:36px;pointer-events:none;width:100%}.event{height:98px;line-height:1.3;position:absolute;width:calc(20% - 14px);min-height:59px;padding:7px 9px;text-align:left;background:#fff;font-size:12px;border-left:3px solid #4d8d81;overflow:hidden}.event small{overflow-wrap:anywhere;display:block;font:10px Consolas,monospace;color:#637570;margin-top:5px}.event.blocked,.event.failed,.timeline-event.blocked,.timeline-event.failed{border-left-color:#b94736;background:#fff0ec}.event.pending,.event.risk,.timeline-event.pending,.timeline-event.risk{border-left-color:#b5802b;background:#fff5e2}.event.approved{border-left-color:#26845e}.event.selected{outline:2px solid #176f64}.detail{padding:12px;border:1px solid #dce6e2;border-radius:8px;max-height:64vh;overflow:auto}.detail pre,.candidate pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px Consolas,monospace}.timeline{list-style:none;padding:0;margin:0;max-height:64vh;overflow:auto}.timeline button{border-left:3px solid #4d8d81;overflow-wrap:anywhere;display:flex;gap:16px;width:100%;text-align:left;margin-bottom:6px}.timeline time{font:12px Consolas,monospace;color:#637570;min-width:75px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px}td,th{padding:10px;text-align:left;border-bottom:1px solid #dce6e2;vertical-align:top}th{background:#edf4f0}.diff{background:#fff0cb;border-radius:3px}.sequence{line-height:2}.empty{padding:36px 14px;color:#637570;text-align:center}.assign{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.candidate{border:1px solid #dce6e2;padding:12px;margin:10px 0;border-radius:8px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:1100px){.viewer,.viewer:has(.detail:not([hidden])){grid-template-columns:1fr}.detail{max-height:250px}.layout{grid-template-columns:210px minmax(0,1fr)}}@media(max-width:700px){.layout{grid-template-columns:1fr}.list{max-height:180px;border-right:0}.bar input{max-width:100%}}`;
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const btn = (text, action, cls) => { const b = el('button', text, cls); b.type = 'button'; b.onclick = action; return b; };
const fmt = value => value === null || value === undefined ? '缺失' : typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(3) : String(value);

export function mountTraceAudit(root, request, { initialTab = 'graph', sessionKey, traceId, initialTask = '', initialSelected = [], onTabChange, compact = false } = {}) {
  let closed = false, summaries = [], selectedId = traceId, current, tab = initialTab, version = 0, listVersion = 0, renderVersion = 0;
  let loading = true, loadError = '';
  const selected = new Set(initialSelected);
  const switchTab = next => { tab = next; onTabChange?.(next, [...selected]); render(); };
  const style = el('style', css), bar = el('div', undefined, 'bar'), layout = el('div', undefined, 'layout');
  const search = el('input'); search.type='search'; search.placeholder='搜索标题、任务或轨迹 ID'; search.setAttribute('aria-label','搜索轨迹');
  const filter = el('select'); filter.setAttribute('aria-label','轨迹状态');
  for (const [v,t] of [['','全部状态'],['complete','完整'],['partial','证据不足'],['blocked','已阻断'],['invalid','校验异常']]) {const o=el('option',t);o.value=v;filter.append(o);}
  const group = el('select'); group.setAttribute('aria-label', '按任务筛选');
  const test = el('input'); test.type = 'checkbox'; const testLabel = el('label', '包含本地合成测试'); testLabel.prepend(test);
  const notice = el('div'); notice.setAttribute('role', 'status');
  const list = el('div', undefined, 'list'), content = el('section'); content.setAttribute('aria-label', '轨迹审计');
  layout.append(list, content); bar.append(search, filter, group, testLabel, btn('刷新', load), btn('对比所选轨迹', () => switchTab('compare')), btn('候选 Skill', () => switchTab('candidates')));
  root.replaceChildren(style, bar, notice, layout);
  const visibleTraces = () => summaries.filter(t => (!group.value || t.task_key === group.value) && (sessionKey === undefined || t.session_key === sessionKey) && (!filter.value || t.trace_status===filter.value) && [t.title,t.trace_id,t.task_key].join(' ').toLowerCase().includes(search.value.toLowerCase()) && (test.checked || !['synthetic-fixture','controlled-validation','integration-test'].includes(t.source) && t.purpose!=='test'));
  function warn(text, error = false) { notice.className = 'warning' + (error ? ' error' : ''); notice.textContent = text; }
  async function load() {
    const generation = ++listVersion, selectionAtStart = version;
    try {
      const result = await request('list'); if (closed || generation !== listVersion) return;
      summaries = result.traces; const previous = group.value || initialTask; group.replaceChildren();
      for (const key of ['', ...new Set(summaries.map(t => t.task_key).filter(Boolean))]) { const option = el('option', key || '全部任务'); option.value = key; group.append(option); }
      group.value = [...group.options].some(o => o.value === previous) ? previous : '';
      notice.textContent = ''; notice.className = '';
      if (result.capture_failures?.length || result.failures?.length) warn('存在采集失败记录。相关轨迹不得用于技能演进；请检查本地采集日志。');
      for(const id of selected) if(!visibleTraces().some(t=>t.trace_id===id))selected.delete(id);
      renderList();
      // A delayed refresh must not supersede a selection made after that refresh started.
      if (version !== selectionAtStart) return;
      await reconcileSelection(true);
    } catch { if (!closed && generation === listVersion) { warn('轨迹列表无法加载，请确认采集插件已启用且工作区已登录。', true); if (version === selectionAtStart) { loading = false; loadError = notice.textContent; render(); } } }
  }
  async function reconcileSelection(refresh = false) {
    const visible = visibleTraces().filter(t => t.trace_id);
    if (visible.some(t => t.trace_id === selectedId)) { if (refresh || loading) await open(selectedId); else renderList(); }
    else if (visible.length) await open((visible.find(t => t.trace_status === 'complete') ?? visible[0]).trace_id);
    else { ++version; current = null; selectedId = null; loading = false; loadError = ''; renderList(); render(); }
  }
  function renderList() {
    list.replaceChildren();
    const filtered = visibleTraces();
    for (const t of filtered) {
      const row = el('div', undefined, 'trace-row'), check = el('input'); check.type = 'checkbox'; check.checked = selected.has(t.trace_id);
      check.setAttribute('aria-label', '选择轨迹 ' + t.title); check.disabled = !t.task_confirmed || !t.trace_id;
      check.onchange = () => check.checked ? selected.add(t.trace_id) : selected.delete(t.trace_id);
      const choose = btn(t.title, () => { tab = 'graph'; open(t.trace_id); }); choose.disabled = !t.trace_id; choose.dataset.traceId = t.trace_id ?? ''; choose.classList.toggle('active', t.trace_id === selectedId);
      choose.setAttribute('aria-current', String(t.trace_id === selectedId));
      choose.append(el('small', `${status[t.trace_status] ?? t.trace_status} · ${t.task_key ?? '任务未关联'}`), el('small', t.trace_id ?? '无法解析'));
      row.append(check, choose); list.append(row);
    }
    if (!filtered.length) list.append(el('p', '没有此范围的轨迹。请确认 govagentsec-trace 插件已启用，运行一次受管工具后刷新；也可调整筛选或勾选本地合成测试。', 'empty'));
  }
  async function open(id) {
    const generation = ++version;
    selectedId = id; current = null; loading = true; loadError = ''; renderList(); render();
    try {
      const data = await request('detail', { trace_id: id });
      if (closed || version !== generation) return;
      if (data.summary?.trace_id !== id || !Array.isArray(data.events)) throw new Error('detail mismatch');
      current = data; loading = false; render();
    } catch { if (!closed && version === generation) { loading = false; loadError = '轨迹无法读取，请检查 JSONL 和哈希锚点后重试。'; render(); } }
  }
  function render() {
    const generation = ++renderVersion;
    content.replaceChildren();
    content.dataset.traceId = selectedId ?? ''; content.setAttribute('aria-busy', String(loading));
    if (tab === 'compare') return renderCompare(generation);
    if (tab === 'candidates') return renderCandidates(generation);
    if (loading) { content.append(el('p', '正在加载轨迹…', 'empty')); return; }
    if (loadError) { content.append(el('p', loadError, 'warning error'), btn('重试加载', () => selectedId ? open(selectedId) : load())); return; }
    if (!current) { content.append(el('p', '尚无轨迹。请启用 govagentsec-trace 插件，在当前会话运行一次受管工具后刷新。只显示实际事件，不生成示意节点。', 'empty')); return; }
    try { renderTrace(); } catch { content.replaceChildren(el('p', '轨迹字段不完整，无法显示。请刷新或检查采集记录。', 'warning error')); }
  }
  function renderTrace() {
    const s = current.summary;
    content.append(el('h3', s.title), el('div', `${s.trace_id} · ${status[s.trace_status]}`, 'hint'));
    if (!current.integrity.valid) content.append(el('div', '哈希断链 / 文件不完整：' + current.integrity.errors.map(e => e.code).join('、'), 'warning error'));
    if (s.missing_fields.includes('orphan_result')) content.append(el('div', '证据不足，当前轨迹不可入选：工具结果缺少对应的开始事件（可能由宿主参数校验先行导致）。不会补造事件；评审时隔离。', 'warning error'));
    else if (['partial','invalid','interrupted'].includes(s.trace_status)) content.append(el('div','证据不足，当前轨迹不可入选；请检查采集缺失与哈希链，评审时隔离。','warning'));
    const protections=current.events.filter(e=>e.event_type.startsWith('protection.'));
    const approvals=current.events.filter(e=>e.event_type.startsWith('approval.'));
    content.append(el('p', `防护摘要：已阻断 ${protections.filter(e=>e.payload.decision==='BLOCK'&&e.payload.enforced).length} · 放行 ${protections.filter(e=>e.payload.decision==='ALLOW').length} · 审批事件 ${approvals.length}（仅统计已采集事件）`, 'hint'));
    if (s.missing_fields.length) content.append(el('div', '未观测字段：' + s.missing_fields.map(x => missing[x] ?? x).join('、'), 'warning'));
    if (s.source === 'synthetic-fixture') content.append(el('p', '本地合成测试轨迹 · 不代表真实模型效果', 'hint'));
    const m = s.metrics, metrics = el('div', undefined, 'metrics');
    for (const text of [`${m.steps} 步`, `${fmt(m.duration_ms)} ms`, `输入 ${fmt(m.input_tokens)} / 输出 ${fmt(m.output_tokens)} token`, `风险 ${m.risks}`, `Q ${fmt(s.assessment?.quality?.Q)} / S ${fmt(s.assessment?.safety?.S)}`]) metrics.append(el('span', text));
    content.append(metrics);
    if (s.assessment) content.append(el('p', '评分来源：' + s.assessment.source + ' · ' + (s.assessment.safety?.reason ?? '评分依据缺失'), 'hint'));
    const assign = el('details'); assign.append(el('summary', s.task_key ? '任务归属：' + s.task_key : '手动关联同一任务'));
    const form = el('div', undefined, 'assign'), key = el('input'); key.placeholder = 'task_key，例如 expense-word-template'; key.value = s.task_key ?? ''; key.setAttribute('aria-label', '任务标识');
    const confirm = el('input'); confirm.type = 'checkbox'; const label = el('label', '确认属于同一任务'); label.prepend(confirm);
    form.append(key, label, btn('保存关联', async () => { try { await request('assign', { trace_id: s.trace_id, task_key: key.value, confirmed: confirm.checked }); await load(); } catch { warn('请输入任务标识并确认任务归属；保存需要工作区写权限。', true); } })); assign.append(form); content.append(assign);
    const tabs = el('div', undefined, 'tabs'); for (const [id, title] of [['graph', '调用关系图'], ['timeline', '毫秒时间线']]) { const b = btn(title, () => { tab = id; render(); }); b.setAttribute('aria-pressed', String(tab === id)); tabs.append(b); } content.append(tabs);
    const viewer = el('div', undefined, 'viewer'), display = el('div'), detail = el('aside', '点击节点查看事件证据', 'detail'); detail.hidden = true; detail.setAttribute('aria-label', '事件详情'); detail.setAttribute('aria-live', 'polite'); viewer.append(display, detail); content.append(viewer);
    const graph = traceGraph(current), choose = (n, b) => {
      display.querySelectorAll('.selected').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); detail.hidden = false;
      const evidence = n.payload.usage_source_event_id ? {
        ledger_event: current.events.find(e => e.event_id === n.event_id),
        usage_annotation: current.events.find(e => e.event_id === n.payload.usage_source_event_id),
      } : n;
      detail.replaceChildren(el('strong', n.label), el('p', `${n.offset_ms} ms · ${state[n.state] || '正常'}${n.payload.usage_source_event_id ? ' · 用量来自追加注解；原始事件与哈希未改写' : ''}`, 'hint'), el('pre', JSON.stringify(evidence, null, 2)));
    };
    if (!graph.nodes.length) { display.append(el('p', '此轨迹尚无事件。请确认 govagentsec-trace 已启用，运行一次受管工具后刷新；不会生成假节点。', 'empty')); return; }
    if (tab === 'timeline') {
      const timeline = el('ol', undefined, 'timeline'); display.append(timeline);
      for (const n of graph.nodes) { const item = el('li'), p = nodePresentation(n); const b = btn('', () => choose(n, b), 'timeline-event ' + n.state); b.dataset.eventId = n.event_id; b.append(el('time', '+' + n.offset_ms + ' ms'), el('span', [p.title, p.subject, p.tokens].filter(Boolean).join(' · '))); item.append(b); timeline.append(item); }
    } else {
      display.append(el('p', '虚线表示时间顺序；实线连接明确调用。单次 token 仅显示实际采集值；宿主未暴露时说明原因。最终输出标注运行汇总，不分摊到各次调用。', 'hint'));
      const wrap = el('div', undefined, 'canvas-wrap'), canvas = el('div', undefined, 'canvas'), lanes = el('div', undefined, 'lanes');
      graphLanes.forEach(x => lanes.append(el('span', x))); canvas.append(lanes);
      const rowHeight = 112;
      canvas.style.height = (graph.nodes.length * rowHeight + 42) + 'px'; const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('height', String(graph.nodes.length * rowHeight)); svg.setAttribute('viewBox', `0 0 790 ${graph.nodes.length * rowHeight}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true'); canvas.append(svg);
      const positions = new Map(graph.nodes.map((n, i) => [n.event_id, { x: n.lane * 158 + 79, y: i * rowHeight + 52 }]));
      for (const edge of graph.edges) { const a = positions.get(edge.from), b = positions.get(edge.to), line = document.createElementNS(svg.namespaceURI, 'path'); line.dataset.from = edge.from; line.dataset.to = edge.to; line.dataset.kind = edge.kind; line.setAttribute('d', `M ${a.x} ${a.y} L ${b.x} ${b.y}`); line.setAttribute('stroke', edge.kind === 'call' ? '#398c7c' : '#c3d4cd'); line.setAttribute('fill', 'none'); if (edge.kind === 'order') line.setAttribute('stroke-dasharray', '3 4'); svg.append(line); }
      graph.nodes.forEach((n, i) => { const p = nodePresentation(n), b = btn(p.title, () => choose(n, b), 'event ' + n.state); b.dataset.eventId = n.event_id; b.title = [p.title, p.subject, p.timing, p.tokens].filter(Boolean).join('\n'); b.style.left = `calc(${n.lane * 20}% + 7px)`; b.style.top = (i * rowHeight + 43) + 'px'; b.append(el('small', p.subject, 'event-subject'), el('small', p.timing)); if(p.tokens) b.append(el('small', p.tokens)); canvas.append(b); }); wrap.append(canvas); display.append(wrap);
    }
  }
  async function renderCompare(generation) {
    content.append(el('h3', '同任务运行对比'));
    try {
      const traces = await Promise.all([...selected].map(trace_id => request('detail', { trace_id }))); if (closed || tab !== 'compare' || renderVersion !== generation) return;
      const result = compareTraces(traces); content.append(el('p', `${result.task_key} · ${traces.length} 条 · 运行成功率 ${result.success_rate === null ? '缺失' : (result.success_rate * 100).toFixed(1) + '%'}`, 'hint'));
      const wrap = el('div', undefined, 'table-wrap'), table = el('table'), head = el('tr'); ['轨迹', '步骤', 'token 输入/输出', '耗时 ms', '成功', '风险', 'Q / S', '工具序列（黄色为差异）'].forEach(x => head.append(el('th', x))); table.append(head);
      for (const row of result.rows) { const tr = el('tr'), m = row.metrics; [row.title, m.steps, `${fmt(m.input_tokens)} / ${fmt(m.output_tokens)}`, fmt(m.duration_ms), fmt(m.success), m.risks, `${fmt(row.assessment?.quality?.Q)} / ${fmt(row.assessment?.safety?.S)}`].forEach(x => tr.append(el('td', x))); const seq = el('td', undefined, 'sequence'); row.difference_steps.forEach(d => seq.append(el('span', `${d.step}. ${d.tool} → `, d.different ? 'diff' : ''))); tr.append(seq); table.append(tr); } wrap.append(table); content.append(wrap);
      const skillName = el('input'); skillName.placeholder = '候选 Skill 名称'; skillName.value = 'task-workflow-candidate'; skillName.setAttribute('aria-label', '候选技能名称');
      content.append(el('p', '生成会重新校验来源，按同一任务的安全轨迹取 TopK。候选不会安装。', 'hint'), skillName,
        btn('归纳候选 Skill', async () => { try { const result = await request('generate', { task_key: resultKey(), name: skillName.value }); warn('已生成隔离候选：' + result.candidate.name); tab = 'candidates'; render(); } catch { warn('无法生成：需要至少两条同任务、安全通过且有 Q 的完整轨迹；请先完成本地评审。', true); } }, 'primary'));
      function resultKey() { return result.task_key; }
    } catch (e) { if (!closed && renderVersion === generation) content.append(el('p', e.message, 'empty')); }
  }
  async function renderCandidates(generation) {
    content.append(el('h3', '候选 Skill 与步骤来源'));
    try { const data = await request('candidates'); if (closed || tab !== 'candidates' || renderVersion !== generation) return;
      for (const c of data.candidates) { const box = el('article', undefined, 'candidate'); box.append(el('strong', c.name ?? c.id), el('p', `${c.status} · ${c.created_at ?? ''} · ${c.generation?.version ?? '生成器未知'}`, 'hint'));
        const gatePanel=el('section',undefined,'release-gate');gatePanel.setAttribute('aria-label','候选发布闸');
        box.append(gatePanel);loadReleaseGate(c,gatePanel,generation);
        if (c.generation?.test_only) box.append(el('p', '测试证据候选：禁止生产发布', 'warning'));
        for (const step of c.generation?.steps ?? []) { const d = el('details'); d.append(el('summary', `${step.step}. ${step.tool} · ${step.evidence.length} 条来源`), el('pre', JSON.stringify(step.evidence, null, 2))); box.append(d); }
        if (c.status === 'draft') box.append(btn('运行联合准入', async () => { try { await request('admit', { candidate_id: c.id }); renderCandidatesReload(); } catch { warn('联合准入未完成，候选保持隔离。', true); } }));
        const evidence = c.admission_passed ?? c.rejected ?? c.unverified; if (evidence) { const d = el('details'); d.append(el('summary', '准入证据'), el('pre', JSON.stringify(evidence, null, 2))); box.append(d); } content.append(box); }
      if (!data.candidates.length) content.append(el('p', '尚无候选。先关联同任务轨迹、完成本地评审，再从运行对比生成。', 'empty'));
    } catch { if (!closed && renderVersion === generation) content.append(el('p', '候选记录暂不可读', 'warning')); }
  }
  async function loadReleaseGate(candidate,panel,generation) {
    panel.append(el('h4','发布闸'),el('p','admission_passed ≠ 发布/安装','warning'));
    try {
      const gate=await request('releaseGate',{candidate_id:candidate.id});
      if(closed||generation!==renderVersion)return;
      panel.append(el('p',`状态：${gate.state} · draft → scored → admitted_allow | admitted_block →（仅人工）ready_for_review`),
        el('p',`instruction-only · 保留在 skill-workshop · 未安装${gate.summary.test_only?' · 测试证据，禁止生产发布':''}`),
        el('p',`参与轨迹 ${gate.counts.participating} · 安全通过 ${gate.counts.safe} · 隔离 ${gate.counts.quarantine}`),
        el('p',`评分来源：${gate.evidence_source==='generation_snapshot'?'生成时快照':'当前本地评分；未保存快照者不猜测历史分数'}`,'hint'));
      const table=el('table'),head=el('tr');['任务 / 轨迹','Q / S','安全判定 / 原因','TopK'].forEach(t=>head.append(el('th',t)));table.append(head);
      if(gate.selection)panel.append(el('p',`TopK：保留比例 ${gate.selection.keep} · 安全集合分母 ${gate.selection.denominator}（含其中 Q 缺失者）`,'hint'));
      for(const r of gate.rows){const tr=el('tr');[`${r.task_key} / ${r.trace_id}`,`${fmt(r.Q)} / ${fmt(r.S)}`,`${r.decision} / ${r.reason}`,r.selected?'入选':r.selection_reason].forEach(t=>tr.append(el('td',t)));table.append(tr);}
      if(gate.rows.length){const wrap=el('div',undefined,'table-wrap');wrap.append(table);panel.append(wrap);}else panel.append(el('p','评分记录缺失，不能推断通过数量或质量。','warning'));
      panel.append(el('p','候选摘要：'+(gate.summary.steps.map(s=>`${s.step}. ${s.tool}`).join(' → ')||'无可用公共步骤；仅显示结构摘要')),
        el('p',`联合准入：${gate.admission.decision??'未完成'} · ${gate.admission.reason}`),
        el('p','命中规则：'+(gate.admission.rule_ids.join('、')||'无')));
      const confirm=btn('人工确认，仅提交复核',async()=>{
        confirm.disabled=true;
        try{await request('confirmReview',{candidate_id:candidate.id,artifact_hash:gate.artifact_hash});render();}
        catch{warn('确认未完成：请核对管理员身份、候选哈希和准入状态；未执行安装。',true);}
      });
      confirm.disabled=!gate.confirmation.enabled;panel.append(confirm,el('p',gate.confirmation.reason??'只记录操作者、时间与候选哈希，不安装、不发布。','hint'));
      if(gate.confirmation.receipt){const r=gate.confirmation.receipt;panel.append(el('p',`复核回执：${r.actor} · ${r.at} · ${r.candidate_id} · 未安装`));}
    }catch{if(!closed&&generation===renderVersion)panel.append(el('p','发布闸证据暂不可用，人工确认不可用；未安装。','warning'));}
  }
  function renderCandidatesReload() { render(); }
  group.onchange = test.onchange = filter.onchange = search.oninput = () => { ++version; for(const id of selected) if(!visibleTraces().some(t=>t.trace_id===id))selected.delete(id); renderList(); reconcileSelection(); };
  if(compact){const extra=el('style','.layout{grid-template-columns:1fr}.list{max-height:120px;border-right:0}.bar{gap:6px}.bar input{max-width:100%}.viewer:has(.detail:not([hidden])){grid-template-columns:1fr}.canvas{min-width:0}.event{font-size:10px;padding:5px}.event small{font-size:9px}.bar>button:nth-last-child(-n+2){display:none}');root.append(extra);}
  render(); load();
  return () => { closed = true; version++; listVersion++; renderVersion++; root.replaceChildren(); };
}
