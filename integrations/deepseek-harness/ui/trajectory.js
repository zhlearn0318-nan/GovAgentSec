(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const status = { complete: '证据完整', partial: '证据不全', interrupted: '运行中断', invalid: '证据异常', blocked: '已阻断' };
  const life = new AbortController();
  let timer, pending = false, selected, graph, detailAbort;
  const graphNodes = new Map();
  async function get(path, signal = life.signal) {
    const response = await fetch(new URL(path, document.baseURI), { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) });
    const value = await response.json();
    if (!response.ok || !value.ok) throw Error(value.error?.message ?? '连接暂不可用');
    return value.data;
  }
  function empty(target, message) {
    const row = make('tr'), cell = make('td', message, 'empty'); cell.colSpan = 4; row.append(cell); target.append(row);
  }
  function drawEdges() {
    if (!graph || $('trace-detail').hidden || location.hash !== '#trajectory') return;
    const host = $('trace-graph'), box = host.getBoundingClientRect();
    host.querySelector('svg')?.remove();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${host.scrollWidth} ${host.scrollHeight}`); svg.setAttribute('aria-hidden', 'true');
    for (const edge of graph.edges) {
      const from = graphNodes.get(edge.from), to = graphNodes.get(edge.to);
      if (!from || !to) continue;
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), path = document.createElementNS(svg.namespaceURI, 'path');
      const x1 = a.left - box.left + a.width / 2, y1 = a.bottom - box.top, x2 = b.left - box.left + b.width / 2, y2 = b.top - box.top;
      path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${y1 + 12}, ${x2} ${y2 - 12}, ${x2} ${y2}`); path.setAttribute('class', edge.kind === 'call' ? 'call-edge' : 'order-edge'); svg.append(path);
    }
    host.prepend(svg);
  }
  function showTrace(trace) {
    $('trace-detail').hidden = false;
    const row = trace.summary, valid = trace.integrity.valid;
    $('trace-integrity').textContent = valid ? '哈希链校验通过' : '哈希链异常'; $('trace-integrity').dataset.tone = valid ? '' : 'bad';
    $('trace-summary').textContent = `${row.title} · ${status[row.trace_status] ?? row.trace_status} · ${row.event_count} 个事件 · ${row.metrics.duration_ms ?? '未提供'} ms · token ${row.metrics.total_tokens ?? '未提供'}。缺失项：${row.missing_fields.join('、') || '无'}。`;
    const host = $('trace-graph'), timeline = $('trace-timeline'); host.replaceChildren(); timeline.replaceChildren(); graphNodes.clear();
    const shown = trace.graph.nodes.slice(0, 200), ids = new Set(shown.map(node => node.event_id));
    graph = { edges: trace.graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)) };
    ['模型', 'Skill', '工具调用', '工具结果', '防护与任务'].forEach((name, index) => { const label = make('strong', name, 'trace-lane'); label.style.gridColumn = String(index + 1); label.style.gridRow = '1'; host.append(label); });
    for (const [index, node] of shown.entries()) {
      const label = node.label + (node.payload.tool ? ' · ' + node.payload.tool : '');
      const card = make('div', undefined, 'trace-node'); card.dataset.event = node.event_id; card.dataset.state = node.state;
      graphNodes.set(node.event_id, card);
      card.style.gridColumn = String(node.lane + 1); card.style.gridRow = String(index + 2);
      card.append(make('strong', label), make('small', `+${node.offset_ms} ms` + (node.payload.decision ? ' · ' + node.payload.decision + (node.payload.enforced ? '（已执行门控）' : '（检测记录）') : ''))); host.append(card);
      const item = make('li'); item.append(make('strong', `#${node.sequence} ${label}`), make('span', ` +${node.offset_ms} ms`));
      if (node.parent_event_id) { const parent = trace.events.find(event => event.event_id === node.parent_event_id); if (parent) item.append(make('small', ` 对应调用 #${parent.sequence}`)); }
      timeline.append(item);
    }
    if (trace.event_count > 200 || trace.events.length > 200 || trace.truncated) timeline.append(make('li', '图与时间线仅展示前 200 个事件；JSON 证据最多返回 2000 个事件。'));
    $('trace-evidence').textContent = JSON.stringify(trace, null, 2); requestAnimationFrame(drawEdges);
  }
  async function openTrace(id) {
    selected = id; detailAbort?.abort(); detailAbort = new AbortController();
    try { showTrace(await get('trace?id=' + encodeURIComponent(id), AbortSignal.any([life.signal, detailAbort.signal]))); }
    catch (error) { if (error.name !== 'AbortError') { $('trace-health').textContent = error.message; $('trace-health').dataset.tone = 'bad'; } }
  }
  async function refresh() {
    clearTimeout(timer);
    if (pending || !['#trajectory', '#evolution'].includes(location.hash) || document.hidden) return;
    pending = true;
    try {
      if (location.hash === '#trajectory') {
        const rows = await get('trajectories'); const body = $('trace-list'); body.replaceChildren();
        for (const row of rows) {
          const line = make('tr');
          for (const text of [new Date(row.timestamp).toLocaleString('zh-CN', { hour12: false }), row.live ? '运行中' : status[row.trace_status] ?? row.trace_status, `${row.metrics?.steps ?? 0} 次工具 / ${row.metrics?.risks ?? 0} 条风险`]) line.append(make('td', text));
          const cell = make('td'), button = make('button', '查看轨迹'); button.type = 'button'; button.addEventListener('click', () => openTrace(row.trace_id)); cell.append(button); line.append(cell); body.append(line);
        }
        if (!rows.length) empty(body, '暂无采集记录。开始一次新的 Harness 对话后查看。');
        $('trace-health').textContent = `已读取 ${rows.length} 个回合`; $('trace-health').dataset.tone = '';
        if (selected && rows.some(row => row.trace_id === selected && row.live)) await openTrace(selected);
      } else {
        const data = await get('evolution'); $('evolution-status').textContent = data.calibrated ? '查看逐项门控' : '待完成本地标定';
        $('evolution-gates').replaceChildren(...data.gates.map(gate => make('li', gate)));
        $('evolution-note').textContent = data.loaderRootsConfigured ? '已配置技能加载根目录隔离检查；未通过门控的候选保留在隔离区。' : '生成前需由操作者核对全部 Harness 技能加载根目录；当前不会生成或发布候选。';
        const body = $('candidate-list'); body.replaceChildren();
        for (const candidate of data.candidates) { const row = make('tr'); for (const value of [candidate.name ?? candidate.id, candidate.status, candidate.created_at ? new Date(candidate.created_at).toLocaleString('zh-CN') : '未知', '逐项验证后人工确认']) row.append(make('td', value)); body.append(row); }
        if (!data.candidates.length) empty(body, '尚无完成来源核验的隔离候选；不会使用演示数据补充历史。');
      }
    } catch (error) { const node = location.hash === '#trajectory' ? $('trace-health') : $('evolution-status'); node.textContent = error.message; node.dataset.tone = 'bad'; }
    finally { pending = false; if (!life.signal.aborted) timer = setTimeout(refresh, 5000); }
  }
  $('refresh-traces').addEventListener('click', refresh);
  window.addEventListener('hashchange', () => { refresh(); requestAnimationFrame(drawEdges); });
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('resize', drawEdges);
  window.addEventListener('pagehide', () => { clearTimeout(timer); life.abort(); }, { once: true });
  refresh();
})();
