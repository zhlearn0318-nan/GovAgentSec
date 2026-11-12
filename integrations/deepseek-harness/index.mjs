import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  createScreeningClient, createSidecarService, deriveConversationId, parsePluginConfig,
} from '../../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/client.mjs';
import { createGuardEventStore } from '../../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/guard-events.mjs';
import { createReadinessProbe, installHarnessUi } from './ui.mjs';
import { createRuntimeStatus, installHarnessWorkspace, readActivity } from './workspace.mjs';
import { toolPayloads, toolDocumentBatch, quotedTaskIntent } from './payloads.mjs';
import { createSkillAdmission, skillBodyHash, skillScreenTexts } from './skills.mjs';
import { automaticSkillRoots } from './skill-roots.mjs';
import { installHarnessTrajectory } from './trajectory.mjs';
import { createAgentGuardService, createInstanceService, loadRuntimeConfig, verifyRuntimeReady } from './runtime.mjs';

export const name = 'govagentsec';
export const inject = ['tools', 'llm'];
const BLOCK = 'GovAgentSec：安全检查未通过或防护服务不可用，请查看本地审计记录。';
const MAX_TEXT = 256_000;
// These sources are created by the host's runtime projection and clock plugin,
// not by user text. Workspace instructions, Skill content and unknown plugin
// sources remain untrusted and must still pass screening.
const HOST_CONTEXT = new Set(['runtime-context', 'time-context']);
// Exact fixed framing from dsh-tool-skill 0.2.2-alpha.2. Never remove catalog
// entries or unknown lines: descriptions originate in third-party SKILL files.
const CATALOG_FRAMING = new Set([
  '<system-reminder>', '</system-reminder>', '<available_skills>', '</available_skills>',
  'No skills could be confirmed in this discovery attempt.',
  'A skill is a reusable set of task-specific instructions. The following skills are available in this session:',
  'Wait for an updated catalog before calling the `skill` tool. Do not infer skill instructions from an empty catalog.',
  "If the user names a skill, or the task clearly matches a skill's description, call the `skill` tool with the exact skill name before taking task actions. Load all applicable skills, then follow their full instructions. This catalog contains summaries only; do not infer or follow a skill's instructions until it has been loaded.",
  'A user may also invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool again for that skill.',
  'No skills could be confirmed in this discovery attempt. Do not use names from earlier skill catalogs.',
  'No skills are currently available through the `skill` tool. Do not use names from earlier skill catalogs.',
  'A user may still invoke a skill directly; its <skill_content> block then appears in this conversation. Follow it, and do not call the `skill` tool for it.',
  'Use only names in this replacement catalog. If the user names a listed skill, or the task clearly matches its description, call the `skill` tool with the exact name before acting.',
  'Skill discovery is incomplete. This catalog of currently available skills replaces every earlier available-skills list in this session:',
  'The available skill catalog changed. This complete catalog replaces every earlier available-skills list in this session:',
  'Some skills could not be checked. Only confirmed skills are listed; a lower-priority definition of the same name may be selected when a preferred source is unavailable. Discovery will be retried on the next request.',
]);
const runFile = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));

// Do not silently truncate before a security decision. Large texts are checked
// in overlapping windows; oversized requests are rejected rather than bypassed.
function checkedText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) throw Error(BLOCK);
  return content.map(block => {
    if (!['text', 'reasoning'].includes(block.type) || typeof block.text !== 'string') throw Error(BLOCK);
    return block.text;
  }).join('\n');
}
function serialized(value) {
  const text = JSON.stringify(value);
  if (typeof text !== 'string' || text.length > MAX_TEXT) throw Error(BLOCK);
  return text;
}

function mergeRisk(target, result) {
  const levels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  if (levels.indexOf(result.riskLevel) > levels.indexOf(target.riskLevel)) target.riskLevel = result.riskLevel;
  if (Number.isFinite(result.riskScore)) target.riskScore = Math.max(target.riskScore ?? 0, result.riskScore);
  return target;
}

