import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createAgentGuardService, createInstanceService, loadRuntimeConfig, verifyRuntimeReady } from '../runtime.mjs';
import { apply } from '../index.mjs';
import { createSidecarService } from '../../../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/client.mjs';

test('versioned config derives installed resources without a repository or host source path', async t => {
  const root = mkdtempSync(join(tmpdir(), 'Gov 安装 runtime '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const release = join(root, 'release'); mkdirSync(release);
  writeFileSync(join(release, 'runtime.json'), JSON.stringify({ protocolVersion: 1, runtimeVersion: '1.0.0-alpha.1' }));
  const file = join(root, 'config.json');
  const config = { protocolVersion: 1, runtimeVersion: '1.0.0-alpha.1', runtimeRoot: release,
    stateDir: join(root, 'state'), pythonPath: process.execPath, scannerPython: process.execPath,
    modelRoot: join(root, 'models'), trustRagModule: join(root, 'defend.py'), tokenFile: join(root, 'service.token'),
    allowedRoots: [root], skillLoaderRoots: [root] };
  writeFileSync(file, JSON.stringify(config));
  const resolved = await loadRuntimeConfig({ runtimeConfigFile: file }, { instanceId: 'test' });
  assert.equal(resolved.scanScript, join(release, 'integrations/deepseek-harness/scan_skill.py'));
  assert.equal(resolved.projectRoot, join(release, 'modules/protect-agent-group1/智能体安全'));
  assert.ok(resolved.baseUrl.startsWith('http://127.0.0.1:'));
  assert.equal(resolved.mode, 'real');
  writeFileSync(file, JSON.stringify({ ...config, protocolVersion: 9 }));
  await assert.rejects(loadRuntimeConfig({ runtimeConfigFile: file }), /protocol/i);
  writeFileSync(file, JSON.stringify({ ...config, runtimeVersion: 'other' }));
  await assert.rejects(loadRuntimeConfig({ runtimeConfigFile: file }), /version/i);
});

test('instance lock prevents a second owner and is removed only by the owner', async t => {
  const state = mkdtempSync(join(tmpdir(), 'harness-owner-'));
  t.after(() => rmSync(state, { recursive: true, force: true }));
  let starts = 0; let stops = 0;
  const config = { instanceDir: state, runtimeVersion: '1.0.0-alpha.1' };
  const service = () => createInstanceService(config, { start: async () => { starts++; }, stop: async () => { stops++; } });
  const first = service(), second = service();
  await first.start({});
  await assert.rejects(second.start({}), /instance.*locked/i);
  await second.stop();
  assert.equal(stops, 0);
  assert.ok(existsSync(join(state, 'owner.json')));
  await first.stop();
  assert.equal(stops, 1);
  assert.equal(existsSync(join(state, 'owner.json')), false);
  assert.equal(starts, 1);
});

test('readiness requires the expected protocol, real detectors, and an actual safe request', async () => {
  const config = { mode: 'real' };
  const ready = { ready: true, version: '1', mode: 'real' };
  const allowed = { decision: 'ALLOW', detectorsAvailable: true, version: '1' };
  await verifyRuntimeReady(config, { readiness: async () => ready, screen: async () => allowed });
  await assert.rejects(verifyRuntimeReady(config, { readiness: async () => ({ ...ready, version: '2' }), screen: async () => allowed }), /protocol/i);
  await assert.rejects(verifyRuntimeReady(config, { readiness: async () => ({ ...ready, mode: 'baseline' }), screen: async () => allowed }), /real/i);
  await assert.rejects(verifyRuntimeReady(config, { readiness: async () => ready, screen: async () => ({ ...allowed, detectorsAvailable: false }) }), /probe/i);
});

test('invalid installed configuration leaves input, tools and output gates denying', async () => {
  const hooks = new Map();
  await apply({ on: (name, handler) => hooks.set(name, handler) }, { runtimeConfigFile: 'relative.json' });
  assert.throws(() => hooks.get('agent/pre-step')({}, () => { throw Error('unreachable'); }), /GovAgentSec/);
  assert.equal(hooks.get('tools/pre-execute')({}, () => ({ kind: 'allow' })).kind, 'deny');
  await assert.rejects(async () => { for await (const item of hooks.get('llm/stream')({}, async function* () { yield 'private'; })) {} }, /GovAgentSec/);
});

test('optional AgentGuard owns both children and starts without development identity', async () => {
  const calls = [], children = [];
  const config = { enabled: true, pythonPath: process.execPath, opaBinary: process.execPath,
    ticketSecretFile: process.execPath, projectRoot: tmpdir(), stateDir: tmpdir(),
    baseUrl: 'http://127.0.0.1:20000', opaBaseUrl: 'http://127.0.0.1:20001' };
  const service = createAgentGuardService(config, {
    spawnImpl(executable, args, options) {
      calls.push({ args, options });
      const child = new EventEmitter(); child.exitCode = null;
      child.kill = () => { child.exitCode = 0; child.emit('exit'); };
      children.push(child); return child;
    }, fetchImpl: async () => ({ ok: true, json: async () => ({ ready: true }) }),
  });
  await service.start();
  assert.equal(children.length, 2);
  assert.equal(calls[1].options.env.AGENTGUARD_ALLOW_DEVELOPMENT_IDENTITY, 'false');
  assert.equal(calls[0].options.windowsHide, true);
  await service.stop();
  assert.ok(children.every(child => child.exitCode === 0));
});

test('an executable spawn error becomes a startup failure rather than an unhandled error', async t => {
  const root = mkdtempSync(join(tmpdir(), 'harness-spawn-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const token = join(root, 'test.token'); writeFileSync(token, 'a'.repeat(64));
  const child = new EventEmitter(); child.exitCode = null;
  child.kill = () => { child.exitCode = 1; child.emit('exit'); };
  const service = createSidecarService({ mode: 'baseline', pythonPath: process.execPath, projectRoot: root,
    tokenFile: token, baseUrl: 'http://127.0.0.1:30001', startupTimeoutMs: 5000, isolatedEnvironment: true }, {
    spawnImpl: (file, args, options) => {
      assert.equal(options.env.PYTHONHOME, undefined); assert.equal(options.env.PYTHONPATH, undefined);
      assert.equal(options.env.PYTHONNOUSERSITE, '1');
      queueMicrotask(() => child.emit('error', Error('synthetic spawn failure'))); return child;
    },
    fetchImpl: async () => { throw Error('synthetic unavailable'); },
  });
  await assert.rejects(service.start({ logger: { info() {} } }), /failed to start/);
  await service.stop();
  assert.equal(child.exitCode, 1);
});
