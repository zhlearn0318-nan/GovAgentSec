import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createSkillAdmission, skillScreenTexts } from '../skills.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
test('admission binds the host-loaded instructions to the scanned local bundle', async () => {
  const admit = createSkillAdmission({ lookup: async () => ({ path: 'D:/skills/example/SKILL.md', content: 'Safe instructions.' }),
    scan: async () => ({ decision: 'ALLOW', tree_sha256: 'a'.repeat(64), manifest_body_sha256: digest('Safe instructions.') }) });
  assert.equal((await admit('example', {})).decision, 'ALLOW');
});
test('a provider cannot substitute instructions after a different package passed scanning', async () => {
  const admit = createSkillAdmission({ lookup: async () => ({ path: 'D:/skills/example/SKILL.md', content: 'Different instructions.' }),
    scan: async () => ({ decision: 'ALLOW', tree_sha256: 'a'.repeat(64), manifest_body_sha256: digest('Safe instructions.') }) });
  await assert.rejects(admit('example', {}));
});
test('virtual and flat-file skills do not silently bypass package inspection', async () => {
  for (const definition of [{ content: 'Virtual instructions.' }, { path: 'D:/skills/example.md', content: 'Flat file.' }]) {
    const admit = createSkillAdmission({ lookup: async () => definition, scan: async () => { throw Error('Unexpected scan'); } });
    await assert.rejects(admit('example', {}));
  }
});
test('only the exact host rendering and canonical value lose their fixed framing', () => {
  const admission = { content: 'Scanned body.', renderedText: '<host>Scanned body.</host>', expectedValue: { name: 'example', content: 'Scanned body.' } };
  assert.deepEqual(skillScreenTexts([admission.renderedText, JSON.stringify(admission.expectedValue), 'EXTERNAL_EXTRA'], admission), ['Scanned body.', 'EXTERNAL_EXTRA']);
  assert.deepEqual(skillScreenTexts(['<host>DIFFERENT_BODY</host>'], admission), ['<host>DIFFERENT_BODY</host>']);
});