export function installGuards(ctx, { client, audit, highImpactTools = [], guardEvents = createGuardEventStore(),
  admitSkill = async () => { throw Error('Skill admission unavailable'); } }) {
  const states = new Map();
  const pendingReviews = new Map();
  const skillPlans = new Map();
  const skillKey = exec => `${keyFor(exec.agent?.session.id)}:${exec.callId ?? exec.name}`;
  const sensitive = new Set(highImpactTools);
  const identity = id => deriveConversationId(id);
  const keyFor = id => typeof id === 'string' && id ? id : 'unscoped';
  function ensureRun(id) {
    const key = keyFor(id);
    if (!guardEvents.has(key)) guardEvents.beginRun(key);
    return key;
  }
  function reviewsFor(id) {
    const key = keyFor(id);
    if (!pendingReviews.has(key)) pendingReviews.set(key, new Set());
    while (pendingReviews.size > 1024) pendingReviews.delete(pendingReviews.keys().next().value);
    return pendingReviews.get(key);
  }
  const stateFor = id => states.get(id) ?? { originalTask: 'Review this response for safety.', retrievedContext: [] };
  function acceptScreen(kind, result, id, sourceKind) {
    if (!result.detectorsAvailable || !['ALLOW', 'REVIEW', 'BLOCK'].includes(result.decision)) throw Error(BLOCK);
    audit({ phase: kind, session: identity(id), decision: result.decision, riskLevel: result.riskLevel,
      ...(sourceKind ? { sourceKind } : {}) });
    return result;
  }
  async function screen(kind, text, id, extra = {}, signal, sourceKind) {
    if (typeof text !== 'string' || text.length > MAX_TEXT) throw Error(BLOCK);
    if (extra.outputContext) {
      extra = { ...extra, outputContext: { ...extra.outputContext, retrievedContext: [...extra.outputContext.retrievedContext] } };
      // Historical provenance is bounded support, never permission to execute.
      // Drop oldest support if needed so the task and current output still fit.
      while (Buffer.byteLength(JSON.stringify(extra)) > 48_000 && extra.outputContext.retrievedContext.length) extra.outputContext.retrievedContext.shift();
    }
    const aggregate = { decision: 'ALLOW' };
    for (let offset = 0; offset < text.length;) {
      let length = Math.min(12_000, text.length - offset);
      let request = { kind, text: text.slice(offset, offset + length), conversationId: identity(id), ...extra };
      while (Buffer.byteLength(JSON.stringify({ version: '1', ...request })) > 64 * 1024) {
        if (length <= 512) throw Error(BLOCK);
        length = Math.floor(length / 2);
        request = { ...request, text: text.slice(offset, offset + length) };
      }
      const part = request.text;
      offset += offset + length >= text.length ? length : Math.max(1, length - 512);
      if (!part.trim()) continue;
      const result = acceptScreen(kind, await client.screen(request, { signal }), id, sourceKind);
      mergeRisk(aggregate, result);
      if (result.decision === 'BLOCK') return { ...aggregate, decision: 'BLOCK' };
      if (result.decision === 'REVIEW') aggregate.decision = 'REVIEW';
    }
    return aggregate;
  }
  async function screenToolPayloads(texts, id, extra, signal, documentBatch) {
    if (!documentBatch) {
      const aggregate = { decision: 'ALLOW' };
      for (const text of texts) {
        const result = await screen('tool_result', text, id, extra, signal);
        mergeRisk(aggregate, result);
        if (result.decision !== 'ALLOW') return { ...aggregate, decision: result.decision };
      }
      return aggregate;
    }
    // Keep real document boundaries through the RAG stage. Do not send
    // unrelated subsets as though they were the complete retrieval batch.
    const request = { kind: 'tool_result', chunks: texts.map((text, index) => ({ id: `tool-chunk-${index}`, text })),
      conversationId: identity(id), ...extra };
    if (texts.reduce((sum, text) => sum + text.length, 0) > 16_000
        || Buffer.byteLength(JSON.stringify({ version: '1', ...request })) > 64 * 1024) throw Error(BLOCK);
    return acceptScreen('tool_result', await client.screen(request, { signal }), id);
  }
  function failed(phase, id) {
    audit({ phase, session: identity(id), decision: 'BLOCK', reason: 'unavailable_or_invalid', enforced: true });
    guardEvents.completePhase(ensureRun(id), phase.startsWith('tool_') ? 'tools' : phase, { status: 'error', decision: 'BLOCK' });
  }
  ctx.on('agent/pre-step', async (payload, next) => {
    const id = payload.agent.session.id;
    guardEvents.beginRun(keyFor(id));
    pendingReviews.delete(keyFor(id));
    const downstream = await next();
    if (downstream.kind === 'reject') {
      guardEvents.completePhase(keyFor(id), 'policy', { status: 'blocked', decision: 'BLOCK' });
      return downstream;
    }
    const aggregate = { decision: 'ALLOW' };
    try {
      for (const message of downstream.messages) {
        let text = checkedText(message.content);
        if (text.length > MAX_TEXT) throw Error(BLOCK);
        if (HOST_CONTEXT.has(message.source?.kind)) continue;
        if (message.source?.kind === 'skill-invocation') {
          const admission = await admitSkill(message.source.name, { agent: payload.agent, signal: payload.signal });
          const body = /<skill_instructions>\r?\n([\s\S]*)\r?\n<\/skill_instructions>/.exec(text)?.[1];
          audit({ phase: 'skill_admission', session: identity(id), decision: admission.decision });
          if (admission.decision !== 'ALLOW' || !body || skillBodyHash(body) !== admission.bodySha256) throw Error(BLOCK);
          if (text === admission.renderedText) text = admission.content;
        }
        if (message.source?.kind === 'skill-catalog' && message.source.form === 'catalog') {
          text = text.split('\n').filter(line => !CATALOG_FRAMING.has(line)).join('\n');
        }
        const sourceKind = String(message.source?.kind ?? 'unknown').slice(0, 128);
        const result = await screen('input', text, id, {}, payload.signal, sourceKind);
        mergeRisk(aggregate, result);
        if (result.decision !== 'ALLOW') {
          guardEvents.completeInput(keyFor(id), { ...aggregate, decision: result.decision });
          throw Error(BLOCK);
        }
        if (message.source?.kind === 'user') {
          // Bound context independently of the full text checked above.
          states.set(id, { originalTask: text.slice(-12_000), retrievedContext: [] });
          while (states.size > 1024) states.delete(states.keys().next().value);
        }
      }
      guardEvents.completeInput(keyFor(id), aggregate);
      return downstream;
    } catch {
      failed('input', id);
      // A bare `reject` consumes the prompt and closes the turn without any
      // visible message. A sanitized error uses Harness's native error surface
      // while still preventing the model request.
      throw Error(BLOCK);
    }
  });
  ctx.on('tools/pre-execute', async (exec, next) => {
    const id = exec.agent?.session.id;
    const key = ensureRun(id);
    guardEvents.beginPhase(key, 'tools');
    const downstream = await next();
    if (['deny', 'cancel'].includes(downstream.kind)) {
      guardEvents.completePhase(key, 'tools', { status: 'blocked', decision: 'BLOCK' });
      return downstream;
    }
    try {
      const result = await screen('tool_call', serialized({ tool: exec.name, arguments: exec.arguments }), id, { toolName: exec.name }, exec.signal);
      let admission;
      if (exec.name === 'skill') {
        admission = await admitSkill(exec.arguments?.name, { agent: exec.agent, signal: exec.signal });
        audit({ phase: 'skill_admission', session: identity(id), decision: admission.decision });
        if (!['ALLOW', 'REVIEW'].includes(admission.decision)) {
          audit({ phase: 'tool_gate', session: identity(id), decision: 'BLOCK', enforced: true });
          guardEvents.completePhase(key, 'tools', { status: 'blocked', decision: 'BLOCK' });
          return { kind: 'deny', reason: BLOCK };
        }
        skillPlans.set(skillKey(exec), admission);
        while (skillPlans.size > 1024) skillPlans.delete(skillPlans.keys().next().value);
      }
      if (result.decision === 'BLOCK') {
        audit({ phase: 'tool_gate', session: identity(id), decision: 'BLOCK', enforced: true });
        guardEvents.completePhase(key, 'tools', { ...result, status: 'blocked' });
        return { kind: 'deny', reason: BLOCK };
      }
      const review = result.decision === 'REVIEW' || admission?.decision === 'REVIEW' || sensitive.has(exec.name) || downstream.kind === 'ask';
      const reviews = reviewsFor(id);
      if (review && reviews.size < 256) reviews.add(exec.callId ?? exec.name);
      guardEvents.completePhase(key, 'tools', { ...result, status: reviews.size ? 'review' : 'monitoring' });
      if (review) audit({ phase: 'approval', session: identity(id), decision: 'REVIEW', enforced: false });
      if (result.decision === 'REVIEW' || admission?.decision === 'REVIEW' || sensitive.has(exec.name)) return { kind: 'ask', reason: `GovAgentSec review: ${exec.name}` };
      return downstream;
    } catch {
      failed('tool_call', id);
      return { kind: 'deny', reason: BLOCK };
    }
  });
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const id = exec.agent?.session.id;
    const key = ensureRun(id);
    const wasAwaitingApproval = reviewsFor(id).delete(exec.callId ?? exec.name);
    const skillPlan = skillPlans.get(skillKey(exec));
    skillPlans.delete(skillKey(exec));
    guardEvents.beginPhase(key, 'tools');
    // Harness also publishes a post-execute result for a refused approval.
    // Screening that safe refusal must not erase the denied operation in UI.
    if (wasAwaitingApproval && result.isError) {
      guardEvents.completePhase(key, 'tools', { status: 'blocked', decision: 'BLOCK' });
    }
    const downstream = await next();
    if (downstream.kind === 'block') {
      guardEvents.completePhase(key, 'tools', { status: 'blocked', decision: 'BLOCK' });
      return downstream;
    }
    try {
      let loadedSkill;
      if (exec.name === 'skill' && !result.isError) {
        const admission = await admitSkill(exec.arguments?.name, { agent: exec.agent, signal: exec.signal });
        loadedSkill = admission;
        const value = Object.hasOwn(downstream, 'value') ? downstream.value : result.value;
        if (!skillPlan || admission.treeSha256 !== skillPlan.treeSha256 || admission.decision === 'BLOCK'
            || (admission.decision === 'REVIEW' && !wasAwaitingApproval)
            || typeof value?.content !== 'string' || skillBodyHash(value.content) !== admission.bodySha256) throw Error(BLOCK);
      }
      const texts = toolPayloads(downstream, result);
      const state = stateFor(id);
      let screened = { decision: 'ALLOW' };
      if (exec.name === 'skill') {
        for (const text of skillScreenTexts(texts, loadedSkill)) {
          const checked = await screen('input', text, id, {}, exec.signal, 'skill-content');
          mergeRisk(screened, checked);
          if (checked.decision !== 'ALLOW') { screened.decision = checked.decision; break; }
        }
      } else screened = await screenToolPayloads(texts, id, { toolName: exec.name, query: state.originalTask }, exec.signal, toolDocumentBatch(downstream, result, texts));
      if (screened.decision !== 'ALLOW') {
        audit({ phase: 'tool_gate', session: identity(id), decision: 'BLOCK', enforced: true });
        guardEvents.completePhase(key, 'tools', { ...screened, status: 'blocked' });
        return { kind: 'block', feedback: [{ type: 'text', text: BLOCK }] };
      }
      guardEvents.completePhase(key, 'tools', { ...screened, status: reviewsFor(id).size ? 'review' : 'monitoring' });
      state.retrievedContext.push(...texts.map(text => ({ source: 'tool', role: 'tool', text: text.slice(-4096), hasExternalPayload: true, isQuoted: false })));
      state.retrievedContext = state.retrievedContext.slice(-4);
      if (id) {
        states.set(id, state);
        while (states.size > 1024) states.delete(states.keys().next().value);
      }
      return downstream;
    } catch {
      failed('tool_result', id);
      return { kind: 'block', feedback: [{ type: 'text', text: BLOCK }] };
    }
  });
  // Buffer before publishing any content, including reasoning and tool deltas.
  // Checking after streaming would already have exposed the rejected response.
  ctx.on('llm/stream', async function* (options, next) {
    const chunks = [];
    let size = 0;
    const texts = new Map();
    try {
      for await (const chunk of next()) {
        size += JSON.stringify(chunk).length;
        if (size > 2_000_000 || chunks.length >= 50_000) throw Error(BLOCK);
        chunks.push(chunk);
        if (['text-delta', 'reasoning-delta'].includes(chunk.type)) {
          texts.set(chunk.index, (texts.get(chunk.index) ?? '') + chunk.text);
        } else if (chunk.type === 'block-end') {
          if (['text', 'reasoning'].includes(chunk.block.type)) texts.set(chunk.index, checkedText([chunk.block]));
          else if (chunk.block.type !== 'tool-call') throw Error(BLOCK);
        }
      }
      // Some auxiliary model requests do not belong to a live Agent. Recover
      // their task from request history rather than sharing another session.
      const state = stateFor(options.sessionId);
      const task = [...(options.messages ?? [])].reverse().find(message => message.role === 'user');
      const originalTask = states.get(options.sessionId)?.originalTask
        ?? (task && (!task.source || task.source.kind === 'user') ? checkedText(task.content).slice(-12_000) : state.originalTask);
      const aggregate = { decision: 'ALLOW' };
      if (texts.size) guardEvents.beginPhase(ensureRun(options.sessionId), 'output');
      for (const text of texts.values()) {
        const result = await screen('output', text, options.sessionId, {
          outputContext: { originalTask, retrievedContext: state.retrievedContext, role: 'agent', isQuoted: quotedTaskIntent(originalTask) },
        }, options.signal);
        mergeRisk(aggregate, result);
        if (result.decision !== 'ALLOW') {
          guardEvents.completePhase(keyFor(options.sessionId), 'output', { ...aggregate, decision: 'BLOCK', status: 'blocked' });
          throw Error(BLOCK);
        }
      }
      if (texts.size) guardEvents.completePhase(keyFor(options.sessionId), 'output', { ...aggregate, status: 'passed' });
    } catch {
      failed('output', options.sessionId);
      throw Error(BLOCK);
    }
    yield* chunks;
  });
  ctx.on('tools/result', (exec, result) => {
    const id = exec.agent?.session.id;
    if (reviewsFor(id).delete(exec.callId ?? exec.name) && result.isError) {
      guardEvents.completePhase(ensureRun(id), 'tools', { status: 'blocked', decision: 'BLOCK' });
    }
  });
  ctx.on('agent/error', ({ agent }) => {
    guardEvents.completePhase(ensureRun(agent.session.id), 'output', { status: 'error', decision: 'BLOCK' });
  });
  return guardEvents;
}

