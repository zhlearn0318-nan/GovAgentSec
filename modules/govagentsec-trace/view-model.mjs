import { tokenPresentation } from './usage.mjs';

export const labels = { 'session.started': '会话开始', 'session.ended': '会话结束', 'run.started': '开始运行', 'run.ended': '运行结束', 'model.started': '模型调用', 'model.ended': '模型返回',
  'model.output': '最终输出与用量', 'model.usage': '单次用量采集', 'tool.started': '工具调用', 'tool.ended': '工具结果', 'skill.observed': '读取 Skill',
  'approval.observed': '人工审批', 'approval.requested': '申请一次性扩权', 'approval.approved': '批准本次重试',
  'approval.rejected': '拒绝扩权', 'approval.denied': '审批操作被拒绝', 'approval.execution': '授权后的执行回执',
  'task.assigned': '确认任务归属', 'assessment.completed': '质量与安全评分' };
export const graphLanes = ['LLM', 'Skill', 'MCP / 工具', '结果', '防护 / 审批'];
export const stateLabels = { blocked: '阻断', failed: '失败', pending: '待审批', approved: '审批通过', risk: '风险', normal: '' };
const fmt = value => value == null ? '缺失' : String(value);
// UI graph, timeline and offline export share visible labels, including observed vs enforced BLOCK.
export function nodePresentation(n) {
  const kind = n.event_type.startsWith('model.') ? 'model' : n.event_type.startsWith('tool.') ? (n.payload.transport === 'mcp' ? 'MCP / tool' : 'tool') : n.event_type.startsWith('skill.') ? 'Skill' : '';
  const decision = n.payload.decision;
  const verdict = n.state === 'failed' ? '失败'
    : n.state === 'pending' && n.payload.control_status === 'pending_approval' ? '待审批 · 尚未执行'
    : n.state === 'blocked' && n.payload.control_status === 'blocked' ? 'BLOCK · 已阻断'
    : decision === 'BLOCK' ? `BLOCK · ${n.payload.enforced ? '已阻断' : '仅观察'}`
    : decision === 'ALLOW' ? 'ALLOW · 放行' : decision === 'REVIEW' ? 'REVIEW · 待审核' : decision ? '判定待核对' : stateLabels[n.state];
  return { title: [n.label, kind, verdict, n.retry ? '重试' : ''].filter(Boolean).join(' · '),
    subject: n.payload.tool ?? n.payload.model ?? n.payload.name ?? '',
    timing: `+${n.offset_ms} ms · ${Number.isFinite(n.duration_ms) ? '耗时 '+fmt(n.duration_ms)+' ms' : '耗时未采集'}`,
    tokens: tokenPresentation(n.display_token_type ?? n.event_type, n.display_token_payload ?? n.payload) };
}
export function eventState(e) {
  if (e.payload.decision === 'BLOCK') return e.payload.enforced ? 'blocked' : 'risk';
  if (e.payload.decision && !['ALLOW','REVIEW'].includes(e.payload.decision)) return 'risk';
  if (e.payload.failed || e.payload.outcome === 'error' || (e.event_type === 'run.ended' && e.payload.success === false)) return 'failed';
  if (e.payload.control_status === 'blocked') return 'blocked';
  if (e.payload.control_status === 'pending_approval') return 'pending';
  if (e.event_type === 'approval.execution') return e.payload.status === 'succeeded' ? 'normal' : e.payload.status === 'failed' ? 'failed' : 'risk';
  if (e.event_type.startsWith('approval.')) return /denied|reject|timeout|blocked/.test(e.payload.status) ? 'blocked' : /approved|allow|authorized/.test(e.payload.status) ? 'approved' : 'pending';
  return e.payload.decision === 'REVIEW' ? 'risk' : 'normal';
}
export function traceGraph(trace) {
  const zero = Date.parse(trace.events[0]?.timestamp);
  const events = [...trace.events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.sequence - b.sequence);
  const displayPayload = e => {
    if (e.event_type !== 'model.ended' || !trace.integrity?.valid) return e.payload;
    const annotations = events.filter(a => a.event_type === 'model.usage' && a.parent_event_id === e.event_id);
    const a = annotations[0];
    if (annotations.length !== 1 || a.trace_id !== e.trace_id || a.model_call_id !== e.model_call_id || !e.model_call_id
      || a.payload.source !== 'loopback-http-wrapper' || a.payload.usage_correlation_key !== e.payload.usage_correlation_key
      || a.sequence <= e.sequence) return e.payload;
    // Evidence remains immutable; only this view projection gains the appended measurement.
    if (a.payload.usage && !e.payload.usage_correlation_key) return e.payload;
    return { ...e.payload, usage: a.payload.usage, token_scope: a.payload.token_scope,
      token_missing_reason: a.payload.token_missing_reason, usage_source_event_id: a.event_id };
  };
  const nodes = events.map(e => ({ ...e, payload: displayPayload(e), label: labels[e.event_type] ?? (e.event_type.startsWith('protection.') ? '防护判定' : e.event_type),
    duration_ms: e.payload.duration_ms ?? events.find(x => x.event_type === e.event_type.replace('.started', '.ended') && (e.tool_call_id && x.tool_call_id === e.tool_call_id || e.model_call_id && x.model_call_id === e.model_call_id))?.payload.duration_ms ?? null,
    lane: e.event_type.startsWith('model.') ? 0 : e.event_type.startsWith('skill.') ? 1 : e.event_type === 'tool.started' ? 2 : e.event_type === 'tool.ended' ? 3 : 4,
    offset_ms: Date.parse(e.timestamp) - zero, state: eventState(e),
    retry: e.event_type === 'tool.started' && events.some(x => x.sequence < e.sequence && x.event_type === 'tool.ended' && x.payload.tool === e.payload.tool && x.payload.failed) }));
  const ids = new Set(nodes.map(n => n.event_id));
  return { nodes, edges: nodes.flatMap((n, i) => [...(i ? [{ from: nodes[i - 1].event_id, to: n.event_id, kind: 'order' }] : []),
    ...(n.parent_event_id && ids.has(n.parent_event_id) ? [{ from: n.parent_event_id, to: n.event_id, kind: 'call' }] : [])]) };
}
// A compact projection, not a new event ledger. Only exact call IDs pair events.
// Every protection/approval/failure is kept; omitted lifecycle metadata remains
// available in the full graph and timeline.
export function keyTraceGraph(trace) {
  const graph = traceGraph(trace), consumed = new Set(), owners = new Map();
  const nodes = [];
  for (const n of graph.nodes) {
    if (consumed.has(n.event_id)) continue;
    if (['session.started','session.ended','task.assigned','assessment.completed','model.usage'].includes(n.event_type)) continue;
    const key = n.event_type === 'tool.started' ? 'tool_call_id' : n.event_type === 'model.started' ? 'model_call_id' : null;
    const matches = key && n[key] ? graph.nodes.filter(e => e.event_type === n.event_type.replace('.started','.ended') && e[key] === n[key] && e.sequence > n.sequence) : [];
    const end = matches.length === 1 ? matches[0] : null;
    const members = end ? [n, end] : [n];
    members.forEach(e => { consumed.add(e.event_id); owners.set(e.event_id, n.event_id); });
    nodes.push({ ...n, members, display_token_type:end?.event_type, display_token_payload:end?.payload, state: end && end.state !== 'normal' ? end.state : n.state,
      duration_ms: end?.duration_ms ?? n.duration_ms,
      payload: { ...n.payload, ...(end?.payload.control_status ? {control_status:end.payload.control_status} : {}), ...(end?.payload.usage ? {usage:end.payload.usage} : {}) } });
  }
  const edges = nodes.slice(1).map((n,i) => ({from:nodes[i].event_id,to:n.event_id,kind:'order'}));
  const seen = new Set();
  for (const edge of graph.edges.filter(e => e.kind === 'call')) {
    const from=owners.get(edge.from),to=owners.get(edge.to),key=from+'>'+to;
    if(from && to && from!==to && !seen.has(key)){seen.add(key);edges.push({...edge,from,to});}
  }
  return {nodes,edges,total_events:graph.nodes.length};
}
function common(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) { if (a[i] === b[j]) { out.push(a[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return out;
}
export function compareTraces(traces) {
  if (traces.length < 2 || !traces[0].summary.task_key || traces.some(t => !t.summary.task_confirmed || t.summary.task_key !== traces[0].summary.task_key)) throw new Error('请选择已确认属于同一任务的至少两条轨迹');
  if (traces.some(t => !t.integrity.valid)) throw new Error('哈希断链轨迹不能参加对比');
  const sequences = traces.map(t => t.summary.metrics.tool_sequence), shared = sequences.reduce(common);
  return { task_key: traces[0].summary.task_key, success_rate: traces.every(t => typeof t.summary.metrics.success === 'boolean') ? traces.filter(t => t.summary.metrics.success).length / traces.length : null,
    common_steps: shared, rows: traces.map((t, i) => { let cursor = 0; return { ...t.summary, difference_steps: sequences[i].map((tool, index) => {
      const same = shared[cursor] === tool; if (same) cursor++; return { step: index + 1, tool, different: !same };
    }) }; }) };
}
