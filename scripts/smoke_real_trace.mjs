import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { TraceStore } from '../modules/govagentsec-trace/store.mjs';
import { digest } from '../modules/govagentsec-trace/privacy.mjs';
import { configurationChecks, validateLiveTrace, isLocalUrl, VERSION, DOCUMENT_ID, TOOL } from './lib/trace_live_check.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const folder = path.join(repo, 'local-validation/trace-live-smoke', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8));
mkdirSync(folder, { recursive: true });
const report = { schema_version: 1, source: 'real-openclaw', synthetic: false, status: 'running', passed: false,
  started_at: new Date().toISOString(), openclaw_version: null, agent_run_submitted: false, trace_id: null,
  preflight: [], validation: null, blockers: [],
  optional_d004: { status: 'not_run', reason: 'Live service exposes no per-request underlying read_count; no denial claim without that evidence.' } };
let browser, page, runId, sessionKey, stage = 'arguments', store, baselineFailures = 0, settled = false, exitCode = 1;
const check = (code, passed) => report.preflight.push({ code, passed: Boolean(passed) });
const readJSON = f => JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rpc = (method, params = {}) => page.locator('openclaw-app-shell').evaluate(
  (e, { method, params }) => e.context.gateway.snapshot.client.request(method, params), { method, params });
