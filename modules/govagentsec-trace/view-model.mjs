export const labels = { 'session.started': '会话开始', 'session.ended': '会话结束', 'run.started': '开始运行', 'run.ended': '运行结束', 'model.started': '模型调用', 'model.ended': '模型返回',
  'model.output': '最终输出与用量', 'tool.started': '工具调用', 'tool.ended': '工具结果', 'skill.observed': '读取 Skill',
  'approval.observed': '人工审批', 'task.assigned': '确认任务归属', 'assessment.completed': '质量与安全评分' };
export const graphLanes = ['LLM', 'Skill', 'MCP / 工具', '结果', '防护 / 审批'];
export const stateLabels = { blocked: '阻断', failed: '失败', pending: '待审批', approved: '审批通过', risk: '风险', normal: '' };
const fmt = value => value == null ? '缺失' : String(value);
// UI graph, timeline and offline export share visible labels, including observed vs enforced BLOCK.
export function nodePresentation(n) {
  const kind = n.event_type.startsWith('model.') ? 'model' : n.event_type.startsWith('tool.') ? (n.payload.transport === 'mcp' ? 'MCP / tool' : 'tool') : n.event_type.startsWith('skill.') ? 'Skill' : '';
  const decision = n.payload.decision;
  const verdict = decision === 'BLOCK' ? `BLOCK · ${n.payload.enforced ? '已阻断' : '仅观察'}`
    : decision === 'ALLOW' ? 'ALLOW · 放行' : decision === 'REVIEW' ? 'REVIEW · 待审核' : stateLabels[n.state];
  return { title: [n.label, kind, verdict, n.retry ? '重试' : ''].filter(Boolean).join(' · '),
    subject: n.payload.tool ?? n.payload.model ?? n.payload.name ?? '',
    timing: `+${n.offset_ms} ms · 耗时 ${fmt(n.duration_ms)} ms`,
    tokens: n.event_type.startsWith('model.') ? (n.payload.usage ? `token ${fmt(n.payload.usage.input)} / ${fmt(n.payload.usage.output)}` : 'token 未提供') : '' };
}
export function eventState(e) {
  if (e.payload.decision === 'BLOCK') return e.payload.enforced ? 'blocked' : 'risk';
  if (e.payload.failed || e.payload.outcome === 'error' || (e.event_type === 'run.ended' && e.payload.success === false)) return 'failed';
  if (e.event_type.startsWith('approval.')) return /denied|reject|timeout/.test(e.payload.status) ? 'blocked' : /approved|allow/.test(e.payload.status) ? 'approved' : 'pending';
  return e.payload.decision === 'REVIEW' ? 'risk' : 'normal';
}
export function traceGraph(trace) {
  const zero = Date.parse(trace.events[0]?.timestamp);
  const events = [...trace.events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.sequence - b.sequence);
  const nodes = events.map(e => ({ ...e, label: labels[e.event_type] ?? (e.event_type.startsWith('protection.') ? '防护判定' : e.event_type),
    duration_ms: e.payload.duration_ms ?? events.find(x => x.event_type === e.event_type.replace('.started', '.ended') && (e.tool_call_id && x.tool_call_id === e.tool_call_id || e.model_call_id && x.model_call_id === e.model_call_id))?.payload.duration_ms ?? null,
    lane: e.event_type.startsWith('model.') ? 0 : e.event_type.startsWith('skill.') ? 1 : e.event_type === 'tool.started' ? 2 : e.event_type === 'tool.ended' ? 3 : 4,
    offset_ms: Date.parse(e.timestamp) - zero, state: eventState(e),
    retry: e.event_type === 'tool.started' && events.some(x => x.sequence < e.sequence && x.event_type === 'tool.ended' && x.payload.tool === e.payload.tool && x.payload.failed) }));
  const ids = new Set(nodes.map(n => n.event_id));
  return { nodes, edges: nodes.flatMap((n, i) => [...(i ? [{ from: nodes[i - 1].event_id, to: n.event_id, kind: 'order' }] : []),
    ...(n.parent_event_id && ids.has(n.parent_event_id) ? [{ from: n.parent_event_id, to: n.event_id, kind: 'call' }] : [])]) };
}
function common(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) { if (a[i] === b[j]) { out.push(a[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return out;
}
export function compareTraces(traces) {
  if (traces.length < 2 || !traces[0].summary.task_key || traces.some(t => !t.summary.task_confirmed || t.summary.task_key !== traces[0].summary.task_key)) throw new Error('请选择同一已确认 task_key 的至少两条轨迹');
  if (traces.some(t => !t.integrity.valid)) throw new Error('哈希断链轨迹不能参加对比');
  const sequences = traces.map(t => t.summary.metrics.tool_sequence), shared = sequences.reduce(common);
  return { task_key: traces[0].summary.task_key, success_rate: traces.every(t => typeof t.summary.metrics.success === 'boolean') ? traces.filter(t => t.summary.metrics.success).length / traces.length : null,
    common_steps: shared, rows: traces.map((t, i) => { let cursor = 0; return { ...t.summary, difference_steps: sequences[i].map((tool, index) => {
      const same = shared[cursor] === tool; if (same) cursor++; return { step: index + 1, tool, different: !same };
    }) }; }) };
}
