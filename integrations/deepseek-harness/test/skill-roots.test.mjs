import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { automaticSkillRoots } from '../skill-roots.mjs';

test('automatic scopes follow the trusted host workspace and skip nonexistent directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-roots-'));
  try {
    const project = join(root, 'project');
    const nested = join(project, 'src');
    const skillRoot = join(project, '.agents', 'skills');
    const custom = join(root, 'custom');
    for (const p of [join(project, '.git'), nested, skillRoot, custom]) mkdirSync(p, { recursive: true });
    assert.deepEqual(automaticSkillRoots([custom, join(root, 'missing')], nested), [custom, skillRoot]);
    assert.deepEqual(automaticSkillRoots([custom], undefined), [custom]);
    assert.throws(() => automaticSkillRoots([], 'relative'), /absolute/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