function persist() {
  report.finished_at = new Date().toISOString(); report.exit_code = exitCode;
  writeFileSync(path.join(folder, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const identityNote = report.identity?.label
    ?? '身份路径未记录';
  writeFileSync(path.join(folder, 'README.md'), `# Real OpenClaw trace smoke\n\nStatus: **${report.status}**. Exit code: ${exitCode}.\n\n`
    + `Source: real-openclaw; Agent run submitted: ${report.agent_run_submitted}; trace_id: ${report.trace_id ?? 'none'}.\n\n`
    + `Identity: **${identityNote}**. `
    + (report.identity?.production_oidc === false
      ? '本报告使用本机演示身份（loopback_static_dev），不是生产 OIDC；答辩/验收须明确说明。\n\n'
      : '本报告声称走生产 OIDC 身份路径。\n\n')
    + `See report.json for individual checks. This report contains no prompts, response bodies or credentials. `
    + `No synthetic JSONL is used by this runner. A blocked preflight is not an end-to-end pass.\n\n`
    + `Reproduce from the repository with scripts/smoke_real_trace.ps1; prerequisites and remediation: docs/TRACE_LIVE_SMOKE.md.\n`);
}
try {
  const options = { agent: 'main', timeout: '180', config: path.join(process.env.USERPROFILE, '.openclaw/openclaw.json') };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!Object.hasOwn(options, key) || !args[i + 1]) throw new Error('INVALID_ARGUMENTS');
    options[key] = args[i + 1];
  }
  if (!/^[a-z0-9_-]+$/.test(options.agent) || !Number.isInteger(Number(options.timeout)) || Number(options.timeout) < 30 || Number(options.timeout) > 600) throw new Error('INVALID_ARGUMENTS');
  const timeoutMs = Number(options.timeout) * 1000;
  report.agent_id = options.agent; report.timeout_seconds = Number(options.timeout);
  stage = 'configuration';
  const config = readJSON(options.config), configFingerprint = digest(config);
  const host = path.join(process.env.APPDATA, 'npm/node_modules/openclaw');
  report.openclaw_version = readJSON(path.join(host, 'package.json')).version;
  check('FIXED_HOST_VERSION', report.openclaw_version === VERSION);
  const pre = configurationChecks(config, options.agent, process.env, { existsSync, readFileSync });
  report.preflight.push(...pre.checks);
  report.identity = pre.identity;
  const demoIdentity = pre.identity?.demo_loopback_static_dev === true;
  const tokenFile = pre.bridgeEnv.AGENTGUARD_MCP_TOKEN_FILE;
  const subjectFile = pre.bridgeEnv.AGENTGUARD_MCP_DEV_SUBJECT_FILE;
  if (demoIdentity) {
    // Demo path: operator-configured loopback subject file; no OIDC bearer.
    check('OIDC_CREDENTIAL_READABLE', false);
    check('DEMO_IDENTITY_READABLE', Boolean(subjectFile && existsSync(subjectFile) && readFileSync(subjectFile, 'utf8').trim()));
  } else {
    check('OIDC_CREDENTIAL_READABLE', Boolean(tokenFile ? existsSync(tokenFile) && readFileSync(tokenFile, 'utf8').trim() : pre.bridgeEnv.AGENTGUARD_MCP_BEARER_TOKEN));
    check('DEMO_IDENTITY_READABLE', false);
  }
  report.model = pre.primary ?? null;
  const base = pre.bridgeEnv.AGENTGUARD_MCP_BASE_URL ?? 'http://127.0.0.1:8080';
  stage = 'agentguard_readyz';
  if (isLocalUrl(base)) {
    try {
      const response = await fetch(base.replace(/\/$/, '') + '/readyz', { signal: AbortSignal.timeout(5000), redirect: 'error' });
      const ready = await response.json();
      check('AGENTGUARD_READYZ', response.ok && ready.ready === true);
      if (demoIdentity) {
        // Demo identity is accepted only when AgentGuard is ready and OIDC is explicitly not required.
        // This is NOT production verified identity.
        check('AGENTGUARD_VERIFIED_IDENTITY', false);
        check('DEMO_IDENTITY_ACCEPTED', response.ok && ready.ready === true
          && ready.dependencies?.identity?.required === false
          && ready.dependencies?.identity?.healthy === true);
      } else {
        check('AGENTGUARD_VERIFIED_IDENTITY', ready.dependencies?.identity?.required === true && ready.dependencies.identity.healthy === true);
        check('DEMO_IDENTITY_ACCEPTED', false);
      }
      report.agentguard = {
        ready: ready.ready === true,
        oidc_required: ready.dependencies?.identity?.required === true,
        identity_detail: ready.dependencies?.identity?.detail ?? null,
        demo_identity: demoIdentity,
      };
    } catch { check('AGENTGUARD_READYZ', false); }
  }
  // Connect through the same authenticated Control UI client as a user; no fabricated hook dispatch.
  stage = 'openclaw_connect';
  try {
    const { chromium } = await import(pathToFileURL(path.join(host, 'node_modules/playwright-core/index.mjs')));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    page = await browser.newPage();
    await page.route('**/*', route => isLocalUrl(route.request().url()) ? route.continue() : route.abort());
    const port = config.gateway?.port ?? 18789;
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_PORT');
    // The host uses getRuntimeConfig(), not config.get's disk snapshot. Require a restart
    // after edits so stale external provider/fallback settings cannot process this request.
    const processProbe = spawnSync('powershell.exe', ['-NoProfile', '-Command',
      "$ErrorActionPreference='Stop'; $owners=@(& netstat.exe -ano -p TCP | ForEach-Object { $p=$_.Trim() -split '\\s+'; if ($p.Length -eq 5 -and $p[1] -match (':'+$env:TRACE_SMOKE_GATEWAY_PORT+'$') -and $p[3] -eq 'LISTENING') { $p[4] } }); $starts=@($owners | Sort-Object -Unique | ForEach-Object { [DateTimeOffset](Get-Process -Id ([int]$_)).StartTime } | ForEach-Object { $_.ToUnixTimeMilliseconds() }); ConvertTo-Json -Compress -InputObject $starts"],
    { encoding: 'utf8', timeout: 10000, windowsHide: true, env: { ...process.env, TRACE_SMOKE_GATEWAY_PORT: String(port) } });
    let processStarts = [];
    try { processStarts = JSON.parse(processProbe.stdout); } catch { /* Failed check is reported below. */ }
    report.gateway_process_probe = { available: processProbe.status === 0 && Array.isArray(processStarts) && processStarts.length > 0 };
    check('GATEWAY_RESTARTED_AFTER_CONFIG', Array.isArray(processStarts) && processStarts.length > 0
      && processStarts.every(t => Number.isFinite(t) && t >= statSync(options.config).mtimeMs));
    await page.goto(`http://127.0.0.1:${port}/#token=${encodeURIComponent(config.gateway?.auth?.token ?? '')}`, { timeout: 15000 });
    await page.waitForFunction(() => Boolean(document.querySelector('openclaw-app-shell')?.context?.gateway?.snapshot?.client), null, { timeout: 15000 });
    const health = await rpc('govagentsec.trace.health');
    check('TRACE_LIVE_HEALTH', health.available === true && health.version === VERSION && ['hash', 'summary'].includes(health.content_mode));
    baselineFailures = (health.failures?.length ?? 0) + (health.capture_failures?.length ?? 0);
    report.gateway_connected = true;
  } catch {
    check('TRACE_LIVE_HEALTH', false); report.gateway_connected = false;
  }
  stage = 'preflight';
  const demoPath = report.identity?.demo_loopback_static_dev === true;
  const ignorableWhenDemo = new Set([
    'OIDC_MODE', 'OIDC_CREDENTIAL_CONFIGURED', 'OIDC_CREDENTIAL_READABLE', 'AGENTGUARD_VERIFIED_IDENTITY',
  ]);
  const ignorableWhenOidc = new Set([
    'DEMO_IDENTITY_MODE', 'DEMO_IDENTITY_CONFIGURED', 'DEMO_IDENTITY_FILE_PRESENT', 'DEMO_IDENTITY_READABLE', 'DEMO_IDENTITY_ACCEPTED',
  ]);
  report.blockers = report.preflight
    .filter(c => !c.passed)
    .filter(c => !(demoPath ? ignorableWhenDemo.has(c.code) : ignorableWhenOidc.has(c.code)))
    .map(c => c.code);
  report.preflight_ignored_for_path = report.preflight
    .filter(c => !c.passed)
    .filter(c => (demoPath ? ignorableWhenDemo.has(c.code) : ignorableWhenOidc.has(c.code)))
    .map(c => c.code);
  if (report.blockers.length) { report.status = 'blocked'; throw new Error('PREFLIGHT_FAILED'); }
  stage = 'submit';
  // A fresh session prevents inherited model overrides and old conversational data from entering the run.
  // Configuration must already select local-only primary/fallback models. This script never changes it.
  if (digest(readJSON(options.config)) !== configFingerprint) throw new Error('CONFIG_CHANGED');
  store = new TraceStore(path.join(pre.traceConfig.dataDir, 'traces'));
  runId = randomUUID(); sessionKey = `agent:${options.agent}:trace-live-smoke-${randomUUID()}`;
  report.trace_id = runId; report.session_key = sessionKey;
  const startedAt = Date.now(); report.run_started_at = new Date(startedAt).toISOString();
  const message = `请只调用一次工具 ${TOOL}，参数必须严格等于 {"document_id":"${DOCUMENT_ID}"}。这是合成公开文档的本地冒烟验证。禁止调用 sessions_yield、session_*、exec、read、write 或任何其他工具；不要读取文件、历史或网页。工具成功后，只用纯文本回复四个字：已完成。不要解释，不要重试，不要再调用工具。`;
  report.agent_run_submitted = true;
  const ack = await rpc('chat.send', { sessionKey, agentId: options.agent, message, thinking: 'off', deliver: false, idempotencyKey: runId, timeoutMs });
  if (ack.runId !== runId) throw new Error('RUN_ID_MISMATCH');
  report.gateway_acknowledged = true;
  stage = 'capture';
  const deadline = Date.now() + timeoutMs;
  let detail, stableHash, stableAt = 0;
  while (Date.now() < deadline) {
    if (existsSync(store.file(runId))) {
      detail = store.read(runId);
      const terminal = detail.events.some(e => e.event_type === 'run.ended');
      const hash = detail.integrity.tail_hash;
      if (hash !== stableHash) { stableHash = hash; stableAt = Date.now(); }
      // agent_end precedes llm_output; allow its asynchronous observer to finish before verification.
      if (terminal && detail.events.some(e => e.event_type === 'model.output') && Date.now() - stableAt >= 2500) { settled = true; break; }
      if (terminal && Date.now() - stableAt >= 10000) { settled = true; break; }
    }
    await sleep(500);
  }
  if (!settled) throw new Error('CAPTURE_TIMEOUT');
  stage = 'verify';
  const requestId = detail.events.find(e => e.event_type === 'tool.ended' && e.payload.tool === TOOL)?.request_id;
  let requestRecord;
  if (/^mcp-req-[a-f0-9]{32}$/.test(requestId ?? '')) {
    const file = path.join(pre.bridgeEnv.AGENTGUARD_MCP_STATUS_STORE_FILE + '.requests', requestId + '.json');
    if (existsSync(file)) requestRecord = readJSON(file);
  }
  report.validation = validateLiveTrace(detail, { traceId: runId, sessionKey, startedAt, requestRecord, primary: pre.primary });
  const health = await rpc('govagentsec.trace.health');
  report.validation.checks.push({ code: 'NO_NEW_CAPTURE_FAILURES', passed: (health.failures?.length ?? 0) + (health.capture_failures?.length ?? 0) === baselineFailures });
  report.validation.checks.push({ code: 'CONFIG_UNCHANGED', passed: digest(readJSON(options.config)) === configFingerprint });
  // Verify through the delivered CLI as well as the in-process checker, against original JSONL and anchor.
  const cli = spawnSync(process.execPath, [path.join(repo, 'modules/govagentsec-trace/cli.mjs'), 'verify', pre.traceConfig.dataDir, runId], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  let integrity;
  try { integrity = JSON.parse(cli.stdout); } catch { /* Explicit failed CLI check below. */ }
  report.cli_verify = { exit_code: cli.status, valid: integrity?.valid === true };
  report.validation.checks.push({ code: 'CLI_VERIFY', passed: cli.status === 0 && integrity?.valid === true });
  report.validation.passed = report.validation.checks.every(c => c.passed);
  // Preserve existing hashed evidence only; no new events, annotations or reconstructed JSONL.
  if (report.validation.checks.find(c => c.code === 'CONTENT_HASHED').passed) {
    const evidenceDir = path.join(folder, 'evidence/traces'); mkdirSync(evidenceDir, { recursive: true });
    for (const suffix of ['', '.head.json']) copyFileSync(store.file(runId) + suffix, path.join(evidenceDir, path.basename(store.file(runId)) + suffix));
    report.evidence = 'evidence/traces/' + path.basename(store.file(runId));
  }
  report.passed = report.validation.passed;
  report.status = report.passed ? 'passed' : 'failed'; exitCode = report.passed ? 0 : 1;
  report.blockers = report.validation.checks.filter(c => !c.passed).map(c => c.code);
} catch (error) {
  if (report.status !== 'blocked') report.status = 'failed';
  report.failure = { stage, code: /^[A-Z_]+$/.test(error.message ?? '') ? error.message : 'STAGE_FAILED', error_type: error.name };
  if (store && runId && existsSync(store.file(runId))) {
    try {
      const partial = store.read(runId);
      report.partial_capture = { event_count: partial.events.length, event_types: [...new Set(partial.events.map(e => e.event_type))], integrity: partial.integrity };
    } catch { report.partial_capture = { readable: false }; }
  }
} finally {
  if (runId && !settled && page) {
    try { await rpc('chat.abort', { sessionKey, runId }); report.abort_requested = true; }
    catch { report.abort_requested = false; report.blockers.push('ABORT_NOT_CONFIRMED'); }
  }
  try { await browser?.close(); } catch { report.browser_cleanup_failed = true; }
  persist();
  console.log(JSON.stringify({ status: report.status, passed: report.passed, exit_code: exitCode, report: path.join(folder, 'report.json'), blockers: report.blockers }));
  process.exitCode = exitCode;
}
