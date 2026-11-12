import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TraceStore } from '../../modules/govagentsec-trace/store.mjs';
import { contentEvidence, digest, RULE_VERSION, ruleHits } from '../../modules/govagentsec-trace/privacy.mjs';
import { traceGraph } from '../../modules/govagentsec-trace/view-model.mjs';
import { Workshop } from '../../modules/trajectory-governance/workshop.mjs';

/** Observe live Harness events without replaying old sessions or changing their decisions. */
export function installHarnessTrajectory(ctx, { dataDir, loaderRoots = [] }) {
  const store = new TraceStore(join(dataDir, 'traces'));
  const active = new Map();
  const sessionKey = id => typeof id === 'string' && id ? digest(id) : undefined;
  // Protection audits use the existing adapter's SHA-256 conversation identity.
  // Keep that identity separate from the hashed projection used in persisted traces.
  const auditSessions = new Map();
  function save(state, type, payload = {}, association = {}) {
    return store.append({ trace_id: state.id, session_key: state.session, event_type: type, payload, ...association });
  }
  function contained(state, hook, action) {
    try { action(); }
    catch { store.failure(state?.id, hook); }
  }
  function stateFor(id) { return active.get(sessionKey(id)); }
  ctx.on('session/event', (session, event) => {
    const key = sessionKey(session.id);
    let state = active.get(key);
    contained(state, event.type, () => {
      const data = event.data;
      if (event.type === 'turn/start') {
        if (!key || active.size >= 1024 || state) throw Error('Capture context unavailable');
        state = { id: 'dsh-' + randomUUID(), session: key, turn: data.turn, started: event.time, tools: new Map(), models: new Map() };
        active.set(key, state);
        auditSessions.set(auditSessionKey(session.id), state);
        save(state, 'run.started', { source: 'deepseek-harness', turn: data.turn, rule_version: RULE_VERSION });
        return;
      }
      if (!state) return; // Seed and unrelated host events do not invent a run.
      if (data.turn !== undefined && data.turn !== state.turn) throw Error('Mismatched turn');
      if (event.type === 'user/message') {
        save(state, 'input.observed', { content: data.content, source_kind: data.source?.kind ?? 'unknown', rule_hits: ruleHits(data.content) });
        if (data.source?.kind === 'skill-invocation') save(state, 'skill.observed', { name: contentEvidence(data.source.name), evidence: 'host_skill_invocation', execution_confirmed: false });
      } else if (event.type === 'assistant/message') {
        const current = state.currentModel;
        const usage = data.usage;
        const known = value => Number.isFinite(value) ? value : null;
        const input = usage ? [usage.inputTokens, usage.cacheReadTokens ?? 0, usage.cacheWriteTokens ?? 0] : [];
        save(state, 'model.output', { model: data.message.source?.model ?? null, provider: data.message.source?.provider ?? null,
          texts: data.message.content.filter(block => block.type === 'text'),
          usage: usage ? { input: input.every(Number.isFinite) ? input.reduce((a, b) => a + b, 0) : null,
            output: known(usage.outputTokens), total: known(usage.totalTokens), cacheRead: known(usage.cacheReadTokens), cacheWrite: known(usage.cacheWriteTokens) } : null,
          interrupted: data.interrupted === true, rule_hits: ruleHits(data.message.content.filter(block => block.type === 'text')) },
        { model_call_id: current?.id });
      } else if (event.type === 'tool/call') {
        if (state.tools.has(data.callId)) throw Error('Duplicate call');
        let fields = [];
        try { fields = Object.keys(JSON.parse(data.arguments)).filter(field => /^[A-Za-z_][A-Za-z0-9_]{0,50}$/.test(field)); }
        catch { /* Invalid model arguments remain hashed evidence, without invented fields. */ }
        const call = { id: digest([state.id, data.callId]), tool: data.name, started: event.time };
        const saved = save(state, 'tool.started', { tool: data.name, params: data.arguments, input_fields: fields,
          transport: data.name.startsWith('mcp__') ? 'mcp' : 'tool', rule_hits: ruleHits([data.name, data.arguments]) }, { tool_call_id: call.id });
        state.tools.set(data.callId, { ...call, parent: saved.event_id });
      } else if (event.type === 'tool/result') {
        const call = state.tools.get(data.message.toolCallId);
        if (!call) throw Error('Orphan tool result');
        save(state, 'tool.ended', { tool: call.tool, result: data.message.content, failed: data.message.isError === true,
          error_code: data.error?.code ?? null, duration_ms: event.time - call.started,
          transport: call.tool.startsWith('mcp__') ? 'mcp' : 'tool' }, { tool_call_id: call.id, parent_event_id: call.parent });
        state.tools.delete(data.message.toolCallId);
        if (call.tool === 'skill' && !data.message.isError) save(state, 'skill.observed', { evidence: 'successful_native_skill_tool', execution_confirmed: false }, { tool_call_id: call.id });
      } else if (event.type === 'turn/end') {
        if (data.reason.kind === 'blocked') save(state, 'protection.host', { decision: 'BLOCK', enforced: true, source: 'Harness' });
        save(state, 'run.ended', { success: data.reason.kind === 'completed', reason: data.reason.kind, duration_ms: event.time - state.started });
        active.delete(key);
        auditSessions.delete(auditSessionKey(session.id));
      }
    });
  });
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (frame.type === 'chunk') return; // Hidden reasoning and streamed content are never captured.
    const state = stateFor(agent.session.id);
    if (!state) return;
    contained(state, 'agent/assistant-stream', () => {
      if (frame.type === 'start') {
        if (frame.turn !== state.turn || state.models.has(frame.attemptId)) throw Error('Mismatched model attempt');
        const call = { id: digest([state.id, frame.attemptId]), started: Date.now() };
        const saved = save(state, 'model.started', { step: frame.step }, { model_call_id: call.id });
        state.currentModel = { ...call, parent: saved.event_id };
        state.models.set(frame.attemptId, state.currentModel);
      } else if (frame.type === 'end') {
        const call = state.models.get(frame.attemptId);
        if (!call) throw Error('Orphan model result');
        save(state, 'model.ended', { outcome: frame.outcome.kind === 'committed' && frame.outcome.eventType === 'assistant/message' ? 'success' : 'error',
          duration_ms: Date.now() - call.started }, { model_call_id: call.id, parent_event_id: call.parent });
        state.models.delete(frame.attemptId);
        if (state.currentModel === call) state.currentModel = undefined;
      }
    });
  });
  function protection(event) {
    const state = auditSessions.get(event.session);
    if (!state || !['ALLOW', 'REVIEW', 'BLOCK'].includes(event.decision)) return;
    contained(state, 'protection', () => save(state, event.phase === 'approval' ? 'approval.observed' : 'protection.' + event.phase,
      { decision: event.decision, enforced: event.enforced === true, risk: event.riskLevel ?? null,
        status: event.phase === 'approval' ? 'requested' : event.phase, source: 'GovAgentSec', scope: 'turn' }));
  }
  function detail(id) {
    if (typeof id !== 'string' || !/^dsh-[a-f0-9-]{36}$/.test(id)) throw Error('Invalid trace identifier');
    const trace = store.read(id);
    const view = { ...trace, events: trace.events.slice(0, 2000) };
    return { ...view, graph: traceGraph(view), truncated: trace.events.length > view.events.length };
  }
  function evolution() {
    const root = join(dataDir, 'skill-workshop');
    const candidates = [];
    if (existsSync(root) && loaderRoots.length) {
      const workshop = new Workshop(root, loaderRoots);
      for (const id of readdirSync(root).filter(id => /^[a-f0-9-]{36}$/.test(id)).slice(0, 100)) {
        try { const row = workshop.read(id); candidates.push({ id, name: row.name, status: row.status, created_at: row.created_at }); }
        catch { candidates.push({ id, status: 'unverified' }); }
      }
    }
    return { calibrated: false, automaticPublish: false, candidates, loaderRootsConfigured: loaderRoots.length > 0,
      gates: ['完整轨迹与任务归属确认', '本地质量与安全评审及标定', 'Aegis + Group4 联合准入', '独立任务验证', '人工确认与发布'] };
  }
  return { store, dataDir, sessionKey: auditSessionKey, protection, detail, evolution,
    list: () => { const running = new Set([...active.values()].map(state => state.id)); return store.list().slice(0, 100).map(row => ({ ...row, live: running.has(row.trace_id) })); } };
}

// Match the existing guard adapter without writing native session identifiers.
function auditSessionKey(id) { return typeof id === 'string' && id ? createHash('sha256').update(id, 'utf8').digest('hex') : undefined; }
