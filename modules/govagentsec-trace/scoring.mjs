import { digest, RULE_VERSION, contentEvidence } from './privacy.mjs';
const unit = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const integer = n => Number.isInteger(n) && n >= 0;
export function quality({ N, U, A_r, R, H, failure_status } = {}) {
  if (!integer(N) || N === 0 || !integer(U) || U > N || !unit(H)) return { status: 'missing', Q: null, reason: 'N_U_H_missing_or_invalid' };
  const E = (N - U) / N, C = 1 - H;
  if (failure_status === 'no_observed_failure' && R === 0) return { status: 'computed', E, F: null, C, Q: (E + C) / 2, denominator: 2 };
  if (failure_status !== 'evaluated' || !integer(R) || R === 0 || !integer(A_r) || A_r > R) return { status: 'missing', E, C, Q: null, reason: 'recovery_evidence_missing' };
  const F = A_r / R;
  return { status: 'computed', E, F, C, Q: (E + F + C) / 3, denominator: 3 };
}
const levels = { A: 0, B: 1 / 3, C: 2 / 3, D: 1 };
function risk(value) {
  if (typeof value === 'string') return levels[value];
  const p = value?.probabilities;
  if (!p || value.applicable === false || Object.keys(p).sort().join('') !== 'ABCD' || !Object.values(p).every(unit) || Math.abs(Object.values(p).reduce((a, b) => a + b, 0) - 1) > 1e-6) return undefined;
  return Object.entries(levels).reduce((sum, [k, v]) => sum + p[k] * v, 0);
}
export function safety(review, { t_star, calibration_version } = {}, G) {
  if (!unit(t_star) || !calibration_version) return { status: 'missing', S: null, decision: 'quarantine', reason: 'threshold_or_calibration_version_missing' };
  const values = ['B', 'I', 'A', 'D'].map(k => risk(review?.[k]));
  if (!values.every(unit) || ![0, 1].includes(G)) return { status: 'missing', S: null, decision: 'quarantine', reason: 'safety_evidence_missing' };
  const S = 1 - (values.reduce((a, b) => a + b, 0) + G) / 5;
  return { status: 'computed', S, risks: Object.fromEntries(['B', 'I', 'A', 'D', 'G'].map((k, i) => [k, [...values, G][i]])),
    decision: S > t_star ? 'pass' : 'quarantine', reason: S > t_star ? 'above_threshold' : 'S_at_or_below_threshold', t_star, calibration_version };
}
export class LocalJudge {
  constructor() { this.source = 'local-interface'; this.locality = 'in-process'; }
  async review() { throw new Error('implement LocalJudge.review locally'); }
}
// Test evidence is supplied by the demo harness, never read from model/tool text.
export class FixtureJudge extends LocalJudge {
  constructor(evidence = {}) { super(); this.evidence = evidence; this.source = '本地测试评审器 / fixture-v1'; this.testOnly = true; }
  async review(trace) {
    const row = this.evidence[trace.summary.trace_id];
    if (!row || trace.summary.source !== 'synthetic-fixture' || row.evidence_hash !== trace.summary.evidence_hash) return { status: 'missing', reason: 'no_trusted_fixture_evidence' };
    return { status: 'reviewed', ...row };
  }
}
export async function assess(trace, judge, config) {
  if (!(judge instanceof LocalJudge) || judge.locality !== 'in-process') throw new Error('a local in-process judge is required');
  let review;
  try { review = await judge.review(trace); } catch { review = { status: 'missing', reason: 'judge_failed' }; }
  if (review.status === 'reviewed' && review.evidence_hash !== trace.summary.evidence_hash) review = { status: 'missing', reason: 'judge_evidence_hash_mismatch' };
  const hits = trace.events.flatMap(e => e.payload.rule_hits ?? []);
  const ruleCoverage = trace.events.some(e => e.event_type === 'run.started' && e.payload.rule_version === RULE_VERSION);
  const s = safety(review.safety, config, ruleCoverage ? Number(hits.length > 0) : null);
  const q = quality(review.quality);
  const toolPairs = trace.events.filter(e => e.event_type === 'tool.ended' && trace.events.some(x => x.event_type === 'tool.started' && x.tool_call_id && x.tool_call_id === e.tool_call_id));
  if (review.quality?.N !== toolPairs.length) Object.assign(q, { status: 'missing', Q: null, reason: 'N_differs_from_observed_tool_evidence' });
  const hardBlock = trace.events.some(e => e.event_type.startsWith('protection.') && e.payload.enforced && e.payload.decision === 'BLOCK');
  if (trace.summary.trace_status !== 'complete' || hardBlock || review.status !== 'reviewed') Object.assign(s, { decision: 'quarantine', reason: hardBlock ? 'enforced_security_block' : trace.summary.trace_status !== 'complete' ? 'incomplete_or_invalid_trace' : 'judge_evidence_missing' });
  if (!judge.testOnly && (!config.calibrated || config.judge_version !== judge.version)) Object.assign(s, { decision: 'quarantine', reason: 'local_calibration_not_validated' });
  return { trace_id: trace.summary.trace_id, task_key: trace.summary.task_key, task_confirmed: trace.summary.task_confirmed,
    evidence_hash: trace.summary.evidence_hash, source: judge.source, test_only: judge.testOnly === true,
    safety: s, quality: q, basis: { status: review.status, evidence_hash: review.evidence_hash ?? null,
      quality: Object.fromEntries(['N','U','A_r','R','H','failure_status'].map(k => [k,review.quality?.[k] ?? null])),
      rationale: contentEvidence(review.rationale), rule_hits: [...new Set(hits)], rule_version: RULE_VERSION }, assessed_at: new Date().toISOString() };
}
export function selectTopK(records, taskKey, { keep = 0.9 } = {}) {
  if (!taskKey || !unit(keep) || keep === 0) throw new Error('task_key and retention ratio required');
  if (new Set(records.map(r => r.trace_id)).size !== records.length) throw new Error('duplicate trace_id');
  const safe = records.map((r, i) => ({ ...r, original_order: i })).filter(r => r.task_key === taskKey && r.task_confirmed && r.safety.decision === 'pass');
  const count = Math.floor(safe.length * keep);
  safe.sort((a, b) => Number(a.quality.Q === null) - Number(b.quality.Q === null) || (b.quality.Q ?? 0) - (a.quality.Q ?? 0) || a.original_order - b.original_order);
  const selected = safe.filter(r => r.quality.status === 'computed' && unit(r.quality.Q)).slice(0, count);
  const ids = new Set(selected.map(r => r.trace_id));
  return { task_key: taskKey, denominator: safe.length, denominator_definition: 'same_task_T_safe_including_missing_Q', keep, requested_count: count,
    selected, decisions: records.map(r => ({ trace_id: r.trace_id, selected: ids.has(r.trace_id), reason: ids.has(r.trace_id) ? 'selected' : r.task_key !== taskKey || !r.task_confirmed ? 'task_not_confirmed' : r.safety.decision !== 'pass' ? r.safety.reason : r.quality.Q === null ? 'quality_missing' : 'below_topk' })), evidence_hash: digest(records) };
}
