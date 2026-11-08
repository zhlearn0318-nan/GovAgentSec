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
  const reasons = {
    openclaw_model_call_ended_no_usage: '宿主钩子未暴露',
    model_call_not_finished: '调用开始时无用量',
    invalid_usage: '用量字段无效',
    usage_wrapper_unassociated: '包装层未关联调用',
    usage_wrapper_unavailable: '包装层采集不可用',
    usage_wrapper_ambiguous: '多次请求关联有歧义',
    usage_wrapper_upstream_no_usage: '上游未提供用量',
    usage_wrapper_invalid_usage: '上游用量无效',
    usage_wrapper_conflicting_usage: '上游用量冲突',
    usage_wrapper_parse_error: '用量解析失败',
    usage_wrapper_incomplete_stream: '响应流不完整',
    usage_wrapper_capture_limit: '超出采集大小上限',
    usage_wrapper_timeout: '上游响应超时',
    usage_wrapper_upstream_error: '上游请求失败',
    usage_wrapper_client_aborted: '调用已取消',
  };
  const reason = payload.token_missing_reason ?? (payload.usage != null ? 'invalid_usage'
    : eventType === 'model.started' ? 'model_call_not_finished'
    : eventType === 'model.ended' ? 'openclaw_model_call_ended_no_usage' : null);
  return `${aggregate ? '运行汇总 ' : ''}token 未提供（${reasons[reason] ?? '未记录用量'}）`;
}
