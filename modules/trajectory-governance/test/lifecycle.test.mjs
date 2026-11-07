import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';
import { Workshop } from '../workshop.mjs';
import { Releases } from '../releases.mjs';
import { digest, TraceStore } from '../trace-store.mjs';
import { runTask, HOLDOUT_TASKS, taskOracle } from '../validation.mjs';
import { renderTrajectoryPanel } from '../panel.mjs';

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'gov-lifecycle-'));
  const loader = path.join(root, 'skills'), w = new Workshop(path.join(root, 'candidates'), [loader]);
  return { root, loader, w, releases: new Releases(path.join(root, 'releases'), loader, w) };
}
function ready(w, suffix = '') {
  const c = w.create({ name: 'purchase-check', content: '---\nname: purchase-check\n---\nKeep approvals. ' + suffix, source_traces: [{ trace_id: 'train', evidence_hash: 'trainhash', original_task_group: 'train' }], generation: { mode: 'unit_fixture' } });
  w.transition(c.id, 'draft', 'admission_passed', { response: { decision: 'allow' }, mode: 'unit_fixture' });
  const cases = [{ task_id: 'holdout', original_task_group: 'holdout', task_passed: true, trace_status: 'complete', unauthorized_attempts: 0, unauthorized_effects: 0 }];
  w.validate(c.id, { artifact_hash: c.artifact_hash, task_id: 'suite', original_task_group: 'holdout-suite', verifier_version: 'fixture', verifier_hash: 'hash', suite_hash: 'suite', cases, result_hash: digest(cases), task_passed: true, unauthorized_effects: 0, approvals_preserved: true });
  return w.requestApproval(c.id);
}
test('publish binds exact reviewed bytes and confirms before modifying loader', () => {
  const { w, releases } = setup(), c = ready(w), r = releases.review(c.id);
  assert.throws(() => releases.publish(c.id, { actor: 'test', confirmation: 'wrong' }), /confirmation/);
  assert.equal(releases.current(c.name), null);
  const published = releases.publish(c.id, { actor: 'unit-test', confirmation: r.confirmation });
  assert.equal(published.artifact_hash, c.artifact_hash);
  assert.equal(digest(readFileSync(releases.paths(c.name).file, 'utf8')), c.artifact_hash);
  assert.equal(w.read(c.id).status, 'published');
  assert.equal(published.loader_status, 'reload_required');
});
test('changed candidate invalidates confirmation; unmanaged skills cannot be overwritten', () => {
  const { w, releases } = setup(), c = ready(w); releases.review(c.id);
  const p = path.join(w.directory(c.id), 'bundle', 'SKILL.md'); chmodSync(p, 0o600); writeFileSync(p, 'changed');
  assert.throws(() => releases.publish(c.id, { actor: 'test', confirmation: 'x' }), /changed/);
});
test('rollback restores checked revision and revokes superseded candidate', () => {
  const { w, releases } = setup(), a = ready(w, 'A');
  releases.publish(a.id, { actor: 'unit-test', confirmation: releases.review(a.id).confirmation });
  const b = ready(w, 'B'); releases.publish(b.id, { actor: 'unit-test', confirmation: releases.review(b.id).confirmation });
  const review = releases.rollbackReview(a.name, a.artifact_hash);
  assert.throws(() => releases.rollback(a.name, a.artifact_hash, { actor: 'test', confirmation: 'wrong' }), /confirmation/);
  releases.rollback(a.name, a.artifact_hash, { actor: 'unit-test', confirmation: review.confirmation });
  assert.equal(releases.current(a.name).artifact_hash, a.artifact_hash);
  assert.equal(w.read(b.id).status, 'revoked');
  assert.throws(() => releases.rollbackReview(b.name, b.artifact_hash), /revoked/);
});
test('stale publication review fails when a different version has been published', () => {
  const { w, releases } = setup(), a = ready(w, 'A'), b = ready(w, 'B');
  const old = releases.review(b.id);
  releases.publish(a.id, { actor: 'unit-test', confirmation: releases.review(a.id).confirmation });
  assert.throws(() => releases.publish(b.id, { actor: 'unit-test', confirmation: old.confirmation }), /confirmation/);
});
test('crash before active write cancels prepared transaction without publication', () => {
  const { w, releases } = setup(), c = ready(w), r = releases.review(c.id), p = releases.paths(c.name);
  mkdirSync(p.archive, { recursive: true });
  writeFileSync(p.pending, JSON.stringify({ name: c.name, content: r.content, artifact_hash: c.artifact_hash, previous_hash: null, actor: 'fixture', confirmation: r.confirmation }));
  assert.throws(() => releases.current(c.name), /interrupted/);
  assert.equal(releases.recover(c.name), null); assert.equal(existsSync(p.pending), false); assert.equal(w.read(c.id).status, 'pending_approval');
});
test('crash recovery refuses unexpected active edits', () => {
  const { w, releases } = setup(), c = ready(w), r = releases.review(c.id), p = releases.paths(c.name);
  mkdirSync(p.archive, { recursive: true }); mkdirSync(p.active, { recursive: true });
  writeFileSync(p.pending, JSON.stringify({ name: c.name, content: r.content, artifact_hash: c.artifact_hash, previous_hash: null, actor: 'fixture', confirmation: r.confirmation }));
  writeFileSync(p.file, 'external edit');
  assert.throws(() => releases.recover(c.name), /manual reconciliation/); assert.equal(readFileSync(p.file, 'utf8'), 'external edit');
});
test('incomplete verifier evidence cannot reach approval', () => {
  const { w } = setup();
  const c = w.create({ name: 'test-skill', content: '---\nname: test-skill\n---\nx', source_traces: [{ trace_id: 'a', evidence_hash: 'b', original_task_group: 'train' }] });
  assert.throws(() => w.validate(c.id, { artifact_hash: c.artifact_hash, task_id: 'x', original_task_group: 'test', verifier_version: 'v', result_hash: 'r' }), /case evidence/);
});
const clientFor = actions => ({ model: 'fixture', numGpu: 0, request: async () => ({ done_reason: 'stop', message: { content: JSON.stringify(actions.shift() ?? { action: 'finish', report: null }) } }) });
test('independent oracle uses cents and rejects wrong arithmetic', () => {
  assert.equal(taskOracle(HOLDOUT_TASKS[0], { total_cents: 10290, item_count: 2 }).passed, true);
  assert.equal(taskOracle(HOLDOUT_TASKS[0], { total_cents: 10289, item_count: 2 }).passed, false);
});
test('controlled validation executes actual action sequence and records paired tools', async () => {
  const { root } = setup(), store = new TraceStore(path.join(root, 'traces'));
  const result = await runTask({ task: HOLDOUT_TASKS[0], skill: 'check', store, client: clientFor([
    { action: 'read_materials', report: null }, { action: 'calculate', report: null }, { action: 'write_report', report: { total_cents: 10290, item_count: 2 } }, { action: 'finish', report: null },
  ]) });
  assert.equal(result.task_passed, true); assert.equal(result.trace_status, 'complete');
});
test('external action attempt is denied and disqualifies even a correct final report', async () => {
  const { root } = setup(), store = new TraceStore(path.join(root, 'traces'));
  const result = await runTask({ task: HOLDOUT_TASKS[0], skill: 'test', store, client: clientFor([
    { action: 'read_materials', report: null }, { action: 'calculate', report: null }, { action: 'external_send', report: null }, { action: 'write_report', report: { total_cents: 10290, item_count: 2 } }, { action: 'finish', report: null },
  ]) });
  assert.equal(result.task_passed, false); assert.equal(result.unauthorized_attempts, 1); assert.equal(result.unauthorized_effects, 0);
});
test('model infrastructure error stays unverified, not a passed task', async () => {
  const { root } = setup(), store = new TraceStore(path.join(root, 'traces'));
  const result = await runTask({ task: HOLDOUT_TASKS[0], skill: 'test', store, client: { request: async () => { throw new Error('offline'); } } });
  assert.equal(result.status, 'unverified'); assert.equal(result.trace_status, 'interrupted');
});
test('panel client script parses and renders untrusted records with textContent', () => {
  const html = renderTrajectoryPanel();
  for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(script);
  assert.ok(!html.includes('innerHTML')); assert.ok(!html.includes('localStorage'));
  assert.ok(html.includes('两次运行对照'));
});
