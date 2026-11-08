import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { backup, restore, sha, version, configPath } from '../../scripts/lib/config-recovery.mjs';

export const defaultStateDir = () => path.join(process.env.USERPROFILE, '.openclaw/usage-wrapper');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const save = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function stop(state) {
  const response = await fetch(state.endpoint + '/shutdown', { method: 'POST', headers: {
    'x-gov-usage-key': fs.readFileSync(state.credentialFile, 'utf8').trim() }, redirect: 'error', signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw Error('WRAPPER_STOP_FAILED');
}

export async function enable({ configFile = configPath(), stateDir = defaultStateDir(), port = 18792 } = {}) {
  version();
  const stateFile = path.join(stateDir, 'state.json');
  if (fs.existsSync(stateFile) && read(stateFile).enabled) throw Error('WRAPPER_ALREADY_ENABLED');
  const raw = fs.readFileSync(configFile), config = JSON.parse(raw), providers = ['deepseek', 'gov-session'].filter(k => config.models?.providers?.[k]);
  if (!providers.length || !config.plugins?.entries?.['govagentsec-trace']?.enabled) throw Error('TRACE_AND_SESSION_PROVIDERS_REQUIRED');
  const upstreams = {};
  for (const name of providers) {
    const p = config.models.providers[name], url = new URL(p.baseUrl);
    if (p.api !== 'openai-completions' || url.username || url.password || url.search || url.hash
      || !(url.protocol === 'https:' || url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw Error('UNSUPPORTED_PROVIDER');
    upstreams[name] = p.baseUrl;
  }
  const before = backup(configFile);
  fs.mkdirSync(stateDir, { recursive: true });
  const runDir = path.join(stateDir, randomUUID()); fs.mkdirSync(runDir);
  const credentialFile = path.join(runDir, 'control.key'), readyFile = path.join(runDir, 'ready.json');
  fs.writeFileSync(credentialFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  const serviceFile = path.join(runDir, 'service.json'); save(serviceFile, { port, upstreams, credentialFile, readyFile });
  const state = { enabled: false, configFile: path.resolve(configFile), credentialFile, readyFile,
    backup_path: before.backup_path, sha256_before: before.sha256, sha256_after_enable: null };
  let child, spawnedError = false;
  try {
    child = spawn(process.execPath, [fileURLToPath(new URL('./service.mjs', import.meta.url)), serviceFile], { detached: true, windowsHide: true, stdio: 'ignore' });
    child.on('error', () => { spawnedError = true; }); child.unref();
    for (let attempt = 0; !fs.existsSync(readyFile) && attempt < 80 && !spawnedError && child.exitCode == null; attempt++) await pause(100);
    if (!fs.existsSync(readyFile)) throw Error('WRAPPER_START_FAILED');
    const ready = read(readyFile); state.endpoint = 'http://127.0.0.1:' + ready.port; state.pid = ready.pid;
    const health = await fetch(state.endpoint + '/health', { signal: AbortSignal.timeout(1500), redirect: 'error' });
    if (!health.ok || (await health.json()).service !== 'govagentsec-usage-wrapper') throw Error('WRAPPER_HEALTH_FAILED');
    for (const name of providers) config.models.providers[name].baseUrl = state.endpoint + '/' + name;
    config.plugins.entries['govagentsec-trace'].config.usageWrapper = { enabled: true, endpoint: state.endpoint, credentialFile, providers };
    if (sha(fs.readFileSync(configFile)) !== before.sha256) throw Error('TARGET_CHANGED');
    const modified = JSON.stringify(config, null, 2) + '\n';
    const temp = configFile + '.usage-wrapper-' + randomUUID() + '.tmp';
    fs.writeFileSync(temp, modified, { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, configFile);
    state.sha256_after_enable = sha(fs.readFileSync(configFile)); state.enabled = true; save(stateFile, state);
    return { enabled: true, endpoint: state.endpoint, providers, sha256_before: before.sha256, sha256_after_enable: state.sha256_after_enable,
      backup_path: before.backup_path, stateDir, reload_required: true };
  } catch (error) {
    if (state.sha256_after_enable) restore(state.backup_path, state.configFile, state.sha256_before, state.sha256_after_enable);
    if (state.endpoint) await stop(state).catch(() => {}); else child?.kill();
    throw error;
  }
}

export async function disable({ stateDir = defaultStateDir() } = {}) {
  version(); const file = path.join(stateDir, 'state.json'), state = read(file);
  if (!state.enabled) return { enabled: false, already_disabled: true, sha256_after_restore: sha(fs.readFileSync(state.configFile)) };
  // Reject concurrent edits before stopping the service: current routing must remain usable.
  restore(state.backup_path, state.configFile, state.sha256_before, state.sha256_after_enable);
  let stopped = true;
  try { await stop(state); } catch { stopped = false; }
  state.enabled = false; state.sha256_after_restore = sha(fs.readFileSync(state.configFile)); state.stopped = stopped; save(file, state);
  return { enabled: false, stopped, sha256_before: state.sha256_before, sha256_after_restore: state.sha256_after_restore,
    restored: state.sha256_after_restore === state.sha256_before, reload_required: true };
}
