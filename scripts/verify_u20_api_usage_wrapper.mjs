#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { enable, disable } from '../modules/govagentsec-usage-wrapper/lifecycle.mjs';
import { fixtureUpstream } from '../modules/govagentsec-usage-wrapper/test/fixtures/upstream.mjs';
import { configPath, sha, version } from './lib/config-recovery.mjs';
import { TraceStore } from '../modules/govagentsec-trace/store.mjs';
import { traceGraph, nodePresentation } from '../modules/govagentsec-trace/view-model.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const out = path.resolve(process.argv[2] ?? 'local-validation/u20-api-usage-wrapper/' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(path.join(out, 'logs'), { recursive: true });
const save = (name, value) => fs.writeFileSync(path.join(out, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
const liveConfig = configPath(), beforeLive = sha(fs.readFileSync(liveConfig));
const approvalsFile = path.join(process.env.USERPROFILE, '.openclaw/exec-approvals.json');
const approvalHash = () => fs.existsSync(approvalsFile) ? sha(fs.readFileSync(approvalsFile)) : null;
const approvalsBefore = approvalHash();
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-u20-'));
const stateDir = path.join(runtime, 'wrapper'), configFile = path.join(runtime, 'openclaw.json');
const host = path.join(process.env.APPDATA, 'npm/node_modules/openclaw');
const report = { passed: false, source: 'real-openclaw-with-synthetic-http-upstream', cloud_call: false,
  default_enabled: false, configuration_mode: 'isolated-config-roundtrip', checks: [], output: out };
let upstream, active = false;
const run = (args, env) => new Promise(resolve => {
  const child = spawn(process.execPath, args, { cwd: repo, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', timedOut = false;
  child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 100000);
  child.on('error', () => { clearTimeout(timer); resolve({ code: -1, stdout: '', stderr: 'PROCESS_START_FAILED' }); });
  child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }); });
});
try {
  report.host_version = version();
  const ver = spawnSync(process.execPath, [path.join(host, 'dist/index.js'), '--version'], { encoding: 'utf8', windowsHide: true });
  assert.equal(ver.status, 0); save('openclaw-version.txt', ver.stdout);
  upstream = await fixtureUpstream();
  const traceData = path.join(out, 'host-trace');
  const config = {
    gateway: { mode: 'local', auth: { mode: 'token', token: randomUUID() } },
    models: { mode: 'replace', providers: { deepseek: { baseUrl: upstream.url, api: 'openai-completions', apiKey: 'synthetic-only',
      models: [{ id: 'fixture-usage', name: 'Synthetic U20', reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 256, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } },
    agents: { defaults: { model: { primary: 'deepseek/fixture-usage', fallbacks: [] }, workspace: path.join(runtime, 'workspace'), skipBootstrap: true } },
    tools: { profile: 'minimal', deny: ['exec', 'process', 'read', 'write', 'edit', 'browser', 'web_search', 'web_fetch', 'sessions_spawn'] },
    plugins: { allow: ['govagentsec-trace'], load: { paths: [path.join(repo, 'modules/govagentsec-trace')] },
      entries: { 'govagentsec-trace': { enabled: true, hooks: { allowConversationAccess: true }, config: { dataDir: traceData } } } },
  };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  const enabled = await enable({ configFile, stateDir, port: 0 }); active = true;
  report.enabled = { ...enabled, backup_path: '(private U18 backup)', stateDir: '(private runtime)' };
  save('hash-before.txt', enabled.sha256_before + '\n'); save('hash-after-enable.txt', enabled.sha256_after_enable + '\n');
  assert.notEqual(enabled.sha256_before, enabled.sha256_after_enable);
  save('wrapper-architecture.json', { bind: '127.0.0.1', port: Number(new URL(enabled.endpoint).port), default_enabled: false,
    upstream_host: '127.0.0.1 (synthetic fixture)', production_upstream_host: 'api.deepseek.com', ingestion: 'A-append-model.usage',
    correlation: 'public ctx.trace traceId/spanId == inbound HTTP traceparent', review: 'unchanged-local-only', raw_body_storage: false });
  report.checks.push('U18_private_backup_before_enable_and_hash_changed');

  // Real fixed-version CLI and plugin registration, with only a local synthetic upstream.
  const isolatedEnv = { ...process.env, OPENCLAW_HOME: path.join(runtime, 'home'), OPENCLAW_STATE_DIR: path.join(runtime, 'state'),
    OPENCLAW_CONFIG_PATH: configFile, OPENCLAW_NO_RESPAWN: '1', DEEPSEEK_API_KEY: 'synthetic-only' };
  const probe = await run([path.join(host, 'dist/index.js'), 'agent', '--local', '--agent', 'main', '--session-id', randomUUID(),
    '--message', 'U20 synthetic local test. Reply OK only. Do not use tools.', '--json', '--timeout', '60'], isolatedEnv);
  // This isolated run has no real credentials, prompts or tool results. Never copy production logs.
  save('logs/host-probe.txt', probe.stdout + '\n' + probe.stderr);
  report.host_probe_exit = probe.code;
  assert.equal(probe.code, 0, 'Isolated OpenClaw probe failed; see local logs/host-probe.txt');
  const store = new TraceStore(path.join(traceData, 'traces'));
  const traces = store.list(); assert.equal(traces.length, 1, 'Exactly one isolated run expected');
  const trace = store.read(traces[0].trace_id), graph = traceGraph(trace);
  const ended = graph.nodes.filter(e => e.event_type === 'model.ended');
  assert.ok(ended.length > 0); assert.ok(ended.every(e => e.payload.token_scope === 'per_call'), 'No exact wrapper association from real host');
  assert.ok(ended.every(e => e.payload.usage.input === 12 && e.payload.usage.output === 8));
  assert.equal(trace.integrity.valid, true);
  assert.ok(upstream.requests.length > 0 && upstream.requests.every(r => !r.headers.traceparent && !r.headers['x-gov-usage-key']));
  report.trace = { trace_id: trace.summary.trace_id, integrity: true, models: ended.map(e => ({ event_id: e.event_id, model_call_id: e.model_call_id,
    usage: e.payload.usage, token_scope: e.payload.token_scope, label: nodePresentation(e).tokens })), upstream_response_source: 'synthetic-fixture' };
  report.checks.push('real_host_public_trace_context_matches_HTTP_without_time_matching', 'upstream_bytes_supply_per_call_usage', 'append_only_chain_valid');
  const render = spawnSync(process.execPath, ['scripts/render_real_call_graph.mjs', traceData, trace.summary.trace_id, path.join(out, 'graph'), '--synthetic-upstream'], { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  save('logs/render.txt', render.stdout + '\n' + render.stderr); report.render_exit = render.status; assert.equal(render.status, 0);
  report.checks.push('shared_view_model_PNG_SVG_per_call_labels');
  const ui = spawnSync(process.execPath, ['scripts/test_usage_wrapper_ui.mjs', traceData, trace.summary.trace_id, path.join(out, 'ui')], { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  save('logs/ui.txt', ui.stdout + '\n' + ui.stderr); report.ui_exit = ui.status; assert.equal(ui.status, 0);
  report.checks.push('browser_graph_timeline_and_original_event_evidence');
  const disabled = await disable({ stateDir }); active = false; report.disabled = disabled;
  assert.equal(disabled.restored, true); assert.equal(disabled.stopped, true);
  save('hash-after-restore.txt', disabled.sha256_after_restore + '\n');
  assert.deepEqual(fs.readFileSync(configFile), fs.readFileSync(JSON.parse(fs.readFileSync(path.join(stateDir, 'state.json'))).backup_path));
  // The same provider URL now directly reaches the original fixture; no wrapper required.
  const restored = JSON.parse(fs.readFileSync(configFile));
  const direct = await fetch(restored.models.providers.deepseek.baseUrl + '/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'fixture-usage' }) });
  assert.equal(direct.status, 200); await direct.text();
  report.checks.push('disable_restores_original_bytes_and_direct_upstream_works');
  report.passed = true;
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally {
  if (active) { try { report.emergency_restore = await disable({ stateDir }); save('hash-after-restore.txt', report.emergency_restore.sha256_after_restore + '\n'); } catch { report.rollback_failed = true; } }
  await upstream?.close();
  report.live_config_sha_before = beforeLive; report.live_config_sha_after = sha(fs.readFileSync(liveConfig));
  report.live_config_unchanged = report.live_config_sha_before === report.live_config_sha_after;
  report.live_approvals_unchanged = approvalHash() === approvalsBefore;
  if (!report.live_config_unchanged || !report.live_approvals_unchanged || report.rollback_failed) { report.passed = false; process.exitCode = 1; }
  save('report.json', report);
  save('design-ref.md', '# Design\n\nRepository: modules/govagentsec-usage-wrapper/README.md\n');
  save('rollback.md', '# Rollback\n\nDefault verification modifies only an isolated config. U18 private backup and dual hashes restore original bytes; live config and approvals are checked unchanged.\n\nProduction enable: `node scripts/usage_wrapper.mjs enable`. Disable: `node scripts/usage_wrapper.mjs disable`, then reload/restart OpenClaw. Never overwrite concurrent config changes.\n');
  console.log(JSON.stringify({ passed: report.passed, output: out, failure: report.failure, source: report.source }));
}
