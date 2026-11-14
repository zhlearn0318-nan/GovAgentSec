import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonical, digest, redact, contentEvidence } from './privacy.mjs';

export const ZERO_HASH = '0'.repeat(64);
const contentKeys = new Set(['prompt', 'params', 'result', 'output', 'texts', 'messages', 'error', 'command', 'content']);
function protect(value, mode) {
  if (Array.isArray(value)) return value.map(v => protect(v, mode));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, contentKeys.has(k) && (typeof v === 'string' || v && typeof v === 'object') ? contentEvidence(v, mode) : protect(v, mode)]));
  return redact(value);
}
export function parseJSONL(text) {
  const events = [], errors = [];
  for (const [i, line] of text.replace(/^\uFEFF/, '').split('\n').entries()) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { errors.push({ code: 'invalid_json', line: i + 1 }); }
  }
  return { events, errors };
}
export function verifyChain(events, anchor) {
  const errors = [];
  let prev = ZERO_HASH;
  const seen = new Set(), traceId = events[0]?.trace_id;
  for (const [i, e] of events.entries()) {
    const { event_hash, ...body } = e;
    if (e.sequence !== i + 1) errors.push({ code: 'sequence_gap', sequence: i + 1 });
    if (e.prev_hash !== prev || event_hash !== digest(body)) errors.push({ code: 'hash_break', sequence: i + 1 });
    if (e.trace_id !== traceId || !e.event_id || seen.has(e.event_id)) errors.push({ code: 'identity_mismatch', sequence: i + 1 });
    if (e.parent_event_id && !seen.has(e.parent_event_id)) errors.push({ code: 'parent_missing', sequence: i + 1 });
    if (!Number.isFinite(Date.parse(e.timestamp)) || typeof e.event_type !== 'string') errors.push({ code: 'event_fields_missing', sequence: i + 1 });
    seen.add(e.event_id); prev = event_hash;
  }
  if (anchor && (anchor.count !== events.length || anchor.event_hash !== prev || anchor.trace_id !== traceId)) errors.push({ code: 'anchor_mismatch' });
  return { valid: events.length > 0 && errors.length === 0, errors, count: events.length, tail_hash: prev };
}
export function summarize(events, integrity, captureFailures = []) {
  const first = events.find(e => e.event_type === 'run.started'), end = events.findLast(e => e.event_type === 'run.ended');
  const outputs = events.filter(e => e.event_type === 'model.output');
  const contentOutputs = outputs.filter(e=>e.payload.has_content!==false);
  const associations = events.filter(e => e.event_type === 'task.assigned');
  const assignment = associations.at(-1)?.payload;
  const calls = events.filter(e => e.event_type === 'tool.started');
  const ends = events.filter(e => e.event_type === 'tool.ended');
  const denied = events.some(e => e.event_type.startsWith('protection.') && e.payload.enforced && e.payload.decision === 'BLOCK');
  const missing = [];
  if (!first) missing.push('run_start');
  if (!end) missing.push('run_end');
  if (!contentOutputs.length && !denied) missing.push('llm_output');
  if (!events.some(e => e.event_type === 'model.started') && !denied) missing.push('model_call_events');
  if (!events.some(e => e.event_type === 'skill.observed')) missing.push('skill_usage_unobserved');
  if (calls.some(e => !ends.some(x => x.tool_call_id && x.tool_call_id === e.tool_call_id) && !events.some(x => x.tool_call_id === e.tool_call_id && x.payload.enforced && x.payload.decision === 'BLOCK'))) missing.push('tool_result');
  if (captureFailures.length) missing.push('capture_failed');
  for (const kind of ['tool', 'model']) {
    const key = kind === 'tool' ? 'tool_call_id' : 'model_call_id';
    const started = events.filter(e => e.event_type === kind + '.started');
    const ended = events.filter(e => e.event_type === kind + '.ended');
    if (started.some(e => !e[key]) || ended.some(e => !e[key])) missing.push('call_id_missing');
    if (new Set(started.map(e => e[key])).size !== started.length || new Set(ended.map(e => e[key])).size !== ended.length) missing.push('duplicate_call_id');
    if (ended.some(e => !started.some(s => s[key] === e[key] && s.sequence < e.sequence))) missing.push('orphan_result');
    if (kind === 'model' && started.some(e => !ended.some(x => x[key] === e[key]))) missing.push('model_result_missing');
  }
  const usage = outputs.length && outputs.every(e => e.payload.usage) ? Object.fromEntries(['input', 'output', 'total', 'cacheRead', 'cacheWrite'].map(key =>
    [key, outputs.every(e => Number.isFinite(e.payload.usage[key])) ? outputs.reduce((sum, e) => sum + e.payload.usage[key], 0) : null])) : null;
  const metrics = { input_tokens: usage?.input ?? null, output_tokens: usage?.output ?? null, total_tokens: usage?.total ?? null,
    token_scope: 'sum_of_llm_output_attempt_aggregates', duration_ms: end?.payload.duration_ms ?? null, steps: calls.length,
    tool_sequence: calls.map(e => e.payload.tool), success: end?.payload.success ?? null,
    risks: events.filter(e => e.payload.decision === 'BLOCK' || e.payload.decision === 'REVIEW').length };
  if (!usage && !denied) missing.push('token_usage');
  const fatalMissing = missing.some(x => ['run_start', 'run_end', 'llm_output', 'model_call_events', 'tool_result', 'capture_failed', 'call_id_missing', 'duplicate_call_id', 'orphan_result', 'model_result_missing'].includes(x));
  const failed=end?.payload.success===false;
  const preflightFailed=failed&&!events.some(e=>e.event_type==='model.started');
  return { trace_id: events[0]?.trace_id, session_key: first?.session_key ?? events[0]?.session_key,
    task_key: assignment?.task_key ?? first?.payload.task_key ?? null, task_confirmed: Boolean(assignment?.confirmed || first?.payload.task_confirmed),
    source: first?.payload.source ?? 'openclaw', title: assignment?.title ?? 'Agent 运行', timestamp: first?.timestamp ?? events[0]?.timestamp,
    trace_status: !integrity.valid ? 'invalid' : denied && first && end && !captureFailures.length ? 'blocked' : preflightFailed ? 'failed' : fatalMissing ? (end ? 'partial' : 'interrupted') : 'complete',
    execution_status: denied?'blocked':failed?'failed':end?.payload.success===true?'succeeded':end?'unknown':'running',
    failure_code: failed&&!denied ? end.payload.error_code??'AGENT_RUN_FAILED' : null,
    missing_fields: missing, metrics, event_count: events.length, evidence_hash: events.findLast(e => e.event_type !== 'assessment.completed')?.event_hash ?? integrity.tail_hash,
    assessment: events.findLast(e => e.event_type === 'assessment.completed')?.payload ?? null };
}
export class TraceStore {
  constructor(root, { contentMode = 'hash' } = {}) {
    if (!['hash', 'summary'].includes(contentMode)) throw new Error('raw content storage is prohibited');
    this.root = path.resolve(root); this.contentMode = contentMode; this.failures = [];
    mkdirSync(this.root, { recursive: true });
    const health = path.join(this.root, 'capture-health.jsonl');
    if (existsSync(health)) this.failures = parseJSONL(readFileSync(health, 'utf8')).events;
  }
  file(id) {
    if (typeof id !== 'string' || !id.length || id.length > 200) throw new Error('runId required');
    return path.join(this.root, digest(id) + '.jsonl');
  }
  failure(traceId, hook, code = 'capture_failed') {
    const entry = { trace_id: traceId ?? null, hook, code, timestamp: new Date().toISOString() };
    this.failures.push(entry);
    try { appendFileSync(path.join(this.root, 'capture-health.jsonl'), JSON.stringify(entry) + '\n', { mode: 0o600 }); } catch { /* RPC still exposes in-memory failure. */ }
  }
  append(input) {
    const id = input.trace_id, file = this.file(id);
    const previous = existsSync(file) ? this.read(id) : { events: [], integrity: { valid: true } };
    if (!previous.integrity.valid) throw new Error('cannot append to broken chain');
    const body = { schema_version: 1, event_id: randomUUID(), sequence: previous.events.length + 1,
      timestamp: input.timestamp ?? new Date().toISOString(), event_type: input.event_type, trace_id: id,
      parent_event_id: input.parent_event_id ?? null, prev_hash: previous.events.at(-1)?.event_hash ?? ZERO_HASH,
      session_key: input.session_key ?? null, session_id: input.session_id ?? null,
      request_id: input.request_id ?? null, task_id: input.task_id ?? null,
      tool_call_id: input.tool_call_id ?? null, model_call_id: input.model_call_id ?? null,
      payload: protect(redact(input.payload ?? {}), this.contentMode) };
    if (body.parent_event_id && !previous.events.some(e => e.event_id === body.parent_event_id)) throw new Error('unknown parent');
    const event = { ...body, event_hash: digest(body) };
    appendFileSync(file, canonical(event) + '\n', { mode: 0o600 });
    const temp = file + '.head.tmp';
    writeFileSync(temp, JSON.stringify({ trace_id: id, count: event.sequence, event_hash: event.event_hash }), { mode: 0o600 });
    renameSync(temp, file + '.head.json');
    return event;
  }
  read(id) {
    const file = this.file(id), parsed = parseJSONL(readFileSync(file, 'utf8'));
    let anchor;
    try { anchor = JSON.parse(readFileSync(file + '.head.json', 'utf8')); } catch { parsed.errors.push({ code: 'anchor_missing' }); }
    const integrity = verifyChain(parsed.events, anchor);
    integrity.errors.push(...parsed.errors); integrity.valid &&= parsed.errors.length === 0;
    if (parsed.events.some(e => e.trace_id !== id)) { integrity.valid = false; integrity.errors.push({ code: 'trace_id_mismatch' }); }
    const failures = this.failures.filter(e => !e.trace_id || e.trace_id === id);
    return { events: parsed.events, integrity, capture_failures: failures, summary: summarize(parsed.events, integrity, failures) };
  }
  list() {
    return readdirSync(this.root).filter(f => /^[a-f0-9]{64}\.jsonl$/.test(f)).map(file => {
      try { const first = parseJSONL(readFileSync(path.join(this.root, file), 'utf8')).events[0]; return this.read(first.trace_id).summary; }
      catch { return { trace_id: null, trace_status: 'invalid', title: file, missing_fields: ['unreadable_file'] }; }
    }).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  }
  assign(id, { task_key, title = task_key, confirmed }) {
    if (confirmed !== true || typeof task_key !== 'string' || !/^[\p{L}\p{N}_.:-]{1,100}$/u.test(task_key)) throw new Error('explicit task_key and confirmation required');
    this.read(id);
    return this.append({ trace_id: id, event_type: 'task.assigned', payload: { task_key, title: String(title).slice(0, 100), confirmed: true } });
  }
}
