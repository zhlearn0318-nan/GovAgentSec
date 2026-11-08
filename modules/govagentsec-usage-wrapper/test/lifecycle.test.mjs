import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { enable, disable } from '../lifecycle.mjs';
import { sha } from '../../../scripts/lib/config-recovery.mjs';

test('enable changes only intended fields; U18 restore is exact and refuses concurrent edits', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-u20-config-'));
  const file = path.join(root, 'openclaw.json'), stateDir = path.join(root, 'runtime');
  const original = { models: { providers: { deepseek: { baseUrl: 'https://api.deepseek.com', api: 'openai-completions', apiKey: { source: 'env', provider: 'default', id: 'DEEPSEEK_API_KEY' } },
    ollama: { baseUrl: 'http://127.0.0.1:11434', api: 'ollama' } } },
    plugins: { entries: { 'govagentsec-trace': { enabled: true, config: { dataDir: path.join(root, 'trace') } }, 'protect-agent': { enabled: true } } },
    security: { preserved_test_marker: true } };
  const bytes = JSON.stringify(original, null, 2) + '\n\n'; fs.writeFileSync(file, bytes);
  let active = false, enabledBytes;
  t.after(async () => { if (active) { fs.writeFileSync(file, enabledBytes); await disable({ stateDir }); } fs.rmSync(root, { recursive: true, force: true }); });
  const enabled = await enable({ configFile: file, stateDir, port: 0 }); active = true;
  assert.equal(enabled.sha256_before, sha(bytes)); enabledBytes = fs.readFileSync(file);
  const config = JSON.parse(enabledBytes), routing = config.models.providers.deepseek.baseUrl;
  assert.match(routing, /^http:\/\/127\.0\.0\.1:\d+\/deepseek$/);
  config.models.providers.deepseek.baseUrl = original.models.providers.deepseek.baseUrl;
  delete config.plugins.entries['govagentsec-trace'].config.usageWrapper;
  assert.deepEqual(config, original, 'unrelated providers/security/API key unchanged');
  await assert.rejects(enable({ configFile: file, stateDir, port: 0 }), /ALREADY_ENABLED/);
  fs.appendFileSync(file, '\n');
  await assert.rejects(disable({ stateDir }), /TARGET_CHANGED/);
  assert.equal((await fetch(enabled.endpoint + '/health')).status, 200, 'failed restore keeps the wrapper alive');
  fs.writeFileSync(file, enabledBytes);
  const disabled = await disable({ stateDir }); active = false;
  assert.equal(disabled.stopped, true); assert.equal(disabled.sha256_after_restore, enabled.sha256_before);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});
