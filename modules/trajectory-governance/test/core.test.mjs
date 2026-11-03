import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TraceStore, digest, redact } from '../trace-store.mjs';
import { safetyGate, qualityGate, selectExperiences } from '../gates.mjs';
import { LocalJudge, validReview } from '../local-judge.mjs';
import { Workshop } from '../workshop.mjs';
import { registerTrajectory } from '../register.mjs';

const temp = () => mkdtempSync(path.join(tmpdir(), 'gov-trace-'));
function emit(store, type, extras = {}) { return store.append({ run_id: 'run-1', event_type: type, payload: {}, ...extras }); }
function complete(store) {
  emit(store, 'run.started');
  emit(store, 'tool.started', { tool_call_id: 'a' });
  emit(store, 'tool.started', { tool_call_id: 'b' });
  emit(store, 'tool.ended', { tool_call_id: 'b' });
  emit(store, 'tool.ended', { tool_call_id: 'a' });
  emit(store, 'run.ended', { payload: { success: true } });
  return store.traceId('run-1');
}
test('parallel calls pair by id, remain complete after restart', () => {
  const root = temp(), store = new TraceStore(root), id = complete(store);
  assert.equal(new TraceStore(root).read(id).summary.trace_status, 'complete');
  assert.equal(store.read(id).events[2].parent_span_id, null);
});
test('tampering and deleted suffix fail manifest validation', () => {
  const store = new TraceStore(temp()), id = complete(store), file = store.file(id);
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  writeFileSync(file, lines.slice(0, -1).join('\n') + '\n');
  assert.equal(store.read(id).summary.trace_status, 'invalid');
  assert.throws(() => emit(store, 'run.ended'), /invalid/);
});
test('missing, duplicate, and aborted calls cannot enter complete state', () => {
  for (const variant of ['missing', 'duplicate', 'aborted']) {
    const store = new TraceStore(temp());
    emit(store, 'run.started'); emit(store, 'tool.started', { tool_call_id: 'a' });
    if (variant === 'duplicate') emit(store, 'tool.started', { tool_call_id: 'a' });
    emit(store, 'run.ended', { payload: { success: variant !== 'aborted' } });
    assert.notEqual(store.read(store.traceId('run-1')).summary.trace_status, 'complete');
  }
});
test('unknown identifiers, oversized payload and orphan results remain incomplete', () => {
  const store = new TraceStore(temp());
  assert.equal(store.append({ event_type: 'tool.ended', payload: {} }).capture_status, 'partial');
  emit(store, 'run.started'); emit(store, 'tool.ended', { tool_call_id: 'orphan', payload: { text: 'x'.repeat(140000) } });
  emit(store, 'run.ended', { payload: { success: true } });
  const result = store.read(store.traceId('run-1'));
  assert.equal(result.summary.trace_status, 'partial');
  assert.equal(result.events[1].payload.omitted, true);
});
test('payload secrets are redacted before persistence', () => {
  const value = redact({ authorization: 'secret', text: 'Bearer abc123 token sk-1234567890123456 user@example.com 13812345678' });
  assert.equal(value.authorization, '[REDACTED]');
  assert.ok(!JSON.stringify(value).includes('abc123'));
});
test('confirmed hard violation overrides high numeric safety score', () => {
  const gate = safetyGate({ trace_status: 'complete', review: { status: 'verified', B: 0, I: 0, A: 0, D: 0, G: 1 }, hard_findings: [{ confirmed: true, authorization_evidence: 'not authorized', action_evidence: 'sent secret' }] });
  assert.equal(gate.decision, 'reject');
});
test('uncalibrated or mismatched model never yields safety pass', () => {
  const input = { trace_status: 'complete', review: { status: 'verified', B: 0, I: 0, A: 0, D: 0, G: 0 }, judge_digest: 'model-a', prompt_version: 'p1', rule_version: 'v1', task_family: 'procurement' };
  assert.equal(safetyGate(input).decision, 'unverified');
  const calibration = { validated: true, threshold: 0.8, judge_digest: 'model-a', prompt_version: 'p1', task_family: 'procurement', evidence_hash: 'labels', rule_version: 'v1' };
  assert.equal(safetyGate({ ...input, calibration }).decision, 'pass');
  assert.equal(safetyGate({ ...input, calibration, judge_digest: 'model-b' }).decision, 'unverified');
  assert.equal(safetyGate({ ...input, calibration, prompt_version: 'p2' }).decision, 'unverified');
});
test('recovery failure is not treated as no failure, zero tools not perfect efficiency', () => {
  const input = { N: 2, U: 0, H: 0, factuality_scope: 'observable_trajectory' };
  assert.equal(qualityGate({ ...input, recovery_status: 'no_observed_failure' }).Q, 1);
  assert.equal(qualityGate({ ...input, recovery_status: 'evaluation_error' }).status, 'unverified');
  assert.equal(qualityGate({ ...input, N: 0 }).status, 'unverified');
});
test('selection excludes unsafe and unsuccessful records and uses stable top K', () => {
  const good = { task_family: 'purchase', trace_status: 'complete', safety: { decision: 'pass' }, quality: { status: 'verified', Q: 0.9 }, task_validation: { passed: true, evidence_hash: 'result' }, data_reviewed: true };
  const records = [{ ...good, trace_id: 'a' }, { ...good, trace_id: 'b' }, { ...good, trace_id: 'c', safety: { decision: 'reject' } }];
  assert.deepEqual(selectExperiences(records, 'purchase', 1).selected.map(r => r.trace_id), ['a']);
});
test('review refuses remote endpoints and does not truncate oversized evidence', async () => {
  assert.throws(() => new LocalJudge({ endpoint: 'https://example.com' }), /loopback/);
  assert.throws(() => new LocalJudge({ endpoint: 'http://localhost:11434' }), /loopback/);
  const j = new LocalJudge({ maxInputBytes: 20 });
  assert.equal((await j.review_safety({ text: 'x'.repeat(50) })).reason, 'input_exceeds_review_coverage');
  assert.equal(validReview('safety', { status: 'verified', B: '0', I: 0, A: 0, D: 0, G: 0, evidence: ['fact'] }), false);
});
test('candidate loader isolation, artifact mutation and holdout overlap fail closed', () => {
  const root = temp(), loader = path.join(root, 'skills'); mkdirSync(loader);
  assert.throws(() => new Workshop(path.join(loader, 'candidates'), [loader]), /overlaps/);
  const workshop = new Workshop(path.join(root, 'offline'), [loader]);
  const candidate = workshop.create({ name: 'purchase-check', content: '---\nname: purchase-check\ndescription: Check purchase data\n---\nRead inputs.', source_traces: [{ trace_id: 'a', evidence_hash: 'b', original_task_group: 'train-1' }], generation: { mode: 'test_fixture' } });
  assert.throws(() => workshop.validate(candidate.id, { artifact_hash: candidate.artifact_hash, task_id: 't', original_task_group: 'train-1', verifier_version: 'v1', result_hash: 'r' }), /overlaps/);
  assert.throws(() => workshop.requestApproval(candidate.id), /expected/);
  const file = path.join(workshop.directory(candidate.id), 'bundle', 'SKILL.md');
  chmodSync(file, 0o600); writeFileSync(file, 'changed after inspection');
  assert.throws(() => workshop.read(candidate.id), /changed/);
});
test('unreviewed candidate cannot request approval and added files invalidate a snapshot', () => {
  const root = temp(), workshop = new Workshop(path.join(root, 'offline'), [path.join(root, 'loader')]);
  const c = workshop.create({ name: 'purchase-audit', content: '---\nname: purchase-audit\n---\nCheck receipts', source_traces: [{ trace_id: 'a', evidence_hash: 'h', original_task_group: 'train' }], generation: { mode: 'fixture' } });
  assert.throws(() => workshop.requestApproval(c.id), /expected/);
  writeFileSync(path.join(workshop.directory(c.id), 'bundle', 'payload.js'), 'malicious');
  assert.throws(() => workshop.read(c.id), /bundle changed/);
});
test('plugin hooks preserve ids, return no overriding runtime decision', () => {
  const hooks = {}, routes = [];
  const store = registerTrajectory({ pluginConfig: { dataDir: temp() }, logger: { warn() {} }, on: (name, handler) => hooks[name] = handler, registerHttpRoute: r => routes.push(r) });
  assert.equal(hooks.before_agent_run({ runId: 'live', prompt: 'test' }), undefined);
  hooks.before_tool_call({ toolName: 'read', params: {}, toolCallId: 'tool1' }, { runId: 'live' });
  hooks.after_tool_call({ toolName: 'read', result: 'ok', toolCallId: 'tool1' }, { runId: 'live' });
  hooks.agent_end({ runId: 'live', success: true });
  hooks.llm_output({ runId: 'live', assistantTexts: ['done'] });
  assert.equal(store.read(store.traceId('live')).summary.trace_status, 'complete');
  assert.equal(routes.find(r => r.path === '/plugins/govagentsec/trajectories').auth, 'gateway');
  assert.equal(routes.find(r => r.path === '/plugins/govagentsec/candidates').auth, 'gateway');
});
test('real host order: output after agent_end seals once; model error overrides host success', () => {
  const store = new TraceStore(temp());
  emit(store, 'run.started');
  emit(store, 'model.started', { model_call_id: 'm' });
  emit(store, 'model.ended', { model_call_id: 'm', payload: { outcome: 'error' } });
  emit(store, 'run.ended', { seal: false, payload: { success: true } });
  emit(store, 'model.output', { payload: { texts: [] } });
  store.seal(store.traceId('run-1'));
  assert.equal(store.read(store.traceId('run-1')).summary.trace_status, 'interrupted');
});
