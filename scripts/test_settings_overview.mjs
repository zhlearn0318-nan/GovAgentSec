import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeOverview } from '../modules/govagentsec-ui/runtime-overview.mjs';

test('missing runtime evidence stays unknown instead of reporting zero or healthy', () => {
  const result = runtimeOverview(null);
  assert.deepEqual(result.counts, { total: null, allow: null, require_approval: null, deny: null });
  assert.equal(result.evidence, null);
  assert.deepEqual(result.components.map(row => row.ready), [null, null, null]);
});

test('overview keeps measured zeros and projects only aggregate runtime evidence', () => {
  const result = runtimeOverview({
    counts: { total: 8, allow: 5, require_approval: 3, deny: 0 },
    evidence: { complete: 7, total: 8 },
    services: { agentguard: { ok: true }, dependencies: { ok: true, payload: { ready: false, token: 'private' } }, openclaw_mcp: { ok: false } },
    requests: [{ parameters: 'private' }],
  });
  assert.equal(result.counts.deny, 0);
  assert.deepEqual(result.evidence, { complete: 7, total: 8 });
  assert.deepEqual(result.components.map(row => row.ready), [true, false, false]);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('malformed counters never produce misleading statistics', () => {
  const result = runtimeOverview({ counts: { total: -1, allow: '5', deny: 1.5 }, evidence: { complete: 5, total: 3 } });
  assert.deepEqual(result.counts, { total: null, allow: null, require_approval: null, deny: null });
  assert.equal(result.evidence, null);
});
