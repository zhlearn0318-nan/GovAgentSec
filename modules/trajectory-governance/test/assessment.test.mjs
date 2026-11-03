import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrate, confusion, comparisonPlan } from '../assessment.mjs';
const identity = { judge_digest: 'model-fixture', prompt_version: 'prompt-fixture', rule_version: 'rule-fixture', task_family: 'procurement' };
function rows() {
  return ['calibration', 'test'].flatMap(split => [true, false].flatMap(attack => Array.from({ length: 10 }, (_, i) => ({
    ...identity, id: `${split}-${attack}-${i}`, original_task_group: `${split}-${attack}-${i}`, split, attack,
    score: attack ? 0.2 : 0.95, evidence_hash: 'fixture', human_reviewed: true,
  }))));
}
test('calibration uses disjoint groups and freezes threshold before test', () => {
  const result = calibrate(rows(), identity);
  assert.equal(result.validated, true); assert.equal(result.test.TP, 10); assert.equal(result.test.TN, 10);
  const overlap = rows(); overlap[20].original_task_group = overlap[0].original_task_group;
  assert.throws(() => calibrate(overlap, identity), /overlap/);
});
test('test failures invalidate calibration instead of fitting a new threshold', () => {
  const inputs = rows(), expected = calibrate(inputs, identity).threshold;
  for (const r of inputs) if (r.split === 'test' && r.attack) r.score = 0.99;
  const result = calibrate(inputs, identity);
  assert.equal(result.threshold, expected); assert.equal(result.validated, false); assert.equal(result.test.FN, 10);
});
test('unknown labels remain in denominators and hard rejection is not diluted', () => {
  const m = confusion([{ attack: true, score: null }, { attack: false, score: null }, { attack: true, score: null, hard_reject: true }], 0.8);
  assert.equal(m.recall, 0.5); assert.equal(m.normal_retention, 0); assert.equal(m.total, 3);
});
test('mismatched model or unreviewed labels cannot produce calibration', () => {
  const data = rows(); data[0].human_reviewed = false;
  assert.throws(() => calibrate(data, identity), /human-reviewed/);
  assert.throws(() => calibrate(rows(), { ...identity, prompt_version: 'changed' }), /identity mismatch/);
});
test('four arms use the same cap but do not refill rejected experiences', () => {
  const base = { task_family: 'procurement', trace_status: 'complete', data_reviewed: true, task_validation: { passed: true, evidence_hash: 'task' }, quality: { status: 'verified', Q: 0.9 } };
  const data = [{ ...base, trace_id: 'a', safety: { decision: 'pass' } }, { ...base, trace_id: 'b', safety: { decision: 'reject' } }];
  const plan = comparisonPlan(data, { k: 2, seed: 'fixed', taskFamily: 'procurement' });
  assert.equal(plan.arms.random.actual_count, 2); assert.equal(plan.arms.dual.actual_count, 1);
  assert.deepEqual(plan, comparisonPlan(data, { k: 2, seed: 'fixed', taskFamily: 'procurement' }));
  assert.equal(plan.mode, 'selection_only_not_skill_effectiveness');
});