export async function apply(ctx, raw) {
  let configured = false;
  ctx.on('agent/pre-step', (payload, next) => { if (!configured) throw Error(BLOCK); return next(); });
  ctx.on('tools/pre-execute', (exec, next) => configured ? next() : { kind: 'deny', reason: BLOCK });
  ctx.on('llm/stream', async function* (options, next) { if (!configured) throw Error(BLOCK); yield* next(); });
  try {
    await applyConfigured(ctx, await loadRuntimeConfig(raw));
    configured = true;
  } catch {
    ctx.logger?.error?.('GovAgentSec runtime configuration invalid; protection is blocking requests.');
  }
}

async function applyConfigured(ctx, raw) {
  const config = parsePluginConfig(raw);
  const auditFile = raw.auditFile;
  if (typeof auditFile !== 'string' || !isAbsolute(auditFile)) throw Error('GovAgentSec auditFile must be absolute');
  if (typeof raw.scannerPython !== 'string' || !isAbsolute(raw.scannerPython)
      || !Array.isArray(raw.allowedRoots) || !raw.allowedRoots.length
      || raw.allowedRoots.some(root => typeof root !== 'string' || !isAbsolute(root))) {
    throw Error('GovAgentSec scanner requires an absolute Python path and allowed roots');
  }
  mkdirSync(dirname(auditFile), { recursive: true });
  const instance = process.env.GOVAGENTSEC_HARNESS_PORT ?? 'web';
  const traceRoot = raw.traceDataDir ?? join(dirname(auditFile), 'trajectory');
  if (!/^(web|[0-9]{4,5})$/.test(instance) || !isAbsolute(traceRoot)) throw Error('Invalid Harness trajectory configuration');
  const trajectory = installHarnessTrajectory(ctx, { dataDir: join(traceRoot, instance), loaderRoots: raw.autoSkillRoots ? [] : raw.skillLoaderRoots ?? [] });
  function audit(event) {
    appendFileSync(auditFile, JSON.stringify({ time: new Date().toISOString(), ...event }) + '\n', { mode: 0o600 });
    trajectory.protection(event);
  }
  const localFetch = (url, options) => fetch(url, { ...options, redirect: 'error' });
  const client = createScreeningClient(config, { fetchImpl: localFetch });
  const service = createInstanceService(raw, createSidecarService({ ...config, isolatedEnvironment: Boolean(raw.runtimeRoot) }, { fetchImpl: localFetch }));
  const guardEvents = createGuardEventStore();
  async function scanSkill(path, signal, options = {}) {
    const cwd = raw.autoSkillRoots && raw.autoSkillProjectRoots !== false && options.agent && ctx.workingDirectory
      ? await ctx.workingDirectory.ensure(options.agent, signal) : undefined;
    const roots = raw.autoSkillRoots ? automaticSkillRoots(raw.autoSkillDirectories ?? raw.allowedRoots, cwd) : raw.allowedRoots;
    const { stdout } = await runFile(raw.scannerPython, [raw.scanScript ?? join(HERE, 'scan_skill.py'), '--path', path, '--roots-json', JSON.stringify(roots)], {
      cwd: HERE, shell: false, windowsHide: true, timeout: 60_000, signal,
      maxBuffer: 2 * 1024 * 1024, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1',
        ...(raw.runtimeRoot ? { PYTHONHOME: undefined, PYTHONPATH: undefined, PYTHONNOUSERSITE: '1' } : {}) },
    });
    return JSON.parse(stdout);
  }
  const admitSkill = createSkillAdmission({
    async lookup(name, { agent, signal }) {
      if (!ctx.skills) throw Error('Skill registry unavailable');
      const cwd = agent && ctx.workingDirectory ? await ctx.workingDirectory.ensure(agent, signal) : undefined;
      return ctx.skills.get(name, { cwd, signal, scope: agent });
    },
    scan: scanSkill,
    async render(skill) {
      const { renderSkillContent } = await import('@deepseek-ai/dsh-skill');
      return renderSkillContent(skill);
    },
  });
  const probe = createReadinessProbe(config, { fetchImpl: localFetch });
  let starting = true;
  let ready = false;
  installHarnessUi(ctx, {
    guardEvents,
    serviceStatus: () => starting ? { status: 'starting', mode: config.mode }
      : ready ? probe() : { status: 'unavailable', mode: config.mode },
  });
  let agentGuardEnabled = raw.agentGuard?.enabled === true;
  const managedAgentGuard = createAgentGuardService(raw.agentGuard);
  let managedAgentGuardReady = false;
  try {
    if (!raw.runtimeRoot) agentGuardEnabled = JSON.parse(readFileSync(join(HERE, '../../.runtime/deepseek-harness/installation.json'), 'utf8')).agentGuardEnabled === true;
  } catch { /* Portable overlays without a local manifest show MCP as unconfigured. */ }
  const agentGuardState = raw.agentGuard?.stateDir ?? join(HERE, '../../modules/agentguard-group2/live-runtime');
  let agentGuardPort = 18080;
  try {
    const record = JSON.parse(readFileSync(join(agentGuardState, 'agentguard-process.json'), 'utf8'));
    if (Number.isInteger(record.port) && record.port >= 1024 && record.port <= 65535) agentGuardPort = record.port;
  } catch { /* The documented Harness launcher uses port 18080. */ }
  installHarnessWorkspace(ctx, {
    scanSkill, scanRoots: raw.allowedRoots, activity: () => readActivity(auditFile), trajectory,
    runtimeStatus: createRuntimeStatus({ enabled: agentGuardEnabled, baseUrl: raw.agentGuard?.baseUrl ?? `http://127.0.0.1:${agentGuardPort}`,
      auditPath: join(agentGuardState, 'state/enforcement_audit.jsonl') }),
  });
  installGuards(ctx, {
    client: { async screen(...args) { if (!ready) throw Error(BLOCK); return client.screen(...args); } },
    audit, highImpactTools: config.highImpactTools, guardEvents, admitSkill,
  });
  ctx.effect(() => async () => {
    ready = false;
    await Promise.allSettled([managedAgentGuard.stop(), service.stop()]);
  });
  const logger = { info: message => audit({ phase: 'service', message }) };
  try {
    await service.start({ logger });
    if (raw.runtimeRoot) await verifyRuntimeReady(config, {
      readiness: async () => {
        const response = await localFetch(`${config.baseUrl}/readyz`, {
          headers: { Authorization: `Bearer ${readFileSync(config.tokenFile, 'utf8').trim()}` }, signal: AbortSignal.timeout(2000),
        });
        if (!response.ok) throw Error('GovAgentSec service unavailable');
        return response.json();
      }, screen: request => client.screen(request),
    });
    ready = true;
    audit({ phase: 'startup', mode: config.mode, ready: true });
  } catch {
    await service.stop();
    // Retain the registered denial gates even when model startup fails.
    audit({ phase: 'startup', mode: config.mode, ready: false });
  } finally {
    starting = false;
  }
  if (raw.agentGuard?.enabled) {
    try {
      await managedAgentGuard.start();
      managedAgentGuardReady = true;
      if (raw.agentGuard.oidcTokenFile) {
        const Mcp = await import('@deepseek-ai/dsh-mcp-client');
        await ctx.plugin(Mcp, { serverName: 'agentguard', transport: 'stdio', command: raw.agentGuard.pythonPath,
          args: ['-m', 'integrations.openclaw_mcp'], cwd: raw.agentGuard.projectRoot,
          env: { PYTHONUTF8: '1', AGENTGUARD_MCP_BASE_URL: raw.agentGuard.baseUrl,
            AGENTGUARD_MCP_IDENTITY_MODE: 'oidc', AGENTGUARD_MCP_BEARER_TOKEN: '',
            AGENTGUARD_MCP_TOKEN_FILE: raw.agentGuard.oidcTokenFile },
          failOnStartupError: true,
        }).await();
      }
    } catch { managedAgentGuardReady = false; await managedAgentGuard.stop(); }
    audit({ phase: 'agentguard_startup', ready: managedAgentGuardReady,
      identityConfigured: Boolean(raw.agentGuard.oidcTokenFile) });
  }
  ctx.tools.register({
    name: 'govagentsec_scan_skill',
    description: 'Run local Aegis static analysis and Group4 Skill checks. Does not execute inspected code or install the Skill. Returns explicit coverage limits.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      if (!args || typeof args.path !== 'string' || Object.keys(args).some(key => key !== 'path')) throw Error('Invalid scan arguments');
      return scanSkill(args.path, exec.signal, exec);
    },
  });
}
