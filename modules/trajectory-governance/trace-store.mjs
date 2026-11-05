import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');

// Heuristic redaction is not proof of anonymity. Automatic learning additionally
// requires an operator-controlled data review, recorded in the selection input.
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, /password|secret|authorization|api[_-]?key|access[_-]?token|cookie/i.test(key) ? '[REDACTED]' : redact(item)]));
  if (typeof value !== 'string') return value;
  return value.replace(/\bBearer\s+[\w.\-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, '[REDACTED]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b1[3-9]\d{9}\b/g, '[PHONE]');
}

export function verifyEvents(events, manifest) {
  let previous = '0'.repeat(64);
  const ids = new Set();
  for (const [i, event] of events.entries()) {
    const { hash, ...body } = event;
    if (body.sequence !== i + 1 || body.previous_hash !== previous || digest(body) !== hash || ids.has(body.event_id)) return false;
    if (body.trace_id !== events[0].trace_id || body.run_id !== events[0].run_id) return false;
    previous = hash;
    ids.add(body.event_id);
  }
  return Boolean(events.length && (!manifest || (manifest.event_count === events.length && manifest.tail_hash === previous && manifest.trace_id === events[0].trace_id)));
}

export function summarize(events, manifest) {
  const issues = [];
  if (!verifyEvents(events, manifest)) return { trace_status: 'invalid', issues: ['hash_chain_or_manifest_mismatch'] };
  const starts = events.filter(e => e.event_type === 'run.started');
  const ends = events.filter(e => e.event_type === 'run.ended');
  if (starts.length !== 1 || ends.length !== 1 || events[0].event_type !== 'run.started') issues.push('run_boundary_missing_or_duplicate');
  const endIndex = events.findIndex(e => e.event_type === 'run.ended');
  // OpenClaw emits the final llm_output after agent_end on the embedded path.
  if (endIndex >= 0 && events.slice(endIndex + 1).some(e => e.event_type !== 'model.output')) issues.push('unexpected_event_after_run_end');
  const pending = new Set(), finished = new Set();
  for (const e of events) {
    if (e.capture_status !== 'complete') issues.push('capture_incomplete');
    if (!e.run_id) issues.push('missing_run_id');
    const type = e.event_type;
    const kind = type.startsWith('tool.') ? 'tool' : type.startsWith('model.') ? 'model' : null;
    if (!kind || !/\.(started|ended)$/.test(type)) continue;
    const id = kind === 'tool' ? e.tool_call_id : e.model_call_id;
    if (!id) { issues.push('missing_call_id'); continue; }
    const key = `${kind}:${id}`;
    if (type.endsWith('.started')) {
      if (pending.has(key) || finished.has(key)) issues.push('duplicate_call');
      pending.add(key);
    } else {
      if (!pending.delete(key)) issues.push('orphan_result');
      finished.add(key);
    }
  }
  if (pending.size) issues.push('missing_call_result');
  if (!manifest) issues.push('unsealed');
  const ended = ends.at(-1);
  const lastModel = events.filter(e => e.event_type === 'model.ended').at(-1);
  const blockedInput=events.some(e=>e.event_type==='protection.input'&&e.payload?.enforced===true&&e.payload?.decision!=='ALLOW');
  const interrupted = !ended || ended.payload?.success === false || lastModel?.payload?.outcome === 'error';
  return {
    trace_id: events[0].trace_id, run_id: events[0].run_id,
    session_key: events[0].session_key ?? null, session_id: events[0].session_id ?? null,
    source: events[0].source, task_passed: ended?.payload?.task_passed ?? null,
    trace_status: blockedInput && ended && manifest ? 'blocked' : interrupted ? 'interrupted' : issues.length ? 'partial' : 'complete',
    issues: [...new Set(issues)], event_count: events.length,
    task_id: events[0].task_id ?? null, task_family: events[0].task_family ?? null,
    skill_usage: 'unknown',
    started_at: events[0].observed_at,
    title: String(events[0].payload?.prompt ?? events[0].task_id ?? '未命名任务').slice(0, 120),
    tool_count: events.filter(e => e.event_type === 'tool.started').length,
    model_count: events.filter(e => e.event_type === 'model.started').length,
  };
}

export class TraceStore {
  constructor(root) { this.root = path.resolve(root); mkdirSync(this.root, { recursive: true }); }
  traceId(runId) { return digest(`openclaw:${runId}`).slice(0, 32); }
  file(traceId, suffix = 'jsonl') {
    if (!/^[a-f0-9]{32}$/.test(traceId)) throw new Error('invalid trace id');
    return path.join(this.root, `${traceId}.${suffix}`);
  }
  read(traceId) {
    const file = this.file(traceId);
    const events = existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
    const seal = this.file(traceId, 'manifest.json');
    const manifest = existsSync(seal) ? JSON.parse(readFileSync(seal, 'utf8')) : null;
    return { events, manifest, summary: { ...summarize(events, manifest), trace_id: traceId } };
  }
  append(input) {
    const runId = typeof input.run_id === 'string' && input.run_id ? input.run_id : null;
    const traceId = runId ? this.traceId(runId) : randomUUID().replaceAll('-', '');
    const { events, manifest } = this.read(traceId);
    if (events.length && !verifyEvents(events, manifest)) throw new Error('existing trace is invalid');
    // Late events remain visible but invalidate the sealed completeness claim.
    const encoded = JSON.stringify(redact(input.payload ?? {}));
    const oversized = Buffer.byteLength(encoded) > 128 * 1024;
    const body = {
      schema_version: 1, event_id: randomUUID(), trace_id: traceId, run_id: runId,
      session_key: input.session_key ?? null, session_id: input.session_id ?? null,
      event_type: input.event_type, source: input.source ?? 'openclaw',
      sequence: events.length + 1, observed_at: new Date().toISOString(),
      occurred_at: input.occurred_at ?? null, task_id: input.task_id ?? null,
      task_family: input.task_family ?? null, tool_call_id: input.tool_call_id ?? null,
      model_call_id: input.model_call_id ?? null, request_id: input.request_id ?? null,
      span_id: input.span_id ?? null, parent_span_id: input.parent_span_id ?? null,
      capture_status: !runId || oversized ? 'partial' : input.capture_status ?? 'complete',
      payload: oversized ? { omitted: true, reason: 'payload_limit', digest: digest(encoded) } : JSON.parse(encoded),
      previous_hash: events.at(-1)?.hash ?? '0'.repeat(64),
    };
    const event = { ...body, hash: digest(body) };
    appendFileSync(this.file(traceId), JSON.stringify(event) + '\n', { mode: 0o600 });
    if (input.event_type === 'run.ended' && !manifest && input.seal !== false) this.seal(traceId);
    return event;
  }
  seal(traceId) {
    const { events, manifest } = this.read(traceId);
    if (manifest || !verifyEvents(events) || !events.some(e => e.event_type === 'run.ended')) throw new Error('trace is already sealed or not ready');
    writeFileSync(this.file(traceId, 'manifest.json'), JSON.stringify({ schema_version: 1, trace_id: traceId, event_count: events.length, tail_hash: events.at(-1).hash }), { flag: 'wx', mode: 0o600 });
  }
  list() {
    return readdirSync(this.root).filter(f => /^[a-f0-9]{32}\.jsonl$/.test(f)).map(f => {
      const id = f.slice(0, 32);
      try { return this.read(id).summary; } catch { return { trace_id: id, trace_status: 'invalid', issues: ['unreadable_trace'] }; }
    }).sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));
  }
}
