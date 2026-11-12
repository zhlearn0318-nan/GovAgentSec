import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installHarnessTrajectory } from '../trajectory.mjs';

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'harness-trace-'));
  t.after(() => { assert.ok(root.startsWith(join(tmpdir(), 'harness-trace-'))); rmSync(root, { recursive: true, force: true }); });
  const hooks = new Map();
  const capture = installHarnessTrajectory({ on: (name, handler) => hooks.set(name, handler) }, { dataDir: root });
  let seq = 0;
  const event = (id, type, data) => hooks.get('session/event')({ id }, { type, data, seq: seq++, time: Date.now() });
  const frame = (id, value) => hooks.get('agent/assistant-stream')({ agent: { session: { id } }, frame: value });
  return { root, capture, event, frame };
}

function run({ event, frame }, id = 'private-session', turn = 1, { failed = false } = {}) {
  event(id, 'turn/start', { turn });
  event(id, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: 'PRIVATE PROMPT api_key=hidden123456789' }] });
  frame(id, { type: 'start', attemptId: id + ':1', turn, step: 1 });
  event(id, 'assistant/message', { turn, step: 1, message: { source: { model: 'local-test', provider: 'test' }, content: [{ type: 'text', text: 'PRIVATE RESPONSE' }, { type: 'reasoning', text: 'PRIVATE THOUGHT' }] }, usage: { inputTokens: 3, cacheReadTokens: 2, outputTokens: 5, totalTokens: 10 } });
  frame(id, { type: 'end', attemptId: id + ':1', outcome: { kind: 'committed', eventType: 'assistant/message' } });
  event(id, 'tool/call', { turn, step: 1, callId: 'call-one', name: 'read', arguments: '{"path":"private.txt"}' });
  event(id, 'tool/result', { turn, step: 1, message: { toolCallId: 'call-one', isError: failed, content: [{ type: 'text', text: 'PRIVATE FILE' }] } });
  event(id, 'turn/end', { turn, reason: { kind: failed ? 'error' : 'completed' } });
}

test('native attempts and tool IDs produce verified trace pairs without storing private content', t => {
  const harness = setup(t);
  run(harness);
  const rows = harness.capture.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'deepseek-harness');
  assert.equal(rows[0].trace_status, 'complete');
  assert.equal(rows[0].metrics.input_tokens, 5);
  assert.equal(rows[0].metrics.total_tokens, 10);
  const trace = harness.capture.detail(rows[0].trace_id);
  assert.equal(trace.integrity.valid, true);
  assert.equal(trace.graph.edges.filter(edge => edge.kind === 'call').length, 2);
  assert.equal(trace.events.find(row => row.event_type === 'tool.ended').parent_event_id, trace.events.find(row => row.event_type === 'tool.started').event_id);
  const disk = readFileSync(harness.capture.store.file(rows[0].trace_id), 'utf8');
  for (const text of ['PRIVATE PROMPT', 'PRIVATE RESPONSE', 'PRIVATE THOUGHT', 'PRIVATE FILE', 'private-session', 'hidden123456789', 'private.txt']) assert.ok(!disk.includes(text), text);
});

test('parallel sessions and successive turns never share trace or model identities', t => {
  const harness = setup(t);
  harness.event('session-a', 'turn/start', { turn: 1 });
  run(harness, 'session-b');
  harness.event('session-a', 'turn/end', { turn: 1, reason: { kind: 'aborted' } });
  run(harness, 'session-b', 2);
  assert.equal(new Set(harness.capture.list().map(row => row.trace_id)).size, 3);
  assert.equal(harness.capture.list().filter(row => row.metrics.success === true).length, 2);
});

test('a security rejection before model dispatch is blocked rather than a successful experience', t => {
  const harness = setup(t);
  harness.event('rejected', 'turn/start', { turn: 1 });
  harness.capture.protection({ session: harness.capture.sessionKey('rejected'), phase: 'input', decision: 'BLOCK', enforced: true });
  harness.event('rejected', 'turn/end', { turn: 1, reason: { kind: 'error' } });
  const row = harness.capture.list()[0];
  assert.equal(row.trace_status, 'blocked');
  assert.equal(row.metrics.success, false);
  assert.equal(harness.capture.detail(row.trace_id).events.some(e => e.event_type === 'model.started'), false);
});

test('retries retain distinct real attempts, and cancellation does not fabricate success or usage', t => {
  const harness = setup(t);
  harness.event('retry', 'turn/start', { turn: 1 });
  for (const attempt of [1, 2]) {
    harness.frame('retry', { type: 'start', attemptId: 'retry:' + attempt, turn: 1, step: 1 });
    harness.event('retry', 'assistant/attempt', { turn: 1, step: 1 });
    harness.frame('retry', { type: 'end', attemptId: 'retry:' + attempt, outcome: { kind: 'committed', eventType: 'assistant/attempt' } });
  }
  harness.event('retry', 'turn/end', { turn: 1, reason: { kind: 'aborted' } });
  const row = harness.capture.list()[0];
  assert.equal(row.metrics.success, false);
  assert.equal(row.metrics.total_tokens, null);
  const trace = harness.capture.detail(row.trace_id);
  assert.equal(new Set(trace.events.filter(e => e.event_type === 'model.started').map(e => e.model_call_id)).size, 2);
  assert.equal(trace.events.filter(e => e.event_type === 'model.ended').length, 2);
  assert.equal(trace.integrity.valid, true);
});

test('unknown trace IDs cannot read arbitrary files, and evidence corruption is reported', t => {
  const harness = setup(t);
  run(harness);
  assert.throws(() => harness.capture.detail('../installation.json'));
  const row = harness.capture.list()[0];
  assert.equal(harness.capture.evolution().automaticPublish, false);
  assert.equal(harness.capture.evolution().calibrated, false);
  assert.equal(row.task_confirmed, false);
  const file = harness.capture.store.file(row.trace_id);
  writeFileSync(file, readFileSync(file, 'utf8').replace('"source":"deepseek-harness"', '"source":"tampered"'));
  assert.equal(harness.capture.detail(row.trace_id).integrity.valid, false);
});
