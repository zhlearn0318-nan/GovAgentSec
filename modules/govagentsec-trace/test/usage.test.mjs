import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeUsage, perCallUsage, tokenPresentation } from '../usage.mjs';
import { registerTrace, OBSERVERS } from '../register.mjs';
import { TraceStore } from '../store.mjs';
import { createFixtures } from '../fixtures.mjs';
import { traceGraph, nodePresentation } from '../view-model.mjs';

test('usage preserves real zero and partial counters, rejects invalid values and drops unknown keys', () => {
  assert.deepEqual(normalizeUsage({ input: 0, output: 8, total: 8, cacheRead: 0, cacheWrite: 2, secret: 'never persist' }),
    { input: 0, output: 8, total: 8, cacheRead: 0, cacheWrite: 2 });
  for (const value of [null, undefined, 20, '20', [], {}, { input: '2' }, { input: -1 },
    { output: NaN }, { total: Infinity }, { input: .5 }, { input: Number.MAX_SAFE_INTEGER + 1 }]) assert.equal(normalizeUsage(value), null);
  assert.deepEqual(normalizeUsage({ input: 7, output: '8' }), { input: 7 });
  assert.deepEqual(perCallUsage({ tokens: { input: 1, output: 2 } }).usage, { input: 1, output: 2 });
  assert.deepEqual(perCallUsage({ usage: { input: 3 }, tokens: { input: 9, output: 9 } }).usage, { input: 3 });
  assert.equal(perCallUsage({ tokens: 100 }).token_missing_reason, 'invalid_usage');
  assert.equal(perCallUsage({}).token_missing_reason, 'openclaw_model_call_ended_no_usage');
});

test('legacy, partial and aggregate presentations never infer individual counts', () => {
  assert.equal(tokenPresentation('model.ended', { usage: { input: 0, output: 0 } }), 'token 0/0（单次调用）');
  assert.equal(tokenPresentation('model.ended', { usage: { input: 7 } }), 'token 7/缺失（单次调用）');
  assert.equal(tokenPresentation('model.ended', { tokens: null }), '');
  assert.equal(tokenPresentation('model.started', {}), '');
  assert.equal(tokenPresentation('model.ended', { usage: { output: -3 } }), '');
  assert.equal(tokenPresentation('model.output', { usage: { input: 10, output: 4 } }), '运行汇总 token 10/4');
  assert.equal(tokenPresentation('model.output', {}), '');
  assert.equal(tokenPresentation('model.ended', { token_missing_reason: 'usage_wrapper_unavailable' }), '');
  assert.match(tokenPresentation('model.ended', { token_scope: 'last_call_of_turn', usage: { output: 5 } }), /本轮最后调用/);
  assert.equal(tokenPresentation('tool.ended', { usage: { input: 1 } }), '');
});

test('real registration projects optional usage through append-only JSONL and serves shared UI dependency', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'u19-hooks-'));
  t.after(() => { rmSync(root, { recursive: true, force: true }); globalThis[OBSERVERS]?.delete('govagentsec-trace'); });
  const hooks = new Map(), routes = [];
  const store = registerTrace({ pluginConfig: { dataDir: root }, config: {}, logger: { warn() {} },
    on: (name, fn) => hooks.set(name, fn), registerGatewayMethod() {}, registerHttpRoute: route => routes.push(route) });
  const ctx = { runId: 'synthetic-u19-hooks', sessionKey: 'synthetic' };
  // No real host/model executes here. Explicitly label the test provenance.
  store.append({ trace_id: ctx.runId, event_type: 'run.started', payload: { source: 'synthetic-fixture' } });
  await hooks.get('model_call_started')({ callId: 'a', model: 'synthetic' }, ctx);
  assert.equal(await hooks.get('model_call_ended')({ callId: 'a', usage: { input: 12, output: 8, apiKey: 'not-stored' } }, ctx), undefined);
  await hooks.get('model_call_ended')({ callId: 'b', tokens: { input: 0, output: 2 } }, ctx);
  await hooks.get('model_call_ended')({ callId: 'c' }, ctx);
  await hooks.get('llm_output')({ usage: { input: 12, output: 10 }, assistantTexts: [] }, ctx);
  const trace = store.read(ctx.runId), ended = trace.events.filter(e => e.event_type === 'model.ended');
  assert.equal(trace.integrity.valid, true);
  assert.deepEqual(ended[0].payload.usage, { input: 12, output: 8 });
  assert.equal(ended[0].payload.token_scope, 'per_call');
  assert.equal('tokens' in ended[0].payload, false);
  assert.deepEqual(ended[1].payload.usage, { input: 0, output: 2 });
  assert.equal(ended[2].payload.usage, null);
  assert.equal(ended[2].payload.token_scope, 'unavailable');
  assert.equal(trace.events.at(-1).payload.token_scope, 'run_aggregate');
  assert.equal(trace.summary.metrics.output_tokens, 10, 'per-call counters must not be double counted');
  const route = routes.find(r => r.path.endsWith('/usage.mjs'));
  assert.equal(route.auth, 'plugin');
  let body;
  await route.handler({ method: 'GET' }, { writeHead(code) { assert.equal(code, 200); }, end(value) { body = value; } });
  assert.match(String(body), /export function tokenPresentation/);
});

test('synthetic fixture graph has per-call and historical missing nodes while run totals stay unchanged', t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'u19-fixtures-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = new TraceStore(root); createFixtures(store);
  const trace = store.read('fixture-word-1');
  assert.equal(trace.summary.source, 'synthetic-fixture');
  const labels = traceGraph(trace).nodes.map(nodePresentation).map(n => n.tokens);
  assert.ok(labels.includes('token 120/20（单次调用）'));
  assert.ok(labels.includes(''));
  assert.ok(labels.every(label => !label.includes('token 未提供')));
  assert.ok(labels.includes('运行汇总 token 300/80'));
  assert.equal(trace.summary.metrics.input_tokens, 300);
  assert.equal(trace.summary.metrics.output_tokens, 80);
});
