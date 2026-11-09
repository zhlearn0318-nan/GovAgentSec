// Shared by capture and presentation; never coerce missing/invalid counters to zero.
export function normalizeUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const usage = {};
  for (const key of ['input', 'output', 'total', 'cacheRead', 'cacheWrite']) {
    if (Number.isSafeInteger(value[key]) && value[key] >= 0) usage[key] = value[key];
  }
  return Object.keys(usage).length ? usage : null;
}

export function perCallUsage(event) {
  const usage = normalizeUsage(event.usage) ?? normalizeUsage(event.tokens);
  return { usage, token_scope: usage ? 'per_call' : 'unavailable',
    ...(!usage ? { token_missing_reason: event.usage != null || event.tokens != null
      ? 'invalid_usage' : 'openclaw_model_call_ended_no_usage' } : {}) };
}

export function tokenPresentation(eventType, payload) {
  if (!eventType.startsWith('model.')) return '';
  const aggregate = eventType === 'model.output' || payload.token_scope === 'run_aggregate';
  const usage = normalizeUsage(payload.usage);
  if (usage) {
    const counts = `token ${usage.input ?? '缺失'}/${usage.output ?? '缺失'}`;
    return aggregate ? `运行汇总 ${counts}` : `${counts}（${payload.token_scope === 'last_call_of_turn' ? '本轮最后调用' : '单次调用'}）`;
  }
  // Omit absent usage from graph/timeline labels; collection reasons remain in JSONL.
  return '';
}
