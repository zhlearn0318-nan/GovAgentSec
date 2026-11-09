import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createUsageWrapper } from '../../govagentsec-usage-wrapper/server.mjs';
import { fixtureUpstream } from '../../govagentsec-usage-wrapper/test/fixtures/upstream.mjs';
import { registerTrace, OBSERVERS } from '../register.mjs';
import { traceGraph, nodePresentation } from '../view-model.mjs';
import { appendWrapperUsage } from '../wrapper-usage.mjs';

test('HTTP usage joins exact concurrent hooks append-only; offline/UI agree, wrong parent and duplicate do not join', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'u20-trace-')), credential = randomBytes(32).toString('hex'), credentialFile = path.join(root, 'control.key');
  writeFileSync(credentialFile, credential);
  const upstream = await fixtureUpstream(), wrapper = createUsageWrapper({ upstreams: { deepseek: upstream.url }, controlKey: credential });
  const port = await wrapper.listen(0), endpoint = 'http://127.0.0.1:' + port, hooks = new Map();
  t.after(async () => { await wrapper.close(); await upstream.close(); rmSync(root, { recursive: true, force: true }); globalThis[OBSERVERS]?.delete('govagentsec-trace'); });
  const config = { enabled: true, endpoint, credentialFile, providers: ['deepseek'] };
  const store = registerTrace({ pluginConfig: { dataDir: root, usageWrapper: config }, config: {}, logger: { warn() {} }, registerHttpRoute() {}, on: (name, fn) => hooks.set(name, fn) });
  const run = async (id, model) => {
    const trace = { traceId: randomBytes(16).toString('hex'), spanId: randomBytes(8).toString('hex') }, ctx = { runId: id, trace };
    store.append({ trace_id: id, event_type: 'run.started', payload: { source: 'synthetic-fixture' } });
    await hooks.get('model_call_started')({ callId: 'call', provider: 'deepseek', model }, ctx);
    const response = await fetch(endpoint + '/deepseek/chat/completions', { method: 'POST', headers: { authorization: 'Bearer synthetic', traceparent: `00-${trace.traceId}-${trace.spanId}-01` }, body: JSON.stringify({ model, stream: true }) });
    await response.text();
    await hooks.get('model_call_ended')({ callId: 'call', provider: 'deepseek', model, outcome: 'completed' }, ctx);
    const result = store.read(id), ended = result.events.find(e => e.event_type === 'model.ended');
    const originalHash = ended.event_hash;
    await appendWrapperUsage(store, ended, ctx, config);
    assert.equal(store.read(id).events.length, result.events.length, 'idempotent duplicate capture');
    assert.equal(store.read(id).events.find(e => e.event_id === ended.event_id).event_hash, originalHash);
    assert.equal(result.integrity.valid, true);
    const projected = traceGraph(result).nodes.find(e => e.event_type === 'model.ended');
    assert.equal(ended.payload.usage, null, 'original ended remains unchanged');
    return { result, projected };
  };
  const [a, b, missing] = await Promise.all([run('synthetic-a', 'normal'), run('synthetic-b', 'other'), run('synthetic-missing', 'no-usage')]);
  assert.equal(nodePresentation(a.projected).tokens, 'token 12/8（单次调用）');
  assert.equal(nodePresentation(b.projected).tokens, 'token 23/9（单次调用）');
  assert.equal(nodePresentation(missing.projected).tokens, '');
  assert.equal(a.result.summary.metrics.input_tokens, null, 'no run aggregate invented');
  const tampered = structuredClone(a.result); tampered.events.at(-1).model_call_id = 'other-call';
  assert.equal(traceGraph(tampered).nodes.find(n => n.event_type === 'model.ended').payload.usage, null);
  const duplicate = structuredClone(a.result); duplicate.events.push(structuredClone(duplicate.events.at(-1)));
  assert.equal(traceGraph(duplicate).nodes.find(n => n.event_type === 'model.ended').payload.usage, null);
  const offline = structuredClone(a.result);
  assert.deepEqual(traceGraph(offline).nodes.map(nodePresentation), traceGraph(a.result).nodes.map(nodePresentation));
  const before = a.result.events.length;
  await appendWrapperUsage(store, a.result.events[2], {}, { enabled: false });
  assert.equal(store.read('synthetic-a').events.length, before);
});

test('unassociated and unavailable collection append missing reasons without changing model success', async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'u20-missing-')), hooks = new Map();
  t.after(() => { rmSync(root, { recursive: true, force: true }); globalThis[OBSERVERS]?.delete('govagentsec-trace'); });
  const store = registerTrace({ pluginConfig: { dataDir: root, usageWrapper: { enabled: true, endpoint: 'https://example.invalid', credentialFile: 'absent', providers: ['deepseek'] } },
    config: {}, logger: { warn() {} }, registerHttpRoute() {}, on: (name, fn) => hooks.set(name, fn) });
  for (const [id, trace, reason] of [
    ['unassociated', undefined, 'usage_wrapper_unassociated'],
    ['unavailable', { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }, 'usage_wrapper_unavailable'],
  ]) {
    const ctx = { runId: id, trace };
    assert.equal(await hooks.get('model_call_ended')({ callId: id, provider: 'deepseek', outcome: 'completed' }, ctx), undefined);
    const events = store.read(id).events;
    assert.equal(events[0].payload.outcome, 'completed');
    assert.equal(events[1].payload.token_missing_reason, reason); assert.equal(events[1].payload.usage, null);
  }
});
