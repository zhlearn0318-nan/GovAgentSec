import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installHarnessTrajectory } from '../integrations/deepseek-harness/trajectory.mjs';

const runtime = resolve('.runtime/deepseek-harness');
const manifest = JSON.parse(readFileSync(join(runtime, 'installation.json'), 'utf8'));
const built = file => import(pathToFileURL(join(manifest.harnessRoot, file)).href);
const { Context } = await built('vendor/cordis/lib/index.js');
const { default: Sessions } = await built('packages/core/session/lib/index.js');
const { default: SystemPrompt } = await built('packages/core/system-prompt/lib/index.js');
const { default: Tools } = await built('packages/core/tools/lib/index.js');
const Native = await built('packages/core/tool-executor-native/lib/index.js');
const ctx = new Context();
try {
  await ctx.plugin(Sessions);
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(Tools);
  await ctx.plugin(Native);
  const dataDir = join(runtime, 'deployment-20261108', 'native-verification', String(Date.now()));
  const capture = installHarnessTrajectory(ctx, { dataDir });
  const session = ctx.sessions.create('govagentsec-native-trace-verification');
  const agent = { session, ctx };
  session.append('turn/start', { turn: 1 });
  session.append('step/start', { turn: 1, step: 1 });
  ctx.emit('agent/assistant-stream', { agent, frame: { type: 'start', attemptId: 'test-attempt', turn: 1, step: 1, revision: 1 } });
  session.append('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', source: { model: 'synthetic-verification', provider: 'local-test' }, content: [{ type: 'text', text: 'Read the synthetic public status.' }] }, stream: [], usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }, { surfaceOp: 'append' });
  ctx.emit('agent/assistant-stream', { agent, frame: { type: 'end', attemptId: 'test-attempt', revision: 2, index: 0, outcome: { kind: 'committed', eventType: 'assistant/message', seq: 2 } } });
  ctx.tools.register({ name: 'trace_probe_readonly', description: 'Local synthetic trace verification', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_, text) => [{ type: 'text', text }] }, async execute() { return 'Synthetic public status: ready.'; } });
  const batch = await ctx.tools.execute({ agent, log: { turn: 1, step: 1 }, calls: [{ type: 'tool-call', id: 'real-native-call', name: 'trace_probe_readonly', arguments: '{}' }], signal: new AbortController().signal });
  assert.equal(batch.results[0].result.isError, false);
  session.append('step/end', { turn: 1, step: 1 });
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
  const rows = capture.list();
  assert.equal(rows.length, 1);
  const trace = capture.detail(rows[0].trace_id);
  assert.equal(trace.integrity.valid, true);
  assert.equal(trace.summary.trace_status, 'complete');
  assert.equal(trace.graph.edges.filter(edge => edge.kind === 'call').length, 2);
  assert.equal(capture.store.failures.length, 0);
  const report = { realHarnessSessionEvents: true, realNativeToolExecution: true, modelStream: 'synthetic-local-test',
    storedOutsideLiveHistory: true, traceIntegrity: true, observedEvents: trace.events.map(event => event.event_type), externalModelRequest: false };
  mkdirSync(join(runtime, 'deployment-20261108'), { recursive: true });
  writeFileSync(join(runtime, 'deployment-20261108/native-trajectory-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await ctx.fiber.dispose(); }
