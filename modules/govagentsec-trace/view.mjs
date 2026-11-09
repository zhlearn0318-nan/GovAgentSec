import { traceGraph, graphLanes, compareTraces, nodePresentation } from './view-model.mjs';
const status = { complete: '完整', partial: '采集不完整', interrupted: '运行中 / 采集中断', blocked: '已阻断', invalid: '哈希校验失败' };
const missing = { run_start: '运行开始', run_end: '运行结束', llm_output: '模型输出', model_call_events: '逐次模型事件', skill_usage_unobserved: 'Skill 使用未观测', tool_result: '工具结果', capture_failed: '采集失败', token_usage: 'token 用量' };
const css = `:host{display:block;color:#233b37;font:14px 'Microsoft YaHei UI',system-ui,sans-serif}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button,input,select{border:1px solid #d6e2de;border-radius:6px;padding:8px 11px;background:white;color:inherit}button:hover{border-color:#168676}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #72bdb2;outline-offset:2px}button[aria-pressed=true],.primary{background:#176f64;color:white;border-color:#176f64}button:disabled{opacity:.5;cursor:default}.bar,.tabs,.metrics{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.bar{margin-bottom:16px}.hint{font-size:12px;color:#637570;margin:8px 0}.layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:18px}.layout>section,.viewer>div{min-width:0}.list{max-height:72vh;overflow:auto;border-right:1px solid #dce6e2;padding-right:12px}.trace-row{display:flex;align-items:start;gap:8px;border-bottom:1px solid #e4ebe8;padding:12px 0}.trace-row button{border:0;text-align:left;width:100%;padding:4px;background:transparent}.trace-row button.active{background:#e3f0eb}.trace-row small{display:block;font-size:12px;color:#637570;margin-top:6px;overflow-wrap:anywhere}h3{font-size:18px;margin:0 0 10px;font-weight:600}.tabs{margin:14px 0}.badge{font-size:12px;border:1px solid #d7e2dd;border-radius:4px;padding:3px 6px}.warning{background:#fff2db;color:#825a16;padding:10px;border-left:3px solid #bd8b35;margin:10px 0}.error{background:#fff0ec;color:#a63f32;border-left-color:#bd4a3a}.metrics{font:13px system-ui;gap:18px;margin:14px 0}.viewer{min-width:0;display:grid;grid-template-columns:minmax(0,1fr);gap:12px}.viewer:has(.detail:not([hidden])){grid-template-columns:minmax(0,1fr)}[hidden]{display:none!important}.canvas-wrap{min-height:160px;overflow:auto;max-height:64vh;border:1px solid #dce6e2;border-radius:8px}.canvas{position:relative;min-width:1100px;background:repeating-linear-gradient(to right,#fbfdfc 0,#fbfdfc calc(var(--lane-width) - 1px),#e5eee9 calc(var(--lane-width) - 1px),#e5eee9 var(--lane-width))}.lanes{height:36px;display:grid;position:sticky;top:0;z-index:2;background:#edf4f0;font-size:13px;text-align:center;align-items:center;border-bottom:1px solid #dce6e2}.lanes span{border-right:1px solid #dce6e2}.canvas svg{position:absolute;left:0;top:0;pointer-events:none;width:100%}.event{height:112px;line-height:1.35;position:absolute;padding:7px 9px;text-align:left;background:#fff;font-size:13px;border-left:3px solid #4d8d81;overflow:hidden;overflow-wrap:anywhere}.event small{display:block;font:12px Consolas,monospace;color:#637570;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.event.blocked,.event.failed,.timeline-event.blocked,.timeline-event.failed{border-left-color:#b94736;background:#fff0ec}.event.pending,.event.risk,.timeline-event.pending,.timeline-event.risk{border-left-color:#b5802b;background:#fff5e2}.event.approved{border-left-color:#26845e}.event.selected{outline:2px solid #176f64}.detail{padding:12px;position:relative;border:1px solid #dce6e2;border-radius:8px;max-height:64vh;overflow:auto}.detail pre,.candidate pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px Consolas,monospace}.timeline{list-style:none;padding:0;margin:0;max-height:64vh;overflow:auto}.timeline button{border-left:3px solid #4d8d81;overflow-wrap:anywhere;display:flex;gap:16px;width:100%;text-align:left;margin-bottom:6px}.timeline time{font:12px Consolas,monospace;color:#637570;min-width:75px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px}td,th{padding:10px;text-align:left;border-bottom:1px solid #dce6e2;vertical-align:top}th{background:#edf4f0}.diff{background:#fff0cb;border-radius:3px}.sequence{line-height:2}.empty{padding:36px 14px;color:#637570;text-align:center}.assign{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.candidate{border:1px solid #dce6e2;padding:12px;margin:10px 0;border-radius:8px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}@media(max-width:1100px){.viewer,.viewer:has(.detail:not([hidden])){grid-template-columns:1fr}.detail{max-height:250px}.layout{grid-template-columns:210px minmax(0,1fr)}}@media(max-width:700px){.layout{grid-template-columns:1fr}.list{max-height:180px;border-right:0}.bar input{max-width:100%}}`;
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const btn = (text, action, cls) => { const b = el('button', text, cls); b.type = 'button'; b.onclick = action; return b; };
const fmt = value => value === null || value === undefined ? '缺失' : typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(3) : String(value);
const traceTitle = summary => summary.title === 'Agent 运行' && Number.isFinite(Date.parse(summary.timestamp))
  ? new Date(summary.timestamp).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}) + ' 的运行'
  : summary.title;

