#!/usr/bin/env node
// Read-only host inspection and optional historical trace verification. No network or model calls.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { TraceStore } from '../modules/govagentsec-trace/store.mjs';
import { traceGraph, nodePresentation } from '../modules/govagentsec-trace/view-model.mjs';

const [output = `local-validation/u19-per-call-token/${new Date().toISOString().replace(/[:.]/g, '-')}`, input, traceId] = process.argv.slice(2);
const out = path.resolve(output);
mkdirSync(out, { recursive: true });
const report = { status: 'FAIL', strategy: 'P0+P1-ui-only', host_version: null,
  ended_type_has_usage: null, public_ended_dispatch_has_usage: null,
  real_per_call_usage_observed: null, real_trace: null, source_evidence: [] };
try {
  assert.equal(Boolean(input), Boolean(traceId), 'Supply both EVIDENCE_DIR and TRACE_ID, or neither');
  const host = path.join(process.env.APPDATA, 'npm/node_modules/openclaw');
  report.host_version = JSON.parse(readFileSync(path.join(host, 'package.json'), 'utf8')).version;
  assert.equal(report.host_version, '2026.7.1-2', 'Pinned host version required');
  const dist = path.join(host, 'dist'), names = readdirSync(dist);
  const typeName = names.find(n => /^hook-types-.*\.d\.ts$/.test(n));
  const diagnosticName = names.find(n => /^attempt\.model-diagnostic-events-.*\.js$/.test(n));
  assert.ok(typeName && diagnosticName, 'Required host source evidence missing');
  const readEvidence = relative => {
    const bytes = readFileSync(path.join(host, relative));
    report.source_evidence.push({ path: path.join(host, relative), sha256: createHash('sha256').update(bytes).digest('hex') });
    return bytes.toString('utf8');
  };
  const types = readEvidence('dist/' + typeName);
  const diagnostic = readEvidence('dist/' + diagnosticName);
  const hooks = readEvidence('docs/plugins/hooks.md');
  const ended = types.match(/type PluginHookModelCallEndedEvent = [\s\S]*?\n};/)?.[0];
  const base = types.match(/type PluginHookModelCallBaseEvent = [\s\S]*?\n};/)?.[0];
  assert.ok(ended && base, 'Model event types not found');
  report.ended_type_has_usage = /\b(?:usage|tokens)\??\s*:/.test(ended + base);
  const completed = diagnostic.match(/function emitModelCallCompleted\([\s\S]*?\n}/)?.[0];
  assert.ok(completed?.includes('...modelCallUsageField(state)'), 'Internal diagnostic usage source missing');
  const dispatch = completed.match(/dispatchModelCallEndedHook\(eventBase, \{([\s\S]*?)\}\);/)?.[1];
  assert.ok(dispatch, 'Public ended dispatch not found');
  report.public_ended_dispatch_has_usage = /usage|tokens/i.test(dispatch);
  assert.equal(report.ended_type_has_usage, false);
  assert.equal(report.public_ended_dispatch_has_usage, false);
  assert.match(hooks, /model_call_ended/);
  report.internal_diagnostic_has_usage = true;
  report.ended_type_excerpt = ended;
  report.public_dispatch_excerpt = dispatch.trim();
  if (input) {
    const root = path.resolve(input), dir = existsSync(path.join(root, 'traces')) ? path.join(root, 'traces') : root;
    const trace = new TraceStore(dir).read(traceId);
    assert.equal(trace.integrity.valid, true, 'Historical trace hash chain invalid');
    assert.equal(trace.summary.source, 'openclaw', 'Real evidence must not be synthetic');
    const graph = traceGraph(trace), models = graph.nodes.filter(n => n.event_type.startsWith('model.'));
    assert.ok(models.some(n => n.event_type === 'model.ended'), 'No model.ended evidence');
    assert.ok(models.some(n => n.event_type === 'model.output'), 'No aggregate output evidence');
    report.real_per_call_usage_observed = models.some(n => n.event_type === 'model.ended' && n.payload.usage != null);
    report.real_trace = { source: trace.summary.source, trace_id: traceId, integrity: trace.integrity.valid,
      node_count: graph.nodes.length, edge_count: graph.edges.length, aggregate: trace.summary.metrics,
      model_labels: models.map(n => ({ event_type: n.event_type, event_id: n.event_id, ...nodePresentation(n) })) };
    assert.ok(report.real_trace.model_labels.every(n => n.tokens.includes('token ')));
  }
  report.status = 'CONDITIONAL_PASS';
  report.reason = 'Public fixed-version hook lacks per-call usage; actual optional fields are supported, missing values are explicit.';
} catch (error) { report.error = error.message; process.exitCode = 1; }
writeFileSync(path.join(out, 'hook-limitation.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(path.join(out, 'design-ref.md'), '# U19 design\n\n[Design](../../../docs/TRACE_HOOK_VERIFICATION.md)\n\nRepository path: docs/TRACE_HOOK_VERIFICATION.md\n');
console.log(JSON.stringify({ status: report.status, real_per_call_usage_observed: report.real_per_call_usage_observed, output: out, error: report.error }));
