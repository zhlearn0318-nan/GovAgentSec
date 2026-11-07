// Fixed-host source verification + actual installed hook-dispatch probe.
// No provider request, no tools executed, no conversation content persisted.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const install = path.resolve(process.argv[2] ?? path.join(process.env.APPDATA, 'npm/node_modules/openclaw'));
const out = path.resolve(process.argv[3] ?? 'local-validation/trace-hook-probe');
const pkg = JSON.parse(readFileSync(path.join(install, 'package.json'), 'utf8'));
assert.equal(pkg.version, '2026.7.1-2', 'fixed OpenClaw version required');
const dist = path.join(install, 'dist'), files = readdirSync(dist);
const prefixes = ['hook-types-', 'attempt.model-diagnostic-events-', 'selection-', 'run-attempt-', 'mcp-http-', 'native-hook-relay-', 'agent-tools.before-tool-call-', 'registry-', 'hook-runner-global-'];
const sources = prefixes.flatMap(prefix => {
  const matches = files.filter(f => f.startsWith(prefix) && (prefix === 'hook-types-' ? f.endsWith('.d.ts') : f.endsWith('.js')));
  assert.ok(matches.length, prefix);
  return matches.map(file => { const text = readFileSync(path.join(dist, file), 'utf8');
    return { file, sha256: createHash('sha256').update(text).digest('hex'), text }; });
});
const types = sources[0].text, ended = types.split('type PluginHookAgentEndEvent = {')[1].split('\n};')[0];
const model = types.split('type PluginHookModelCallEndedEvent =')[1].split('type PluginHookLlmOutputEvent')[0];
assert.equal(ended.includes('skillsUsed'), false); assert.equal(model.includes('usage'), false);
assert.ok(sources.find(s => s.file.startsWith('registry-')).text.includes('hooks.allowConversationAccess=true'));
const dispatcher = await import(pathToFileURL(path.join(dist, 'plugins/hook-runner-global.js')));
const observed = [], names = ['before_agent_run','model_call_started','model_call_ended','before_tool_call','after_tool_call','agent_end','llm_output'];
const typedHooks = names.map(hookName => ({ pluginId: 'govagentsec-trace-probe', hookName, handler: (event, ctx) => {
  observed.push({ hook: hookName, event_fields: Object.keys(event), context_fields: Object.keys(ctx), run_id_present: Boolean(event.runId ?? ctx.runId),
    has_skillsUsed: Object.hasOwn(event, 'skillsUsed'), usage_fields: Object.keys(event.usage ?? {}) });
} }));
dispatcher.initializeGlobalHookRunner({ plugins: [], hooks: [], typedHooks });
const runner = dispatcher.getGlobalHookRunner(), ctx = { runId: 'probe-run', sessionKey: 'probe-session', sessionId: 'probe-session-id' };
try {
  await runner.runBeforeAgentRun({ prompt: 'synthetic probe' }, ctx);
  await runner.runModelCallStarted({ runId: ctx.runId, callId: 'c1', provider: 'fixture', model: 'local' }, ctx);
  await runner.runModelCallEnded({ runId: ctx.runId, callId: 'c1', provider: 'fixture', model: 'local', durationMs: 1, outcome: 'completed' }, ctx);
  await runner.runBeforeToolCall({ toolName: 'fixture__echo', params: {}, runId: ctx.runId, toolCallId: 't1' }, ctx);
  await runner.runAfterToolCall({ toolName: 'fixture__echo', params: {}, result: {}, runId: ctx.runId, toolCallId: 't1', durationMs: 1 }, ctx);
  await runner.runAgentEnd({ runId: ctx.runId, success: true, messages: [], durationMs: 3 }, ctx);
  await runner.runLlmOutput({ runId: ctx.runId, sessionId: ctx.sessionId, provider: 'fixture', model: 'local', assistantTexts: [], usage: { input: 1, output: 1, total: 2 } }, ctx);
  assert.deepEqual(observed.map(e => e.hook), names);
} finally { dispatcher.resetGlobalHookRunner(); }
mkdirSync(out, { recursive: true });
const result = { openclaw_version: pkg.version, mode: 'installed_dispatcher_with_synthetic_payloads_not_provider_E2E',
  sources: sources.map(({ text, ...meta }) => meta), observations: observed };
writeFileSync(path.join(out, 'verification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ version: pkg.version, passed: true, hooks: observed.length, report: path.join(out, 'verification.json') }));
