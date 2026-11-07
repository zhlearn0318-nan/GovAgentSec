import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TraceStore, parseJSONL, verifyChain } from '../store.mjs';
import { redact, contentEvidence, digest } from '../privacy.mjs';
import { quality, safety, selectTopK, assess, FixtureJudge } from '../scoring.mjs';
import { createFixtures } from '../fixtures.mjs';
import { generateCandidate } from '../evolution.mjs';
import { registerTrace, OBSERVERS } from '../register.mjs';
import { compareTraces, traceGraph } from '../view-model.mjs';
import { Workshop } from '../../trajectory-governance/workshop.mjs';
import { Releases } from '../../trajectory-governance/releases.mjs';

const temp = () => mkdtempSync(path.join(os.tmpdir(), 'gov-trace-'));
const configuration = { t_star: .6, calibration_version: 'test-only' };
async function fixture() {
  const root = temp(), store = new TraceStore(path.join(root, 'traces')), evidence = createFixtures(store), judge = new FixtureJudge(evidence);
  const records = await Promise.all(Object.keys(evidence).map(id => assess(store.read(id), judge, configuration)));
  return { root, store, evidence, records };
}
test('hash chain detects content mutation, gaps, truncation, broken parent and malformed lines', () => {
  const store = new TraceStore(temp());
  const a = store.append({ trace_id: 'run/raw:identity', event_type: 'run.started' });
  store.append({ trace_id: a.trace_id, event_type: 'run.ended', parent_event_id: a.event_id });
  const trace = store.read(a.trace_id); assert.equal(trace.integrity.valid, true); assert.equal(trace.events[0].trace_id, a.trace_id);
  const copy = structuredClone(trace.events); copy[0].payload.changed = true; assert.equal(verifyChain(copy).valid, false);
  assert.equal(verifyChain([trace.events[1]]).valid, false);
  assert.equal(parseJSONL('{bad}\n' + JSON.stringify(a)).errors[0].line, 1);
  writeFileSync(store.file(a.trace_id), JSON.stringify(a) + '\n'); assert.equal(store.read(a.trace_id).integrity.valid, false);
  assert.throws(() => store.append({ trace_id: a.trace_id, event_type: 'late' }), /broken chain/);
});
test('privacy never stores prompt, params, results or secrets; summaries are structural', () => {
  const store = new TraceStore(temp(), { contentMode: 'summary' });
  const secret = 'unique-private-value';
  store.append({ trace_id: 'privacy', event_type: 'run.started', payload: { prompt: secret, params: { token: secret }, result: { cookie: secret },
    password: secret, identity: '110101199001010013', text: 'Bearer secretValue cookie=privateCookie' } });
  const text = readFileSync(store.file('privacy'), 'utf8');
  for (const value of [secret, '110101199001010013', 'secretValue', 'privateCookie']) assert.equal(text.includes(value), false);
  assert.deepEqual(contentEvidence(secret, 'summary').summary, { type: 'string', items: null });
  assert.equal(redact({ apiKey: secret }).apiKey, '[REDACTED]');
  assert.throws(() => new TraceStore(temp(), { contentMode: 'raw' }), /prohibited/);
});
test('Q exact formulas and missing evidence', () => {
  assert.equal(quality({ N: 10, U: 2, R: 4, A_r: 3, H: .1, failure_status: 'evaluated' }).Q, (.8 + .75 + .9) / 3);
  assert.equal(quality({ N: 10, U: 2, R: 0, H: .1, failure_status: 'no_observed_failure' }).Q, (.8 + .9) / 2);
  for (const row of [{}, { N: 0 }, { N: 1, U: 0, H: 0 }, { N: 1, U: 0, H: 0, failure_status: 'evaluation_error' }, { N: 1, U: 2, H: 0 }, { N: 1, U: 0, H: NaN }]) assert.equal(quality(row).Q, null);
});
test('S uses ordinal expectation, G binary, equality quarantines', () => {
  const review = { B: 'A', I: 'A', A: 'A', D: 'A' };
  assert.equal(safety(review, { ...configuration, t_star: 1 }, 0).decision, 'quarantine');
  assert.equal(safety({ ...review, B:'D', I:'D' }, configuration, 0).decision, 'quarantine');
  assert.equal(safety(review, configuration, 0).S, 1);
  assert.equal(safety({ ...review, B: 'B' }, configuration, 1).S, 1 - (1 / 3 + 1) / 5);
  assert.equal(safety({ ...review, B: { probabilities: { A: .5, B: 0, C: 0, D: .5 } } }, configuration, 0).S, .9);
  assert.equal(safety(review, configuration, .5).S, null);
  assert.equal(safety({ ...review, B: .4 }, configuration, 0).S, null);
});
test('TopK denominator includes missing Q, stable ties, safety first and cross-task excluded', () => {
  const row = i => ({ trace_id: String(i), task_key: 'task', task_confirmed: true, safety: { decision: 'pass' }, quality: { Q: .8, status: 'computed' } });
  const rows = Array.from({ length: 5 }, (_, i) => row(i)); rows[4].quality = { Q: null, status: 'missing' };
  rows.push({ ...row(9), safety: { decision: 'quarantine' } }, { ...row(10), task_key: 'other' });
  const result = selectTopK(rows, 'task'); assert.equal(result.denominator, 5); assert.equal(result.requested_count, 4);
  assert.deepEqual(result.selected.map(r => r.trace_id), ['0', '1', '2', '3']);
  assert.equal(selectTopK([row(0)], 'task').selected.length, 0);
  assert.throws(() => selectTopK([row(0), row(0)], 'task'), /duplicate/);
});
test('six trajectories isolate poison, exclude low quality, generate provenance outside loader', async () => {
  const { root, store, records } = await fixture();
  assert.equal(records[4].safety.decision, 'quarantine'); assert.equal(records[4].safety.reason, 'enforced_security_block');
  const result = generateCandidate(store, records, { task_key: 'expense-word-template', name: 'test-candidate', workshopRoot: path.join(root, 'skill-workshop'), loaderRoots: [path.join(root, 'loader')] });
  assert.equal(result.selection.denominator, 5); assert.equal(result.selection.selected.length, 4);
  assert.equal(result.selection.decisions[5].reason, 'below_topk');
  assert.equal(result.candidate.generation.steps.every(s => s.evidence.length === 4), true);
  const workshop = new Workshop(path.join(root, 'skill-workshop'), [path.join(root, 'loader')]);
  const denied = workshop.admit(result.candidate.id, { command: 'nonexistent-command', script: 'combined_install_policy.py', openclawVersion: '2026.7.1-2' });
  assert.equal(denied.status, 'unverified'); assert.throws(() => workshop.requestApproval(denied.id));
  const release = new Releases(path.join(root, 'releases'), path.join(root, 'loader'), workshop);
  assert.throws(() => release.review(denied.id), /test-evidence/);
  assert.throws(() => new Workshop(path.join(root, 'loader/candidates'), [path.join(root, 'loader')]), /overlap/);
  store.assign(records[0].trace_id, { task_key: 'other', confirmed: true });
  assert.throws(() => generateCandidate(store, records, { task_key: 'expense-word-template', name: 'test-candidate', workshopRoot: path.join(root, 'skill-workshop'), loaderRoots: [path.join(root, 'loader')] }), /source evidence/);
});
test('failed capture and unavailable judge are visible and cannot be selected', async () => {
  const { store } = await fixture(); const id = 'fixture-word-1';
  store.failure(id, 'model_call_ended');
  assert.equal(new TraceStore(store.root).read(id).summary.trace_status, 'partial');
  const row = await assess(store.read(id), new FixtureJudge(), configuration);
  assert.equal(row.quality.Q, null); assert.equal(row.safety.decision, 'quarantine');
});
test('graph exact parents, retry and same-task comparison come from JSONL', async () => {
  const { store } = await fixture(); const a = store.read('fixture-word-1'), b = store.read('fixture-word-2');
  assert.equal(a.summary.metrics.output_tokens, 80);
  const graph = traceGraph(a); assert.equal(graph.edges.some(e => e.kind === 'call'), true); assert.equal(graph.nodes.some(n => n.retry), true);
  const comparison = compareTraces([a, b]); assert.equal(comparison.success_rate, 1); assert.equal(comparison.rows.length, 2);
  b.summary.task_key = 'other'; assert.throws(() => compareTraces([a, b]), /task_key/);
});
test('registered observation hooks return undefined, preserve IDs, survive disk failure; all data RPC scoped', async () => {
  const root = temp(), hooks = new Map(), rpc = new Map(), routes = [];
  const store = registerTrace({ pluginConfig: { dataDir: root }, config: {}, logger: { warn() {} },
    on(name, fn) { hooks.set(name, fn); }, registerGatewayMethod(name, fn, options) { rpc.set(name, { fn, options }); }, registerHttpRoute(route) { routes.push(route); } });
  const ctx = { runId: 'actual-run-id', sessionKey: 's', sessionId: 'sid' };
  assert.equal(await hooks.get('before_agent_run')({ prompt: 'private' }, ctx), undefined);
  assert.equal(await hooks.get('before_tool_call')({ toolName: 'read', toolCallId: 't', params: { path: 'skills/test/SKILL.md' } }, ctx), undefined);
  await hooks.get('after_tool_call')({ toolName: 'read', toolCallId: 't', params: { path: 'skills/test/SKILL.md' }, result: { content: [{ text: 'private' }] } }, ctx);
  assert.equal(store.read(ctx.runId).events.some(e => e.event_type === 'skill.observed'), true);
  assert.equal(rpc.get('govagentsec.trace.detail').options.scope, 'operator.read'); assert.equal(rpc.get('govagentsec.trace.generate').options.scope, 'operator.write');
  assert.equal(routes.every(r => r.path.endsWith('.mjs')), true);
  const original = store.append; store.append = () => { throw new Error('disk'); };
  assert.equal(await hooks.get('before_agent_run')({}, ctx), undefined); assert.equal(store.failures.length, 1);
  store.append = original; globalThis[OBSERVERS].delete('govagentsec-trace');
});
