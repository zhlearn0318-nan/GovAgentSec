import { contentEvidence } from '../../modules/govagentsec-trace/privacy.mjs';

export const DOCUMENT_ID = 'emergency_plan';
export const TOOL = 'agentguard-notices__read_gov_document';
export const VERSION = '2026.7.1-2';
export function isLocalUrl(value) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) && ['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname)
      && !u.username && !u.password;
  } catch { return false; }
}

function parseSubjectFile(pathValue, { existsSync, readFileSync }) {
  if (!pathValue || !existsSync(pathValue)) return null;
  try {
    const subject = JSON.parse(readFileSync(pathValue, 'utf8').replace(/^\uFEFF/, ''));
    if (!subject || typeof subject !== 'object') return null;
    if (!String(subject.id || '').trim() || !String(subject.department || '').trim()) return null;
    if (!Array.isArray(subject.roles) || !subject.roles.length) return null;
    if (!Number.isInteger(subject.clearance) || subject.clearance < 0 || subject.clearance > 3) return null;
    if (typeof subject.mfa !== 'boolean') return null;
    return subject;
  } catch {
    return null;
  }
}

// Never prints configuration, prompts, tool results, bearer credentials or exception messages.
export function configurationChecks(config, agentId, env = process.env, fsApi) {
  const checks = [];
  const add = (code, passed) => checks.push({ code, passed: Boolean(passed) });
  const trace = config.plugins?.entries?.['govagentsec-trace'];
  add('TRACE_PLUGIN_ENABLED', trace?.enabled === true && trace.hooks?.allowConversationAccess === true
    && config.plugins?.enabled !== false && (!config.plugins?.allow || config.plugins.allow.includes('govagentsec-trace')));
  add('TRACE_CONTENT_HASHED', ['hash', 'summary'].includes(trace?.config?.contentMode ?? 'hash') && trace?.config?.dataDir);
  const mcp = config.mcp?.servers?.['agentguard-notices'];
  add('AGENTGUARD_MCP_ENABLED', mcp && mcp.enabled !== false && config.mcp?.enabled !== false);
  add('DOCUMENT_TOOL_FILTER', mcp?.toolFilter?.include?.includes('read_gov_document')
    && !mcp?.toolFilter?.exclude?.some(x => x === '*' || x === 'read_gov_document'));
  const bridgeEnv = { ...env, ...mcp?.env };
  const identityMode = (bridgeEnv.AGENTGUARD_MCP_IDENTITY_MODE ?? 'oidc').trim().toLowerCase();
  const demoIdentity = identityMode === 'loopback_static_dev';
  const oidcIdentity = identityMode === 'oidc';
  add('IDENTITY_MODE_SUPPORTED', oidcIdentity || demoIdentity);
  // Legacy code: true only for production OIDC path.
  add('OIDC_MODE', oidcIdentity);
  add('DEMO_IDENTITY_MODE', demoIdentity);
  const baseUrl = bridgeEnv.AGENTGUARD_MCP_BASE_URL ?? 'http://127.0.0.1:8080';
  add('AGENTGUARD_LOCAL', isLocalUrl(baseUrl));
  if (demoIdentity) {
    const subjectFile = bridgeEnv.AGENTGUARD_MCP_DEV_SUBJECT_FILE;
    add('OIDC_CREDENTIAL_CONFIGURED', false);
    add('DEMO_IDENTITY_CONFIGURED', Boolean(subjectFile) && isLocalUrl(baseUrl));
    let subjectOk = false;
    if (fsApi) {
      subjectOk = Boolean(parseSubjectFile(subjectFile, fsApi));
    } else {
      subjectOk = Boolean(subjectFile);
    }
    add('DEMO_IDENTITY_FILE_PRESENT', subjectOk);
  } else {
    add('OIDC_CREDENTIAL_CONFIGURED', Boolean(bridgeEnv.AGENTGUARD_MCP_BEARER_TOKEN || bridgeEnv.AGENTGUARD_MCP_TOKEN_FILE));
    add('DEMO_IDENTITY_CONFIGURED', false);
    add('DEMO_IDENTITY_FILE_PRESENT', false);
  }
  add('REQUEST_JOIN_CONFIGURED', bridgeEnv.AGENTGUARD_MCP_STATUS_STORE_FILE
    && bridgeEnv.AGENTGUARD_MCP_STATUS_STORE_FILE === config.plugins?.entries?.['agentguard-runtime-security']?.config?.statusPath);
  const agents = config.agents?.list ?? [], agent = agents.find(a => a.id === agentId);
  add('AGENT_EXISTS', agents.length ? Boolean(agent) : agentId === 'main');
  const defaults = config.agents?.defaults?.model, selected = agent?.model ?? defaults;
  const primary = typeof selected === 'string' ? selected : selected?.primary;
  const fallbacks = [...(typeof defaults === 'object' ? defaults?.fallbacks ?? [] : []),
    ...(typeof selected === 'object' ? selected?.fallbacks ?? [] : [])];
  const defaultPrimary = typeof defaults === 'string' ? defaults : defaults?.primary;
  const models = [primary, defaultPrimary, ...fallbacks];
  add('LOCAL_MODEL_ONLY', models.every(ref => {
    if (typeof ref !== 'string' || !ref.includes('/')) return false;
    const provider = config.models?.providers?.[ref.split('/')[0]];
    return isLocalUrl(provider?.baseUrl) && provider.models?.some(m => m.id === ref.slice(ref.indexOf('/') + 1));
  }));
  return {
    checks, primary, bridgeEnv, traceConfig: trace?.config,
    identity: {
      mode: identityMode,
      production_oidc: oidcIdentity,
      demo_loopback_static_dev: demoIdentity,
      label: demoIdentity
        ? '本机演示身份（loopback_static_dev），不是生产 OIDC'
        : (oidcIdentity ? '生产 OIDC 身份路径' : 'unsupported identity mode'),
    },
  };
}

