import { existsSync } from 'node:fs';
import { TraceStore } from './store.mjs';

// Compatibility projection for existing chat/workbench readers. Never writes
// a second copy of trace content or claims the old hash format for new events.
export class LegacyReader {
  constructor(legacy, root) { this.legacy = legacy; this.current = new TraceStore(root); }
  read(id) {
    if (!existsSync(this.current.file(id))) return this.legacy.read(id);
    const trace = this.current.read(id), s = trace.summary;
    return { ...trace, summary: { ...s, run_id: s.trace_id, started_at: s.timestamp,
      issues: s.missing_fields, task_family: s.task_key, task_passed: null,
      model_count: trace.events.filter(e => e.event_type === 'model.started').length, tool_count: s.metrics.steps },
      events: trace.events.map(e => ({ ...e, run_id: e.trace_id, observed_at: e.timestamp,
        capture_status: trace.integrity.valid ? 'complete' : 'partial', hash_format: 'govagentsec-trace-v1' })) };
  }
  list() { return [...this.legacy.list(), ...this.current.list().map(s => this.read(s.trace_id).summary)].sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? '')); }
}
