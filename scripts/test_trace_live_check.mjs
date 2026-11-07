// Unit fixtures test the checker only. They are never acceptance evidence or runner inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TraceStore } from '../modules/govagentsec-trace/store.mjs';
import { configurationChecks, validateLiveTrace, TOOL, DOCUMENT_ID } from './lib/trace_live_check.mjs';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'trace-live-unit-'));
  try {
    const store = new TraceStore(root), traceId = 'unit-test', sessionKey = 'unit-session', startedAt = Date.now() - 1000;
    const add = (type, payload, more = {}) => store.append({ trace_id: traceId, session_key: sessionKey, event_type: type, payload, ...more });
    add('run.started', { source: 'openclaw', prompt: 'unit test only' });
    add('model.started', { provider: 'ollama', model: 'qwen3:8b' });
    const call = add('tool.started', { tool: TOOL, transport: 'mcp', server: 'agentguard-notices', input_fields: ['document_id'], params: { document_id: DOCUMENT_ID } }, { tool_call_id: 'call' });
    add('tool.ended', { tool: TOOL, transport: 'mcp', failed: false, control_status: 'executed_isolated', correlation_verified: true, result: 'not persisted' },
      { tool_call_id: 'call', parent_event_id: call.event_id, request_id: 'req', task_id: 'task' });
    add('run.ended', { success: true });
    add('model.output', { provider: 'ollama', model: 'qwen3:8b', usage: { input: 12, output: 3 }, texts: ['not persisted'] });
    return { detail: store.read(traceId), context: { traceId, sessionKey, startedAt, primary: 'ollama/qwen3:8b',
      requestRecord: { control_request_id: 'req', request: { request_id: 'req', task_id: 'task', action: { tool: 'file.read', operation: 'read', data_level: 'public', parameters: { document_id: DOCUMENT_ID } } },
        created_at: new Date().toISOString(), status: 'executed_isolated', executed: true,
        receipt: { business_result: { adapter: 'isolated_synthetic_document', document_id: DOCUMENT_ID, side_effect: false } } } } };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
test('complete checker fixture preserves attempt usage and missing optional fields', () => {
  const { detail, context } = fixture(), result = validateLiveTrace(detail, context);
  assert.equal(result.passed, true); assert.equal(result.usage.status, 'recorded');
  assert.equal(result.usage.observations[0].fields.total, null);
});
const cases = {
  synthetic: (d) => { d.events[0].payload.source = 'synthetic-fixture'; },
  stale: (d) => { d.events[0].timestamp = '2020-01-01T00:00:00Z'; },
  wrong_trace: (d) => { d.events[1].trace_id = 'other'; },
  wrong_session: (d) => { d.events[0].session_key = 'other'; },
  missing_end: (d) => { d.events = d.events.filter(e => e.event_type !== 'run.ended'); },
  missing_model: (d) => { d.events = d.events.filter(e => !e.event_type.startsWith('model.')); },
  external_model: (d) => { d.events[1].payload.provider = 'deepseek'; },
  wrong_document: (d) => { d.events[2].payload.params.sha256 = '0'.repeat(64); },
  non_mcp: (d) => { d.events[2].payload.transport = 'tool'; },
  denied: (d) => { d.events[3].payload.control_status = 'blocked'; },
  unjoined: (d, c) => { c.requestRecord.control_request_id = 'other'; },
  no_adapter: (d, c) => { c.requestRecord.receipt = {}; },
  hash_break: (d) => { d.integrity.valid = false; },
  lost_capture: (d) => { d.capture_failures.push({ code: 'capture_failed' }); },
  raw_body: (d) => { d.events[3].payload.result = 'raw result'; },
  invalid_usage: (d) => { d.events.at(-1).payload.usage.input = -1; },
};
for (const [name, mutate] of Object.entries(cases)) test('reject ' + name, () => {
  const { detail, context } = fixture(); mutate(detail, context); assert.equal(validateLiveTrace(detail, context).passed, false);
});
test('unavailable usage is explicit, never zero-filled', () => {
  const { detail, context } = fixture(); delete detail.events.at(-1).payload.usage;
  const result = validateLiveTrace(detail, context);
  assert.equal(result.passed, true); assert.equal(result.usage.status, 'fields_unavailable');
  assert.equal(result.usage.observations[0].fields.input, null);
});
test('preflight rejects missing identity, filter and external primary/fallback', () => {
  const config = { agents: { defaults: { model: { primary: 'ollama/qwen3:8b' } } },
    models: { providers: { ollama: { baseUrl: 'http://127.0.0.1:11434', models: [{ id: 'qwen3:8b' }] } } } };
  let checks = configurationChecks(config, 'main', {}).checks;
  assert.equal(checks.find(c => c.code === 'LOCAL_MODEL_ONLY').passed, true);
  for (const code of ['OIDC_CREDENTIAL_CONFIGURED', 'DOCUMENT_TOOL_FILTER', 'AGENTGUARD_MCP_ENABLED']) assert.equal(checks.find(c => c.code === code).passed, false);
  config.agents.defaults.model.fallbacks = ['deepseek/deepseek-chat'];
  checks = configurationChecks(config, 'main', {}).checks;
  assert.equal(checks.find(c => c.code === 'LOCAL_MODEL_ONLY').passed, false);
  config.agents.list = [{ id: 'main', model: 'ollama/qwen3:8b' }];
  config.agents.defaults.model = { primary: 'deepseek/deepseek-chat' };
  assert.equal(configurationChecks(config, 'main', {}).checks.find(c => c.code === 'LOCAL_MODEL_ONLY').passed, false);
});
test('preflight accepts loopback_static_dev demo identity without OIDC credentials', () => {
  const subjectPath = 'C:/tmp/demo-subject.json';
  const fsApi = {
    existsSync: (p) => p === subjectPath,
    readFileSync: () => JSON.stringify({ id: 'demo-user', department: 'demo', roles: ['office_user'], clearance: 1, mfa: true }),
  };
  const config = {
    agents: { defaults: { model: { primary: 'ollama/qwen3:8b' } } },
    models: { providers: { ollama: { baseUrl: 'http://127.0.0.1:11434', models: [{ id: 'qwen3:8b' }] } } },
    mcp: { enabled: true, servers: { 'agentguard-notices': {
      enabled: true,
      toolFilter: { include: ['read_gov_document'] },
      env: {
        AGENTGUARD_MCP_BASE_URL: 'http://127.0.0.1:8080',
        AGENTGUARD_MCP_IDENTITY_MODE: 'loopback_static_dev',
        AGENTGUARD_MCP_DEV_SUBJECT_FILE: subjectPath,
        AGENTGUARD_MCP_STATUS_STORE_FILE: 'C:/tmp/status.json',
      },
    } } },
    plugins: { enabled: true, allow: ['govagentsec-trace', 'agentguard-runtime-security'],
      entries: {
        'govagentsec-trace': { enabled: true, hooks: { allowConversationAccess: true }, config: { contentMode: 'hash', dataDir: 'C:/tmp/trace' } },
        'agentguard-runtime-security': { config: { statusPath: 'C:/tmp/status.json' } },
      } },
  };
  const result = configurationChecks(config, 'main', {}, fsApi);
  assert.equal(result.identity.demo_loopback_static_dev, true);
  assert.equal(result.identity.production_oidc, false);
  assert.match(result.identity.label, /不是生产 OIDC/);
  for (const code of ['IDENTITY_MODE_SUPPORTED', 'DEMO_IDENTITY_MODE', 'DEMO_IDENTITY_CONFIGURED', 'DEMO_IDENTITY_FILE_PRESENT', 'LOCAL_MODEL_ONLY']) {
    assert.equal(result.checks.find(c => c.code === code).passed, true, code);
  }
  assert.equal(result.checks.find(c => c.code === 'OIDC_CREDENTIAL_CONFIGURED').passed, false);
  assert.equal(result.checks.find(c => c.code === 'OIDC_MODE').passed, false);
});