export function validateLiveTrace(detail, { traceId, sessionKey, startedAt, requestRecord, primary }) {
  const checks = [], add = (code, passed) => checks.push({ code, passed: Boolean(passed) });
  const events = detail.events ?? [], starts = events.filter(e => e.event_type === 'run.started');
  const end = events.findLast(e => e.event_type === 'run.ended');
  add('HASH_CHAIN_VALID', detail.integrity?.valid === true);
  add('FRESH_SAME_TRACE', events.length && events.every(e => e.trace_id === traceId && Date.parse(e.timestamp) >= startedAt));
  add('LIVE_RUN_START', starts.length === 1 && starts[0].payload.source === 'openclaw' && starts[0].session_key === sessionKey);
  const primaryToolEnded = events.find(e => e.event_type === 'tool.ended' && e.payload.tool === TOOL
    && e.payload.failed === false && e.payload.control_status === 'executed_isolated');
  // success=true is preferred. If Group1 fail-closes a later unrelated tool (e.g. sessions_yield)
  // after the target MCP document call already succeeded, still count the primary path as ended.
  add('NORMAL_RUN_END', Boolean(end && end.sequence > starts[0]?.sequence && (
    end.payload.success === true || primaryToolEnded)));
  const models = events.filter(e => ['model.started', 'model.ended', 'model.output'].includes(e.event_type));
  add('MODEL_EVENT', models.length > 0);
  add('EXPECTED_LOCAL_MODEL', models.length && models.every(e => `${e.payload.provider}/${e.payload.model}` === primary));
  const calls = events.filter(e => e.event_type === 'tool.started' && e.payload.tool === TOOL);
  const call = calls[0];
  add('ONE_DOCUMENT_CALL', calls.length === 1 && call.payload.transport === 'mcp'
    && call.payload.server === 'agentguard-notices' && call.payload.input_fields?.includes('document_id')
    && call.payload.params?.sha256 === contentEvidence({ document_id: DOCUMENT_ID }).sha256);
  const result = events.find(e => e.event_type === 'tool.ended' && e.tool_call_id && e.tool_call_id === call?.tool_call_id);
  add('MCP_EXECUTION_COMPLETED', result?.payload.tool === TOOL && result.payload.transport === 'mcp'
    && result.payload.failed === false && result.payload.control_status === 'executed_isolated'
    && result.payload.correlation_verified === true && result.parent_event_id === call?.event_id
    && call.sequence > starts[0]?.sequence && result.sequence > call.sequence && end?.sequence > result.sequence);
  const row = requestRecord;
  add('AGENTGUARD_RECEIPT_JOIN', row && row.control_request_id === result?.request_id
    && row.request?.request_id === result?.request_id && row.request?.task_id === result?.task_id
    && Date.parse(row.created_at) >= startedAt && row.status === 'executed_isolated' && row.executed === true
    && row.request?.action?.tool === 'file.read' && row.request.action.operation === 'read'
    && row.request.action.data_level === 'public'
    && row.request.action.parameters?.document_id === DOCUMENT_ID
    && row.receipt?.business_result?.adapter === 'isolated_synthetic_document'
    && row.receipt.business_result.document_id === DOCUMENT_ID && row.receipt.business_result.side_effect === false);
  add('CAPTURE_WITHOUT_LOSS', !(detail.capture_failures?.length));
  add('CONTENT_HASHED', events.every(e => ['prompt', 'params', 'result', 'texts', 'error'].every(k => {
    const value = e.payload[k];
    return value == null || (value.available === true && /^[a-f0-9]{64}$/.test(value.sha256)
      && Object.keys(value).every(key => ['available', 'sha256', 'bytes', 'summary'].includes(key)));
  })));
  const outputs = events.filter(e => e.event_type === 'model.output');
  const usage = outputs.map(e => ({ sequence: e.sequence, fields: Object.fromEntries(
    ['input', 'output', 'total', 'cacheRead', 'cacheWrite'].map(k => [k, e.payload.usage?.[k] ?? null])) }));
  add('USAGE_FIELDS_VALID', outputs.every(e => e.payload.usage == null ||
    (typeof e.payload.usage === 'object' && ['input', 'output', 'total', 'cacheRead', 'cacheWrite'].every(k =>
      e.payload.usage[k] == null || (Number.isFinite(e.payload.usage[k]) && e.payload.usage[k] >= 0)))));
  const missingUsage = !outputs.length || usage.some(u => u.fields.input == null || u.fields.output == null);
  return { passed: checks.every(c => c.passed), checks, event_count: events.length,
    event_types: [...new Set(events.map(e => e.event_type))], integrity: detail.integrity,
    document: { document_id: DOCUMENT_ID, params_sha256: contentEvidence({ document_id: DOCUMENT_ID }).sha256,
      tool_call_id: call?.tool_call_id ?? null, request_id: result?.request_id ?? null, task_id: result?.task_id ?? null },
    usage: { status: missingUsage ? 'fields_unavailable' : 'recorded', scope: 'llm_output_attempt_aggregate', observations: usage,
      missing_boundary: missingUsage ? 'TRACE_HOOK_VERIFICATION.md: llm_output.usage optional; model_call_* has no usage' : null } };
}