export function mountTraceAudit(root, rawRequest, { initialTab = 'graph', sessionKey, traceId, initialTask = '', initialSelected = [], initialPack = '', onTabChange, compact = false, followLatest = false } = {}) {
  let packId = initialPack, selectedEventId = null, pollBusy = false, openedAt = Date.now(), job = null, jobBusy = false;
  const canFollow=Boolean(followLatest&&sessionKey&&!traceId);let following=canFollow;
  const request = (method, params = {}) => rawRequest(method, {...params, ...(packId ? {pack_id:packId} : {})});
  const jobStorageKey='govagentsec.trace.local-assessment-job';
  const rememberJob=()=>{try{if(job?.job_id)sessionStorage.setItem(jobStorageKey,job.job_id);else sessionStorage.removeItem(jobStorageKey);}catch{ /* Job remains in the server ledger if browser storage is unavailable. */ }};
  let closed = false, summaries = [], selectedId = traceId, current, tab = initialTab, version = 0, listVersion = 0, renderVersion = 0;
  let loading = true, loadError = '';
  const selected = new Set(initialSelected);
  const switchTab = next => { tab = next; onTabChange?.(next, [...selected]); render(); };
  const style = el('style', css + '.trace-meta{margin:8px 0}.trace-meta>summary{cursor:pointer;color:#637570;font-size:12px}.live-status{font-size:12px;color:#637570;margin:8px 0}.job-bar:empty{display:none}.job-bar{border:1px solid #d6e2de;padding:12px;margin-bottom:12px}.job-bar button{margin-left:10px}.event-group{float:right;color:#637570}.detail dl{display:grid;grid-template-columns:80px 1fr;gap:8px;margin:12px 0}.detail dd{margin:0;overflow-wrap:anywhere}.source-list{display:grid;gap:8px}.source-list button{text-align:left}.canvas svg path{vector-effect:non-scaling-stroke}.event small{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.table-wrap{margin-bottom:14px}'), bar = el('div', undefined, 'bar'), layout = el('div', undefined, 'layout');
  const search = el('input'); search.type='search'; search.placeholder='搜索标题、任务或轨迹 ID'; search.setAttribute('aria-label','搜索轨迹');
  const filter = el('select'); filter.setAttribute('aria-label','轨迹状态');
  for (const [v,t] of [['','全部状态'],['complete','完整'],['partial','证据不足'],['blocked','已阻断'],['invalid','校验异常']]) {const o=el('option',t);o.value=v;filter.append(o);}
  const group = el('select'); group.setAttribute('aria-label', '按任务筛选');
  const test = el('input'); test.type = 'checkbox'; const testLabel = el('label', '包含本地合成测试'); testLabel.prepend(test);
  const pack = el('select'); pack.setAttribute('aria-label','记录来源'); pack.append(new Option('当前工作区',''));
  const notice = el('div'); notice.setAttribute('role', 'status');
  const healthNotice = el('details',undefined,'trace-meta'); healthNotice.hidden=true; healthNotice.dataset.stateKey='capture-health';
  const liveStatus = el('div', '正在加载记录…', 'live-status'); liveStatus.setAttribute('role','status');
  const jobbar = el('div',undefined,'job-bar'); jobbar.setAttribute('role','status');
  const list = el('div', undefined, 'list'), content = el('section'); content.setAttribute('aria-label', '轨迹审计');
  const follow=btn('跟随最新运行',()=>{following=!following;updateFollow();if(following)void poll();});
  const updateFollow=()=>{follow.hidden=!canFollow||Boolean(packId);follow.setAttribute('aria-pressed',String(following));follow.title=following?'新运行到来时自动显示；选择历史运行可暂停':'已暂停跟随，点击回到最新运行';};updateFollow();
  layout.append(list, content);
  if(compact){
    const filters=el('details',undefined,'compact-filters'),fields=el('div',undefined,'filter-fields');
    filters.append(el('summary','筛选运行'));fields.append(search,filter,group,testLabel);filters.append(fields);
    bar.append(follow,btn('刷新',load),filters);
  }else bar.append(pack, follow, search, filter, group, testLabel, btn('刷新', load), btn('对比所选轨迹', () => switchTab('compare')), btn('候选 Skill', () => switchTab('candidates')));
  root.replaceChildren(style, bar, notice, healthNotice, jobbar, liveStatus, layout);
  pack.onchange = () => { packId=pack.value; following=false;updateFollow();selected.clear(); selectedId=null; current=null; selectedEventId=null; group.value=''; tab='graph'; version++; showJob();load(); };
  rawRequest('historyPacks',{}).then(result=>{if(closed)return;for(const item of result.packs??[]){const option=el('option',item.label+' · 历史只读');option.value=item.id;pack.append(option);}pack.value=packId;}).catch(()=>{pack.title='历史记录暂不可用，仍可查看当前工作区';});
  const visibleTraces = () => summaries.filter(t => (!group.value || t.task_key === group.value) && (packId || sessionKey === undefined || t.session_key === sessionKey) && (!filter.value || t.trace_status===filter.value) && [t.title,t.trace_id,t.task_key].join(' ').toLowerCase().includes(search.value.toLowerCase()) && (test.checked || !['synthetic-fixture','controlled-validation','integration-test'].includes(t.source) && t.purpose!=='test'));
  function warn(text, error = false) { notice.className = 'warning' + (error ? ' error' : ''); notice.textContent = text; }
  async function load() {
    const generation = ++listVersion, selectionAtStart = version;
    try {
      const result = await request('list'); if (closed || generation !== listVersion) return;
      summaries = result.traces; const previous = group.value || initialTask; group.replaceChildren();
      for (const key of ['', ...new Set(summaries.map(t => t.task_key).filter(Boolean))]) { const option = el('option', key || '全部任务'); option.value = key; group.append(option); }
      group.value = [...group.options].some(o => o.value === previous) ? previous : '';
      notice.textContent = ''; notice.className = '';
      const failures = (result.capture_failures?.length??0)+(result.failures?.length??0);
      healthNotice.hidden=!failures; healthNotice.replaceChildren(el('summary',`另有 ${failures} 条采集异常记录`),el('p','受影响记录会单独标记，不能用于候选生成；其余记录按各自完整性核验。'));
      liveStatus.textContent=packId?'历史记录 · 只读，不代表本次运行':'已更新 · '+new Date().toLocaleTimeString('zh-CN');
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
    else if (visible.length) await open((compact ? visible[0] : visible.find(t => t.trace_status === 'complete') ?? visible[0]).trace_id);
    else { ++version; current = null; selectedId = null; loading = false; loadError = ''; renderList(); render(); }
  }
  function renderList() {
    list.replaceChildren();
    const filtered = visibleTraces();
    for (const t of filtered) {
      const row = el('div', undefined, 'trace-row'), check = el('input'); check.type = 'checkbox'; check.checked = selected.has(t.trace_id);
      check.setAttribute('aria-label', '选择轨迹 ' + t.title); check.disabled = !t.task_confirmed || !t.trace_id;
      check.onchange = () => check.checked ? selected.add(t.trace_id) : selected.delete(t.trace_id);
      const choose = btn(traceTitle(t), () => { following=false;updateFollow();tab = 'graph'; open(t.trace_id); }); choose.disabled = !t.trace_id; choose.dataset.traceId = t.trace_id ?? ''; choose.classList.toggle('active', t.trace_id === selectedId);
      choose.setAttribute('aria-current', String(t.trace_id === selectedId));
      if(compact)choose.append(el('small',status[t.trace_status] ?? t.trace_status));
      else choose.append(el('small', `${status[t.trace_status] ?? t.trace_status} · ${t.task_key ?? '任务未关联'}`), el('small', t.timestamp ? new Date(t.timestamp).toLocaleString('zh-CN') : '时间未采集'));
      if(!compact)row.append(check);row.append(choose);list.append(row);
    }
    if (!filtered.length) list.append(el('p', '没有此范围的轨迹。请确认 govagentsec-trace 插件已启用，运行一次受管工具后刷新；也可调整筛选或勾选本地合成测试。', 'empty'));
  }
  async function open(id) {
    const generation = ++version;
    selectedEventId = selectedId === id ? selectedEventId : null; openedAt=Date.now(); selectedId = id; current = null; loading = true; loadError = ''; renderList(); render();
    try {
      const data = await request('detail', { trace_id: id });
      if (closed || version !== generation) return;
      if (data.summary?.trace_id !== id || !Array.isArray(data.events)) throw new Error('detail mismatch');
      current = data; loading = false; render();
    } catch { if (!closed && version === generation) { loading = false; loadError = '轨迹无法读取，请检查 JSONL 和哈希锚点后重试。'; render(); } }
  }
  function render() {
    const generation = ++renderVersion;
    const positions=[...content.querySelectorAll('.canvas-wrap,.timeline,.detail')].map(e=>[e.className,e.scrollTop,e.scrollLeft]);
    const expanded=new Set([...content.querySelectorAll('details[open][data-state-key]')].map(e=>e.dataset.stateKey));
    content.replaceChildren();
    content.dataset.traceId = selectedId ?? ''; content.setAttribute('aria-busy', String(loading));
    if (tab === 'compare') return renderCompare(generation);
    if (tab === 'candidates') return renderCandidates(generation);
    if (loading) { content.append(el('p', '正在加载轨迹…', 'empty')); return; }
    if (loadError) { content.append(el('p', loadError, 'warning error'), btn('重试加载', () => selectedId ? open(selectedId) : load())); return; }
    if (!current) { content.append(el('p', '尚无轨迹。请启用 govagentsec-trace 插件，在当前会话运行一次受管工具后刷新。只显示实际事件，不生成示意节点。', 'empty')); return; }
    try { renderTrace(); for(const [cls,top,left] of positions){const e=content.getElementsByClassName(cls)[0];if(e){e.scrollTop=top;e.scrollLeft=left;}}for(const e of content.querySelectorAll('details[data-state-key]'))e.open=expanded.has(e.dataset.stateKey); } catch { content.replaceChildren(el('p', '轨迹字段不完整，无法显示。请刷新或检查采集记录。', 'warning error')); }
  }
  function renderTrace() {
    const s=current.summary,m=s.metrics,graph=traceGraph(current);
    const protections=current.events.filter(e=>e.event_type.startsWith('protection.'));
    const approvals=current.events.filter(e=>e.event_type.startsWith('approval.'));
    const duration=Number.isFinite(m.duration_ms)?`${fmt(m.duration_ms)} ms`:'耗时未采集';
    content.append(el('h3',traceTitle(s)),el('p',`${status[s.trace_status]} · ${m.steps} 次工具调用 · ${duration} · 已阻断 ${protections.filter(e=>e.payload.decision==='BLOCK'&&e.payload.enforced).length} · 审批 ${approvals.length}`,'hint'));
    if(!current.integrity.valid)content.append(el('p','哈希断链 / 文件不完整：'+current.integrity.errors.map(e=>e.code).join('、'),'warning error'));
    if(s.missing_fields.includes('orphan_result'))content.append(el('p','证据不足，当前轨迹不可入选：工具结果缺少对应的开始事件。评审时隔离。','warning error'));
    else if(['partial','invalid','interrupted'].includes(s.trace_status))content.append(el('p','本次记录尚不完整，暂不能用于候选生成。','warning'));
    if(s.source==='synthetic-fixture')content.append(el('p','本地合成测试轨迹 · 不代表真实模型效果','hint'));
    const meta=el('details',undefined,'trace-meta');meta.dataset.stateKey='trace-meta';meta.append(el('summary','用量、评分与采集详情'));
    const assessmentLabel = s.assessment ? `过程评分 Q ${fmt(s.assessment.quality?.Q)} / S ${fmt(s.assessment.safety?.S)}` : '尚未评估';
    meta.append(el('p',`输入 ${fmt(m.input_tokens)} / 输出 ${fmt(m.output_tokens)} token · ${assessmentLabel}`));
    if(s.assessment)meta.append(el('p','评分来源：'+s.assessment.source+' · '+(s.assessment.safety?.reason??'依据缺失')));
    if(s.missing_fields.length)meta.append(el('p','未观测字段：'+s.missing_fields.map(x=>missing[x]??x).join('、')));
    meta.append(el('p','记录编号：'+s.trace_id),el('p',approvals.some(e=>e.payload.source==='identity-audit')?'批准与实际执行分别记录。':'未采集到原生审批事件；存在审批时请结合回执核对。'));content.append(meta);
    const assign=el('details',undefined,'trace-meta');assign.dataset.stateKey='assign';assign.append(el('summary',s.task_key?'任务归属：'+s.task_key:'关联同一任务'));
    const form=el('div',undefined,'assign'),key=el('input');key.placeholder='任务名称，例如台风应急简报';key.value=s.task_key??'';key.setAttribute('aria-label','任务标识');
    const confirm=el('input');confirm.type='checkbox';const label=el('label','确认属于同一任务');label.prepend(confirm);
    const save=btn('保存关联',async()=>{try{await request('assign',{trace_id:s.trace_id,task_key:key.value,confirmed:confirm.checked});await load();}catch{warn('请输入任务名称并确认归属；保存需要工作区写权限。',true);}});save.disabled=Boolean(packId);
    form.append(key,label,save);assign.append(form);if(compact)meta.append(assign);else content.append(assign);
    const tabs=el('div',undefined,'tabs');for(const [id,title] of [['graph','调用关系图'],['timeline','毫秒时间线']]){const b=btn(title,()=>switchTab(id));b.setAttribute('aria-pressed',String(tab===id));tabs.append(b);}content.append(tabs);
    const viewer=el('div',undefined,'viewer'),display=el('div'),detail=el('aside',undefined,'detail');detail.hidden=true;detail.setAttribute('aria-label','事件详情');detail.setAttribute('aria-live','polite');viewer.append(display,detail);content.append(viewer);
    const choose=(n,b,scroll=true)=>{
      selectedEventId=n.event_id;display.querySelectorAll('.selected').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');detail.hidden=false;
      const p=nodePresentation(n),members=n.members??[n],fields=el('dl');
      for(const [label,value] of [['动作',p.title],['对象',p.subject||'本次运行'],['时间',p.timing],['用量',p.tokens||'未采集'],['结果',members.at(-1).label]])fields.append(el('dt',label),el('dd',value));
      const evidenceIds=new Set(members.flatMap(e=>[e.event_id,e.payload.usage_source_event_id].filter(Boolean)));
      const evidence=current.events.filter(e=>evidenceIds.has(e.event_id));
      const raw=el('details');raw.dataset.stateKey='event-evidence';raw.append(el('summary',`原始事件证据（${evidence.length} 条）`),el('pre',JSON.stringify(evidence,null,2)));
      detail.replaceChildren(btn('关闭详情',()=>{selectedEventId=null;detail.hidden=true;b.focus();}),fields,raw);
      if(n.payload.source==='identity-audit'&&n.payload.origin_run_id&&n.payload.origin_run_id!==s.trace_id)detail.prepend(btn('查看原申请轨迹',()=>open(n.payload.origin_run_id)));
      if(scroll)detail.scrollIntoView({block:'nearest'});
    };
    if(!graph.nodes.length){display.append(el('p','此轨迹尚无事件。请确认采集已启用，运行受管工具后查看。','empty'));return;}
    if(tab==='timeline'){
      const timeline=el('ol',undefined,'timeline');display.append(timeline);
      for(const n of graph.nodes){const item=el('li'),p=nodePresentation(n),b=btn('',()=>choose(n,b),'timeline-event '+n.state);b.dataset.eventId=n.event_id;b.append(el('time','+'+n.offset_ms+' ms'),el('span',[p.title,p.subject,p.tokens].filter(Boolean).join(' · ')));item.append(b);timeline.append(item);if(n.event_id===selectedEventId)choose(n,b,false);}
    }else{
      display.append(el('p',`${graph.nodes.length} 个事件 · 从上到下按时间排列；实线为调用关联，虚线为时间顺序。可在图内横向滚动查看各栏。`,'hint'));
      const wrap=el('div',undefined,'canvas-wrap'),canvas=el('div',undefined,'canvas');
      wrap.setAttribute('aria-label','横向分栏调用关系图');wrap.tabIndex=0;
      const lanes=el('div',undefined,'lanes');lanes.style.gridTemplateColumns=`repeat(${graphLanes.length},1fr)`;
      graphLanes.forEach(name=>lanes.append(el('span',name)));
      const rowHeight=128,nodeHeight=112,top=44,height=graph.nodes.length*rowHeight+top;
      canvas.style.height=height+'px';canvas.style.setProperty('--lane-width',`${100/graphLanes.length}%`);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('height',String(height));svg.setAttribute('viewBox',`0 0 1000 ${height}`);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
      // Lane positions, labels and event order match traceGraph and the offline exporter.
      const positions=new Map(graph.nodes.map((n,i)=>[n.event_id,{x:(n.lane+.5)*1000/graphLanes.length,y:top+i*rowHeight+nodeHeight/2}]));
      for(const edge of graph.edges){
        const a=positions.get(edge.from),b=positions.get(edge.to),line=document.createElementNS(svg.namespaceURI,'path');
        line.dataset.from=edge.from;line.dataset.to=edge.to;line.dataset.kind=edge.kind;
        line.setAttribute('d',`M ${a.x} ${a.y} L ${b.x} ${b.y}`);line.setAttribute('stroke',edge.kind==='call'?'#398c7c':'#a9bdb6');
        line.setAttribute('stroke-width',edge.kind==='call'?'1.5':'1');line.setAttribute('vector-effect','non-scaling-stroke');line.setAttribute('fill','none');
        if(edge.kind==='order')line.setAttribute('stroke-dasharray','4 5');svg.append(line);
      }
      canvas.append(svg,lanes);
      for(const [i,n] of graph.nodes.entries()){
        const p=nodePresentation(n),b=btn(p.title,()=>choose(n,b),'event '+n.state);b.dataset.eventId=n.event_id;b.dataset.lane=String(n.lane);
        b.title=[p.title,p.subject,p.timing,p.tokens].filter(Boolean).join('\n');
        b.style.left=`calc(${n.lane*100/graphLanes.length}% + 8px)`;b.style.width=`calc(${100/graphLanes.length}% - 16px)`;b.style.top=(top+i*rowHeight)+'px';
        if(p.subject)b.append(el('small',p.subject,'event-subject'));b.append(el('small',p.timing));if(p.tokens)b.append(el('small',p.tokens));
        canvas.append(b);if(n.event_id===selectedEventId)choose(n,b,false);
      }
      wrap.append(canvas);display.append(wrap);
    }
  }
  function showJob() {
    rememberJob();jobbar.replaceChildren();if(!job||packId||compact)return;
    jobbar.append(el('strong',`本地过程评估 · ${job.completed}/${job.total}`),el('p',({queued:'等待评估',running:'评估中',completed:'评估完成，可查看筛选结果',cancelled:'已取消，已完成记录保留',interrupted:'服务已重启，评估中断；可重新发起，已完成记录保留',failed:'评估失败，请检查本地服务'})[job.status]??'状态待确认'));
    if(!['queued','running'].includes(job.status))jobbar.append(btn('收起评估进度',()=>{job=null;showJob();}));
    if(['queued','running'].includes(job.status))jobbar.append(btn('取消待评估项',async()=>{try{job=await rawRequest('assessmentCancel',{job_id:job.job_id});showJob();}catch{warn('取消未确认，请核对评估进度。',true);}}));
    if(job.source)jobbar.append(el('p','来源：'+job.source,'hint'));
    if(job.rows?.length){const details=el('details');details.append(el('summary','逐条评估状态'));for(const row of job.rows)details.append(el('p',`${row.trace_id.slice(0,8)} · ${row.status}${row.reason?' · '+row.reason:''}`));jobbar.append(details);}
  }
  async function renderCompare(generation) {
    content.append(el('h3','同任务运行对比'));
    try{
      const ids=[...selected],traces=await Promise.all(ids.map(trace_id=>request('detail',{trace_id})));
      if(closed||tab!=='compare'||renderVersion!==generation)return;
      const result=compareTraces(traces);content.append(el('p',`${result.task_key} · 仅使用所选 ${traces.length} 条运行 · 运行结束成功率 ${result.success_rate===null?'未采集':(result.success_rate*100).toFixed(1)+'%'}`,'hint'));
      const controls=el('div',undefined,'bar'),judge=el('select');judge.setAttribute('aria-label','本地评审方式');judge.append(new Option('Ollama本地评审','ollama'),new Option('启发式过程评审','heuristic'));
      const assess=btn('评估所选运行',async()=>{assess.disabled=true;try{job=await rawRequest('assessmentStart',{task_key:result.task_key,trace_ids:ids,judge:judge.value});showJob();}catch{warn('评估未启动，请检查本地评审服务、任务归属和写入权限。',true);}finally{assess.disabled=Boolean(packId)||Boolean(job&&['queued','running'].includes(job.status));}});assess.disabled=Boolean(packId)||Boolean(job&&['queued','running'].includes(job.status));controls.append(judge,assess);content.append(controls,el('p',packId?'历史记录只读；评分与候选来自当时运行。':'本地过程评分 · 用于候选复核，轨迹不外发。','hint'));
      const wrap=el('div',undefined,'table-wrap'),table=el('table'),head=el('tr');['运行','步骤','输入/输出token','耗时ms','风险','Q / S','工具顺序'].forEach(t=>head.append(el('th',t)));table.append(head);
      for(const row of result.rows){const tr=el('tr'),m=row.metrics;[row.title,m.steps,`${fmt(m.input_tokens)} / ${fmt(m.output_tokens)}`,fmt(m.duration_ms),m.risks,`${fmt(row.assessment?.quality?.Q)} / ${fmt(row.assessment?.safety?.S)}`].forEach(t=>tr.append(el('td',t)));const seq=el('td',undefined,'sequence');row.difference_steps.forEach(d=>seq.append(el('span',`${d.step}. ${d.tool} → `,d.different?'diff':'')));tr.append(seq);table.append(tr);}wrap.append(table);content.append(wrap);
      if(packId)return;
      const preview=await request('selectionPreview',{task_key:result.task_key,trace_ids:ids});if(closed||tab!=='compare'||generation!==renderVersion)return;
      const selection=preview.selection,box=el('section',undefined,'selection-preview');box.setAttribute('aria-label','候选来源预览');
      box.append(el('h4','候选来源预览'),el('p',`所选 ${ids.length} · 安全集合 ${selection.denominator}（含缺少Q者） · 保留 ${selection.keep*100}% · 目标 ${selection.requested_count} · 实际入选 ${selection.selected.length}`));
      const decisions=el('details');decisions.append(el('summary','查看入选与隔离原因'));for(const row of selection.decisions)decisions.append(el('p',`${row.trace_id.slice(0,8)} · ${row.selected?'入选':row.reason}`));box.append(decisions);
      if(!preview.can_generate)box.append(el('p',selection.selected.length<2?'生成至少需要2条最终入选记录。请补充同任务的合格运行并重新评估。':'当前来源尚不能生成候选，请核对评估与完整性。','warning'));
      const name=el('input');name.placeholder='候选 Skill 名称';name.value='task-workflow-candidate';name.setAttribute('aria-label','候选技能名称');
      const generate=btn('归纳候选 Skill',async()=>{generate.disabled=true;try{const generated=await request('generate',{task_key:result.task_key,trace_ids:ids,snapshot_hash:preview.snapshot_hash,name:name.value});warn('已生成隔离候选：'+generated.candidate.name);switchTab('candidates');}catch{warn('来源或评分已变化，请重新查看筛选结果；未安装任何技能。',true);render();}},'primary');generate.disabled=!preview.can_generate;box.append(name,generate,el('p','只使用此处所选和已核验的来源。候选尚未安装。','hint'));content.append(box);
    }catch(e){if(!closed&&generation===renderVersion)content.append(el('p',e.message==='request failed'?'无法读取本地评估，请刷新后重试。':e.message,'empty'));}
  }
  async function renderCandidates(generation) {
    content.append(el('h3', '候选 Skill 与步骤来源'));
    try { const data = await request('candidates'); if (closed || tab !== 'candidates' || renderVersion !== generation) return;
      for (const c of data.candidates) { const box = el('article', undefined, 'candidate'); box.append(el('strong', c.name ?? c.id), el('p', `${({draft:'待评审',admission_passed:'准入通过',rejected:'已拒绝',unverified:'待核验'})[c.status]??'待核对'} · ${c.created_at ?? ''}`, 'hint'));
        const gatePanel=el('section',undefined,'release-gate');gatePanel.setAttribute('aria-label','候选发布闸');
        box.append(gatePanel);loadReleaseGate(c,gatePanel,generation);
        if (c.generation?.test_only) box.append(el('p', '测试证据候选：禁止生产发布', 'warning'));
        for (const step of c.generation?.steps ?? []) { const d=el('details'),sources=el('div',undefined,'source-list');d.append(el('summary',`${step.step}. ${step.tool} · ${step.evidence.length} 条来源`));for(const [i,e] of step.evidence.entries())sources.append(btn('查看来源 '+(i+1)+' · '+e.trace_id.slice(0,8),async()=>{tab='graph';await open(e.trace_id);selectedEventId=e.event_id;render();}));const raw=el('details');raw.append(el('summary','来源标识与哈希'),el('pre',JSON.stringify(step.evidence,null,2)));d.append(sources,raw);box.append(d); }
        if (c.status === 'draft' && !packId) box.append(btn('运行联合准入', async () => { try { await request('admit', { candidate_id: c.id }); renderCandidatesReload(); } catch { warn('联合准入未完成，候选保持隔离。', true); } }));
        const evidence = c.admission_passed ?? c.rejected ?? c.unverified; if (evidence) { const d = el('details'); d.append(el('summary', '准入证据'), el('pre', JSON.stringify(evidence, null, 2))); box.append(d); } content.append(box); }
      if (!data.candidates.length) content.append(el('p', '尚无候选。先关联同任务轨迹、完成本地评审，再从运行对比生成。', 'empty'));
    } catch { if (!closed && renderVersion === generation) content.append(el('p', '候选记录暂不可读', 'warning')); }
  }
  async function loadReleaseGate(candidate,panel,generation) {
    panel.append(el('h4','发布审核'),el('p','准入通过后仍需人工复核，候选尚未安装。','warning'));
    try {
      const gate=await request('releaseGate',{candidate_id:candidate.id});
      if(closed||generation!==renderVersion)return;
      panel.append(el('p',`状态：${({draft:'待评审',scored:'已评审',admitted_allow:'准入通过',admitted_block:'准入阻断',ready_for_review:'待人工复核'})[gate.state]??'待核对'}`),
        el('p',`技能说明保存在候选工坊，尚未安装${gate.summary.test_only?'；仅供测试，禁止生产发布':''}`),
        el('p',`参与轨迹 ${gate.counts.participating} · 安全通过 ${gate.counts.safe} · 隔离 ${gate.counts.quarantine}`),
        el('p',`评分来源：${gate.evidence_source==='generation_snapshot'?'生成时快照':'当前本地评分；未保存快照者不猜测历史分数'}`,'hint'));
      const table=el('table'),head=el('tr');['任务 / 轨迹','Q / S','安全判定 / 原因','TopK'].forEach(t=>head.append(el('th',t)));table.append(head);
      if(gate.selection)panel.append(el('p',`TopK：保留比例 ${gate.selection.keep} · 安全集合分母 ${gate.selection.denominator}（含其中 Q 缺失者）`,'hint'));
      for(const r of gate.rows){const tr=el('tr');[`${r.task_key} / ${r.trace_id}`,`${fmt(r.Q)} / ${fmt(r.S)}`,`${r.decision} / ${r.reason}`,r.selected?'入选':r.selection_reason].forEach(t=>tr.append(el('td',t)));table.append(tr);}
      if(gate.rows.length){const wrap=el('div',undefined,'table-wrap');wrap.append(table);const details=el('details');details.append(el('summary','评分与筛选依据'),wrap);panel.append(details);}else panel.append(el('p','评分记录缺失，不能推断通过数量或质量。','warning'));
      panel.append(el('p','候选摘要：'+(gate.summary.steps.map(s=>`${s.step}. ${s.tool}`).join(' → ')||'无可用公共步骤；仅显示结构摘要')),
        el('p',`联合准入：${({allow:'通过',block:'拒绝'})[gate.admission.decision]??'未完成'}`),
        el('p','命中规则：'+(gate.admission.rule_ids.join('、')||'无')));
      const confirm=btn('人工确认，仅提交复核',async()=>{
        confirm.disabled=true;
        try{await request('confirmReview',{candidate_id:candidate.id,artifact_hash:gate.artifact_hash});render();}
        catch{warn('确认未完成：请核对管理员身份、候选哈希和准入状态；未执行安装。',true);}
      });
      confirm.disabled=Boolean(packId)||!gate.confirmation.enabled;panel.append(confirm,el('p',packId?'历史记录只读，不执行复核或安装。':gate.confirmation.enabled?'确认仅记录复核，不安装。':'需要具备候选复核权限的管理员处理。','hint'));
      if(gate.confirmation.receipt){const r=gate.confirmation.receipt;panel.append(el('p',`复核回执：${r.actor} · ${r.at} · ${r.candidate_id} · 未安装`));}
    }catch{if(!closed&&generation===renderVersion)panel.append(el('p','发布闸证据暂不可用，人工确认不可用；未安装。','warning'));}
  }
  function renderCandidatesReload() { render(); }
  group.onchange = test.onchange = filter.onchange = search.oninput = () => { ++version; for(const id of selected) if(!visibleTraces().some(t=>t.trace_id===id))selected.delete(id); renderList(); reconcileSelection(); };
  async function poll() {
    if(closed||document.hidden)return;
    if(job&&['queued','running'].includes(job.status)&&!jobBusy){jobBusy=true;try{job=await rawRequest('assessmentStatus',{job_id:job.job_id});showJob();if(!['queued','running'].includes(job.status))render();}catch{liveStatus.textContent='评估进度暂不可读，已完成记录仍保留。';}finally{jobBusy=false;}}
    if(packId||pollBusy||loading||!['graph','full','timeline'].includes(tab))return;
    if(root.activeElement?.matches('input[type=search],input[type=text],textarea'))return;
    if(following){
      pollBusy=true;const generation=version;
      try{const data=await request('list',{session_key:sessionKey});if(closed||generation!==version||!following)return;
        summaries=(data.traces??[]).filter(t=>t.session_key===sessionKey&&t.trace_id);
        const latest=[...visibleTraces()].sort((a,b)=>(Date.parse(b.timestamp)||0)-(Date.parse(a.timestamp)||0))[0];
        const listTop=list.scrollTop;renderList();list.scrollTop=listTop;
        if(latest&&latest.trace_id!==selectedId){await open(latest.trace_id);return;}
      }catch{liveStatus.textContent='最新运行暂不可读，保留当前记录。';return;}finally{pollBusy=false;}
    }
    if(!current){pollBusy=true;try{await load();}finally{pollBusy=false;}return;}
    const ended=current.events.findLast(e=>e.event_type==='run.ended'),age=Date.now()-Date.parse(ended?.timestamp??'');
    if(ended&&Number.isFinite(age)&&age>120000){liveStatus.textContent='历史运行 · 已停止自动更新';return;}
    if(!ended&&Date.now()-openedAt>30*60*1000){liveStatus.textContent='采集长时间未结束，可手动刷新核对';return;}
    pollBusy=true;const id=selectedId,generation=version;
    try{const data=await request('detail',{trace_id:id});if(closed||generation!==version||selectedId!==id)return;
      if(data.summary?.trace_id!==id||!Array.isArray(data.events))throw Error('detail mismatch');
      const changed=JSON.stringify(data)!==JSON.stringify(current);current=data;
      liveStatus.textContent='自动更新 · '+new Date().toLocaleTimeString('zh-CN');if(changed){summaries=summaries.map(t=>t.trace_id===id?data.summary:t);const listTop=list.scrollTop;renderList();list.scrollTop=listTop;render();}
    }catch{if(!closed&&generation===version)liveStatus.textContent='连接中断，当前显示上次记录；恢复后继续更新。';}finally{pollBusy=false;}
  }
  const timer=setInterval(()=>{void poll();},1500);timer.unref?.();
  const visibility=()=>{if(!document.hidden)void poll();};document.addEventListener('visibilitychange',visibility);
  let resizeTimer;const resize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!closed&&['graph','full','timeline'].includes(tab))render();},150);};window.addEventListener('resize',resize);
  if(compact){const extra=el('style','.layout{grid-template-columns:1fr;gap:10px}.list{max-height:68px;border-right:0;padding-right:0}.trace-row{padding:3px 0}.trace-row button{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px}.trace-row small{margin:0;flex-shrink:0}.bar{gap:6px;margin-bottom:8px}.bar input{max-width:100%}.compact-filters>summary{cursor:pointer;padding:8px 10px;border:1px solid #d6e2de;border-radius:6px;background:white}.compact-filters[open]{flex-basis:100%}.filter-fields{display:flex;gap:8px;flex-wrap:wrap;padding:10px 0}.trace-meta{font-size:12px}.live-status{margin:4px 0}.tabs{margin:10px 0;gap:5px}.tabs button{padding:7px 9px}h3{font-size:16px;margin-bottom:6px}');root.append(extra);}
  render(); load();
  try{const id=!compact&&sessionStorage.getItem(jobStorageKey);if(id)rawRequest('assessmentStatus',{job_id:id}).then(value=>{if(!closed&&!job){job=value;showJob();}}).catch(()=>{try{sessionStorage.removeItem(jobStorageKey);}catch{}});}catch{}
  return () => { closed = true; clearInterval(timer);clearTimeout(resizeTimer);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);version++; listVersion++; renderVersion++; root.replaceChildren(); };
}
