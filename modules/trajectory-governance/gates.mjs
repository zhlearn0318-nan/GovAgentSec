const unit = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

export function safetyGate({ trace_status, hard_findings = [], review, calibration, judge_digest, prompt_version, rule_version, task_family }) {
  const confirmed = hard_findings.filter(f => f.confirmed === true && f.authorization_evidence && f.action_evidence);
  if (confirmed.length) return { decision: 'reject', reason: 'confirmed_boundary_violation', hard_findings: confirmed, score: null };
  if (trace_status !== 'complete') return { decision: 'unverified', reason: 'incomplete_trace' };
  if (!review || review.status !== 'verified' || !['B', 'I', 'A', 'D', 'G'].every(k => unit(review[k]))) return { decision: 'unverified', reason: 'invalid_or_unknown_review' };
  const score = 1 - ['B', 'I', 'A', 'D', 'G'].reduce((sum, k) => sum + review[k], 0) / 5;
  if (!calibration || calibration.validated !== true || !unit(calibration.threshold) || !judge_digest || !prompt_version || !rule_version || calibration.judge_digest !== judge_digest || calibration.prompt_version !== prompt_version || calibration.rule_version !== rule_version || calibration.task_family !== task_family || !calibration.evidence_hash) {
    return { decision: 'unverified', score, reason: 'local_calibration_required' };
  }
  if (hard_findings.length) return { decision: 'review', score, reason: 'unresolved_rule_evidence' };
  return { decision: score > calibration.threshold ? 'pass' : 'reject', score, threshold: calibration.threshold, reason: 'calibrated_score', judge_digest, rule_version: calibration.rule_version };
}

export function qualityGate({ N, U, H, F, recovery_status, factuality_scope }) {
  if (!Number.isInteger(N) || N <= 0) return { status: 'unverified', reason: 'efficiency_not_applicable' };
  if (!Number.isInteger(U) || U < 0 || U > N || !unit(H) || factuality_scope !== 'observable_trajectory') return { status: 'unverified', reason: 'invalid_quality_evidence' };
  const E = (N - U) / N, C = 1 - H;
  if (recovery_status === 'no_observed_failure') return { status: 'verified', E, C, F: null, Q: (E + C) / 2 };
  if (recovery_status === 'evaluated' && unit(F)) return { status: 'verified', E, C, F, Q: (E + C + F) / 3 };
  return { status: 'unverified', reason: 'recovery_evaluation_missing_or_failed' };
}

export function selectExperiences(records, taskFamily, k) {
  if (!Number.isInteger(k) || k < 1) throw new Error('K must be a positive integer');
  const decisions = records.map((r, index) => {
    const reasons = [];
    if (r.task_family !== taskFamily) reasons.push('different_task_family');
    if (r.trace_status !== 'complete') reasons.push('incomplete_trace');
    if (r.safety?.decision !== 'pass') reasons.push('safety_not_passed');
    if (r.quality?.status !== 'verified' || !unit(r.quality.Q)) reasons.push('quality_unverified');
    if (r.task_validation?.passed !== true || !r.task_validation.evidence_hash) reasons.push('task_not_verified');
    if (r.data_reviewed !== true) reasons.push('data_review_required');
    return { trace_id: r.trace_id, index, reasons, selected: false };
  });
  decisions.filter(d => !d.reasons.length).sort((a, b) => records[b.index].quality.Q - records[a.index].quality.Q || a.index - b.index).forEach((d, i) => {
    d.selected = i < k;
    if (!d.selected) d.reasons.push('outside_selection_budget');
  });
  return { selected: decisions.filter(d => d.selected).map(d => records[d.index]), decisions };
}
