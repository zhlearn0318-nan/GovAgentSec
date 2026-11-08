import { Workshop } from '../trajectory-governance/workshop.mjs';
import { digest, redact } from './privacy.mjs';
import { selectTopK } from './scoring.mjs';

export const GENERATOR_VERSION = 'local-common-steps-v1';
// Order-preserving common subsequence; this is a local summarizer, not SkillClaw.
export function commonSequence(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) { out.push(a[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return out;
}
export function generateCandidate(store, records, { task_key, name, workshopRoot, loaderRoots, inputs = [], preconditions = [], output_format = '由操作者确认的任务输出', keep = 0.9 }) {
  const selection = selectTopK(records, task_key, { keep });
  if (selection.selected.length < 2) throw new Error('at least two safe selected traces from the confirmed task_key are required');
  const traces = selection.selected.map(row => {
    const trace = store.read(row.trace_id);
    if (!trace.integrity.valid || trace.summary.trace_status !== 'complete' || trace.summary.evidence_hash !== row.evidence_hash || trace.summary.task_key !== task_key || !trace.summary.task_confirmed) throw new Error('source evidence changed or task not confirmed');
    return trace;
  });
  const calls = traces.map(t => t.events.filter(e => e.event_type === 'tool.started'));
  if (calls.some(c => c.length > 1000)) throw new Error('too many steps for common-step analysis');
  const sequence = calls.map(c => c.map(e => e.payload.tool)).reduce(commonSequence);
  if (!sequence.length) throw new Error('no supported common steps');
  const cursors = calls.map(() => 0);
  const steps = sequence.map((tool, index) => {
    if (!/^[A-Za-z0-9_.:-]{1,120}$/.test(tool)) throw new Error('untrusted tool identifier');
    const evidence = calls.map((list, i) => {
      const found = list.findIndex((e, j) => j >= cursors[i] && e.payload.tool === tool);
      cursors[i] = found + 1;
      return { trace_id: traces[i].summary.trace_id, event_id: list[found].event_id, event_hash: list[found].event_hash };
    });
    return { step: index + 1, tool, evidence };
  });
  const fields = [...new Set(calls.flatMap(c => c.flatMap(e => e.payload.input_fields ?? [])))].filter(k => /^[A-Za-z_][A-Za-z0-9_]{0,50}$/.test(k));
  const recoveries = traces.flatMap(t => t.events.filter(e => e.event_type === 'tool.ended' && e.payload.failed).map(e => {
    const retry = t.events.find(x => x.sequence > e.sequence && x.event_type === 'tool.ended' && x.payload.tool === e.payload.tool && x.payload.failed === false);
    return { trace_id: t.summary.trace_id, failed_event_id: e.event_id, recovery_event_id: retry?.event_id ?? null, tool: e.payload.tool, outcome: retry ? 'later_same_tool_succeeded' : 'unresolved' };
  }));
  const operator = redact({ inputs, preconditions, output_format });
  const description = `Complete the ${task_key} workflow with ${[...new Set(sequence)].join(', ')}. Use operator-supplied input files and approved output paths, validate tool results, and retain required approvals.`;
  const content = ['---', `name: ${name}`, 'description: ' + JSON.stringify(description), 'category: workflow', '---', '',
    `# ${name}`, '', '## 适用任务', task_key, '', '## 必要输入',
    ...operator.inputs.map(x => '- ' + x), `- 历史工具参数字段：${fields.join('、') || '未观测；使用前确认'}`, '',
    '## 前置条件', '- 保持现有防护开启；仅使用已准入的能力。', '- 写入、外发及高影响操作必须先获得现有审批。',
    ...operator.preconditions.map(x => '- ' + x), '', '## 公共步骤',
    ...steps.map(s => `${s.step}. 使用 ${s.tool} 完成对应步骤；核验结果后继续。来源见 candidate.json generation.steps[${s.step - 1}]。`), '',
    '## 失败恢复', '- 工具失败时保留错误证据并定位原因；修正后仍须通过原审批与防护。拒绝或阻断后停止，不绕过。',
    ...recoveries.map(r => `- 轨迹 ${r.trace_id}：${r.tool} ${r.recovery_event_id ? '后续出现成功结果，需核对是否解决同一失败。' : '未观察到恢复，不承诺重试可成功。'}`), '',
    '## 输出格式', operator.output_format, '', '## 来源与使用限制',
    `生成器：${GENERATOR_VERSION}。来源 ${traces.length} 条已确认同任务轨迹。`,
    '此目录是候选区。重新通过 Aegis + Group4 联合准入、独立验证和人工确认后，方可走既有发布流程。',
    selection.selected.some(r => r.test_only) ? '来源包含本地测试评审，禁止作为生产技能发布。' : '逐步骤来源及证据哈希保存在候选元信息。', ''].join('\n');
  const workshop = new Workshop(workshopRoot, loaderRoots);
  const candidate = workshop.create({ name, content,
    source_traces: selection.selected.map(r => ({ trace_id: r.trace_id, evidence_hash: r.evidence_hash, original_task_group: task_key })),
    generation: { version: GENERATOR_VERSION, source: 'local-deterministic', test_only: selection.selected.some(r => r.test_only), task_key,
      generated_at: new Date().toISOString(), steps, recoveries, required_inputs: fields, operator_context: operator,
      selection, assessment_snapshot:records.filter(r=>r.task_key===task_key).map(r=>({trace_id:r.trace_id,task_key:r.task_key,
        evidence_hash:r.evidence_hash,quality:r.quality,safety:r.safety,test_only:r.test_only})),
      evidence_hash: digest(steps), requires_human_confirmation: true } });
  return { candidate, selection };
}
