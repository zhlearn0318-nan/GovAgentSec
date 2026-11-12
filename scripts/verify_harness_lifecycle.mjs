/** Exercise the installed plugin's actual Cordis disposer with real models. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: Object.fromEntries(['profile-dir', 'host-entry', 'config', 'output'].map(key => [key, { type: 'string' }])) });
for (const key of ['profile-dir', 'host-entry', 'config', 'output']) if (!values[key]) throw Error(`--${key} is required`);
const host = createRequire(resolve(values['host-entry']));
const profile = createRequire(join(resolve(values['profile-dir']), 'package.json'));
const loadHost = name => import(pathToFileURL(host.resolve(name)).href);
const { Context } = await loadHost('@deepseek-ai/cordis');
const { default: SystemPrompt } = await loadHost('@deepseek-ai/dsh-system-prompt');
const { default: Tools } = await loadHost('@deepseek-ai/dsh-tools');
const plugin = await import(pathToFileURL(profile.resolve('govagentsec-harness')).href);
const config = JSON.parse(readFileSync(values.config, 'utf8'));
const ownerFile = join(config.stateDir, 'instances', `host-${process.pid}`, 'owner.json');
const ctx = new Context();
let baseUrl;
try {
  await ctx.plugin(SystemPrompt); await ctx.plugin(Tools);
  await plugin.apply(ctx, { runtimeConfigFile: resolve(values.config) });
  const owner = JSON.parse(readFileSync(ownerFile, 'utf8'));
  baseUrl = owner.baseUrl;
  const response = await fetch(`${baseUrl}/readyz`, { headers: { Authorization: `Bearer ${readFileSync(config.tokenFile, 'utf8').trim()}` }, redirect: 'error', signal: AbortSignal.timeout(2000) });
  assert.equal((await response.json()).ready, true);
} finally { await ctx.fiber.dispose(); }
assert.equal(existsSync(ownerFile), false, 'Cordis disposal must release the instance owner record');
await assert.rejects(fetch(`${baseUrl}/healthz`, { signal: AbortSignal.timeout(2000) }), 'Owned service must stop');
writeFileSync(values.output, JSON.stringify({ installedPlugin: true, realModels: true, cordisDisposePassed: true,
  ownerReleased: true, ownedServiceStopped: true, abruptWindowsTermination: 'Can leave a stale ownership record; no PID is adopted or terminated from disk.' }, null, 2));
process.stdout.write(`Lifecycle evidence: ${resolve(values.output)}\n`);
