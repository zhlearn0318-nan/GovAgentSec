import { createHash } from 'node:crypto';

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value ?? null);
}
export const digest = value => createHash('sha256').update(canonical(value), 'utf8').digest('hex');
const secretKey = /password|passwd|secret|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|credential/i;
export function redact(value, key = '') {
  if (secretKey.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(v => redact(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  if (typeof value !== 'string') return value ?? null;
  return value.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED]')
    .replace(/\b(?:Bearer|Basic)\s+\S+/gi, '[REDACTED]')
    .replace(/\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/((?:password|passwd|token|secret|cookie|api[_-]?key|authorization)\s*[=:]\s*)[^\s,;"'}]+/gi, '$1[REDACTED]')
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, '[ID_REDACTED]');
}
// A summary describes the shape, never takes a substring of untrusted content.
export function contentEvidence(value, mode = 'hash') {
  if (value === undefined || value === null) return { available: false };
  const clean = redact(value), result = { available: true, sha256: digest(clean), bytes: Buffer.byteLength(canonical(clean)) };
  if (mode === 'summary') result.summary = { type: Array.isArray(clean) ? 'array' : typeof clean, items: Array.isArray(clean) ? clean.length : null };
  return result;
}
export const RULE_VERSION = 'paper-four-rules+openclaw-v1';
const rules = {
  financial_write: /\b(send_money|create_transaction|schedule_transaction|update_scheduled_transaction)\b/i,
  outbound_write: /\b(send_email|forward_email|post_message|send_direct_message|upload_file)\b/i,
  destructive_write: /\b(delete_file|delete_email|delete_event|remove_user|cancel_reservation|rm\s+-rf|rmtree)\b/i,
  credential_or_bypass: /admin_token|bypass.{0,30}verif|skip.{0,30}verif/i,
  openclaw_bypass: /ignore (?:all )?(?:previous|prior|safety) instructions|disable.{0,20}(?:guard|approval)|忽略.{0,10}(?:安全|指令)|绕过.{0,10}(?:审批|防护)/i,
};
// Apply while data is in memory. Only rule IDs survive, never matched text.
export function ruleHits(value) {
  const text = canonical(value);
  return Object.entries(rules).filter(([, regex]) => regex.test(text)).map(([id]) => id);
}
