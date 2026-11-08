import { readFileSync } from 'node:fs';
import { correlationKey } from '../govagentsec-usage-wrapper/protocol.mjs';
import { normalizeUsage } from './usage.mjs';

export function wrapperCallKey(config, event, context) {
  return config?.enabled === true && config.providers?.includes(event.provider) ? correlationKey(context.trace) : null;
}

export async function appendWrapperUsage(store, ended, context, config) {
  if (!store || !ended || config?.enabled !== true || !config.providers?.includes(ended.payload.provider)) return;
  if (store.read(ended.trace_id).events.some(e => e.event_type === 'model.usage' && e.parent_event_id === ended.event_id)) return;
  const key = correlationKey(context.trace);
  let usage = null, reason = 'usage_wrapper_unassociated';
  if (key) {
    try {
      const endpoint = new URL(config.endpoint);
      if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password
        || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw Error('LOCAL_ENDPOINT_REQUIRED');
      const credential = readFileSync(config.credentialFile, 'utf8').trim();
      if (!/^[a-f0-9]{64}$/.test(credential)) throw Error('INVALID_CREDENTIAL');
      reason = 'usage_wrapper_unavailable';
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(new URL('/usage/' + key, endpoint), {
          headers: { 'x-gov-usage-key': credential }, redirect: 'error', signal: AbortSignal.timeout(700) });
        if (response.status === 202) { await new Promise(resolve => setTimeout(resolve, 40)); continue; }
        if (!response.ok) break;
        const row = await response.json();
        if (row.key !== key) { reason = 'usage_wrapper_unassociated'; break; }
        usage = normalizeUsage(row.usage);
        reason = usage ? null : /^usage_wrapper_[a-z_]+$/.test(row.token_missing_reason ?? '') ? row.token_missing_reason : 'usage_wrapper_upstream_no_usage';
        break;
      }
    } catch { reason = 'usage_wrapper_unavailable'; }
  }
  // No await between duplicate check and append. This process owns the existing ledger.
  if (store.read(ended.trace_id).events.some(e => e.event_type === 'model.usage' && e.parent_event_id === ended.event_id)) return;
  store.append({ trace_id: ended.trace_id, event_type: 'model.usage', model_call_id: ended.model_call_id,
    parent_event_id: ended.event_id, session_key: ended.session_key, session_id: ended.session_id,
    payload: { source: 'loopback-http-wrapper', usage_correlation_key: key, usage,
      token_scope: usage ? 'per_call' : 'unavailable', token_missing_reason: reason } });
}
