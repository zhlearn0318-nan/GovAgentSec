import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

export const RUNTIME_VERSION = '1.0.0-alpha.1';

export async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

export async function loadRuntimeConfig(raw = {}, { instanceId = `host-${process.pid}` } = {}) {
  if (!raw.runtimeConfigFile) return raw; // Existing explicit overlays remain supported.
  if (!isAbsolute(raw.runtimeConfigFile)) throw Error('runtimeConfigFile must be absolute');
  const record = JSON.parse(readFileSync(raw.runtimeConfigFile, 'utf8'));
  if (record.protocolVersion !== 1) throw Error('Unsupported GovAgentSec runtime protocol');
  if (record.runtimeVersion !== RUNTIME_VERSION) throw Error('Incompatible GovAgentSec runtime version');
  for (const key of ['runtimeRoot', 'stateDir', 'pythonPath', 'scannerPython', 'modelRoot', 'trustRagModule', 'tokenFile']) {
    if (typeof record[key] !== 'string' || !isAbsolute(record[key])) throw Error(`Runtime ${key} must be absolute`);
  }
  const release = JSON.parse(readFileSync(join(record.runtimeRoot, 'runtime.json'), 'utf8'));
  if (release.protocolVersion !== record.protocolVersion || release.runtimeVersion !== record.runtimeVersion) {
    throw Error('Installed runtime version or protocol mismatch');
  }
  if (record.mode && record.mode !== 'real') throw Error('Installed runtime requires real models');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(instanceId)) throw Error('Invalid runtime instance');
  const instanceDir = join(record.stateDir, 'instances', instanceId);
  const agentGuard = record.agentGuard?.enabled === true ? { ...record.agentGuard,
    stateDir: join(instanceDir, 'agentguard'), baseUrl: `http://127.0.0.1:${await unusedPort()}`,
    opaBaseUrl: `http://127.0.0.1:${await unusedPort()}`,
    projectRoot: join(record.runtimeRoot, 'modules/agentguard-group2'),
  } : { enabled: false };
  return { ...record, mode: 'real', instanceDir, agentGuard,
    baseUrl: `http://127.0.0.1:${await unusedPort()}`,
    projectRoot: join(record.runtimeRoot, 'modules/protect-agent-group1/智能体安全'),
    scanScript: join(record.runtimeRoot, 'integrations/deepseek-harness/scan_skill.py'),
    auditFile: join(instanceDir, 'audit.jsonl'), traceDataDir: join(instanceDir, 'trajectory'),
    startupTimeoutMs: record.startupTimeoutMs ?? 300_000, requestTimeoutMs: record.requestTimeoutMs ?? 60_000,
  };
}

/** OPA and the gateway are owned child handles, never processes found by port.
 * Missing formal identity leaves business tools unavailable, without disabling
 * text/Skill protection. The gateway keeps development identities disabled. */
export function createAgentGuardService(config, { spawnImpl = spawn, fetchImpl = fetch } = {}) {
  const children = [];
  async function launch(executable, args, cwd, env, endpoint) {
    let failure;
    const child = spawnImpl(executable, args, { cwd, env, windowsHide: true, shell: false, stdio: 'ignore' });
    children.push(child);
    child.once('error', error => { failure = error; });
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
      if (failure || child.exitCode !== null) throw Error('AgentGuard component exited during startup');
      try {
        const response = await fetchImpl(endpoint, { redirect: 'error', signal: AbortSignal.timeout(1000) });
        if (response.ok && (await response.json()).ready !== false) return;
      } catch { /* transient startup connection failure */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw Error('AgentGuard component startup timed out');
  }
  return {
    async start() {
      if (!config?.enabled) return;
      for (const key of ['pythonPath', 'opaBinary', 'ticketSecretFile', 'projectRoot', 'stateDir']) {
        if (!config[key] || !isAbsolute(config[key])) throw Error(`AgentGuard ${key} must be absolute`);
      }
      mkdirSync(config.stateDir, { recursive: true });
      const opaAddress = new URL(config.opaBaseUrl).host;
      const env = { ...process.env, PYTHONUTF8: '1', AGENTGUARD_ALLOW_DEVELOPMENT_IDENTITY: 'false',
        AGENTGUARD_MANAGE_OPA_PROCESS: 'false', AGENTGUARD_TICKET_SECRET_HEX: '',
        AGENTGUARD_TICKET_SECRET_FILE: config.ticketSecretFile, AGENTGUARD_READINESS_PROBE_WRITES: 'false' };
      try {
        await launch(config.opaBinary, ['run', '--server', '--addr', opaAddress, join(config.projectRoot, 'policy'), join(config.projectRoot, 'data')],
          config.projectRoot, env, `${config.opaBaseUrl}/health`);
        const args = ['-m', 'service', '--host', '127.0.0.1', '--port', new URL(config.baseUrl).port,
          '--opa-mode', 'rest', '--opa-base-url', config.opaBaseUrl, '--state-dir', join(config.stateDir, 'state')];
        if (config.serviceConfigFile) args.push('--config-file', config.serviceConfigFile);
        await launch(config.pythonPath, args, config.projectRoot, env, `${config.baseUrl}/readyz`);
      } catch (error) { await this.stop(); throw error; }
    },
    async stop() {
      await Promise.all(children.splice(0).map(async child => {
        if (child.exitCode === null) {
          const exited = new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 3000).unref(); });
          child.kill();
          await exited;
        }
      }));
    },
  };
}

/** Locks never cause us to adopt or kill a PID from disk. Only the child handle
 * held by the service can be stopped. Stale locks require explicit repair. */
export function createInstanceService(config, service) {
  if (!config.instanceDir) return service;
  const ownerFile = join(config.instanceDir, 'owner.json');
  const owner = randomUUID();
  let owns = false;
  return {
    async start(context) {
      mkdirSync(config.instanceDir, { recursive: true });
      try {
        writeFileSync(ownerFile, JSON.stringify({ owner, pid: process.pid, runtimeVersion: config.runtimeVersion,
          baseUrl: config.baseUrl, started: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if (error.code === 'EEXIST') throw Error('GovAgentSec instance is locked; close the other host or repair the stale instance');
        throw error;
      }
      owns = true;
      try { await service.start(context); } catch (error) { await this.stop(); throw error; }
    },
    async stop() {
      if (!owns) return;
      try { await service.stop(); }
      finally {
        try { if (JSON.parse(readFileSync(ownerFile, 'utf8')).owner === owner) unlinkSync(ownerFile); }
        finally { owns = false; }
      }
    },
  };
}

export async function verifyRuntimeReady(config, { readiness, screen }) {
  const status = await readiness();
  if (status.version !== '1') throw Error('GovAgentSec service protocol mismatch');
  if (!status.ready || status.mode !== 'real' || config.mode !== 'real') throw Error('GovAgentSec real models unavailable');
  const probe = await screen({ kind: 'input', text: 'Summarize the public service status.' });
  if (probe.version !== '1' || probe.decision !== 'ALLOW' || !probe.detectorsAvailable) throw Error('GovAgentSec real model probe failed');
}
