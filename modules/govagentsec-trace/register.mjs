import path from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { TraceStore } from './store.mjs';
import { perCallUsage } from './usage.mjs';
import { NATIVE_APPROVAL, appendNativeApproval } from './native-approval.mjs';
import { wrapperCallKey, appendWrapperUsage } from './wrapper-usage.mjs';
import { RULE_VERSION, ruleHits, contentEvidence } from './privacy.mjs';
import { generateCandidate } from './evolution.mjs';
import { Workshop } from '../trajectory-governance/workshop.mjs';
import {releaseGate,reviewerIdentity,readReviewReceipt,confirmReview} from './release-gate.mjs';
import {AssessmentJobs,selectionPreview} from './assessment-jobs.mjs';
import {historyPacks,openEvidencePack} from './evidence-packs.mjs';
import {GRID_SKILL,GRID_TASK,gridGeneration,gridReleaseGate,publishGridCandidate} from './grid-release.mjs';
import {requireBusinessPermission} from '../agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';

export const OBSERVERS = Symbol.for('govagentsec.trace.observers');
export function registerTrace(api) {
  const config = api.pluginConfig ?? {}, failures = [];
  let store;
  try { store = new TraceStore(path.join(config.dataDir, 'traces'), config); }
  catch { failures.push({ code: 'store_unavailable' }); api.logger.warn('GovAgentSec trace store unavailable; capture disabled'); }
  const starts = new Map(), sessions = new Map();
  globalThis[NATIVE_APPROVAL] = entry => appendNativeApproval(store, entry);
  const record = (type, event, ctx = {}, payload = {}, associations = {}) => {
    const id = event.runId ?? ctx.runId;
    try {
      if (!store || !id) throw new Error('missing capture context');
      const callId = event.toolCallId ?? ctx.toolCallId, modelId = event.callId;
      const key = id + ':' + (callId ?? modelId ?? type);
      const saved = store.append({ trace_id: id, event_type: type,
        session_key: ctx.sessionKey ?? event.sessionKey, session_id: ctx.sessionId ?? event.sessionId,
        tool_call_id: callId, model_call_id: modelId,
        parent_event_id: type.endsWith('.ended') ? starts.get(key) ?? null : null, ...associations, payload });
      if (type === 'tool.started' || type === 'model.started') starts.set(key, saved.event_id);
      if (type.endsWith('.ended')) starts.delete(key);
      if (starts.size > 10000) starts.delete(starts.keys().next().value);
      return saved;
    } catch {
      store?.failure(id, type); failures.push({ trace_id: id ?? null, hook: type, code: 'capture_failed' });
      api.logger.warn('GovAgentSec trace capture incomplete: ' + type);
    }
    // Intentionally return undefined: never supplies a gate or mutation result.
  };
  const on = (hook, type, project) => api.on(hook, (e, ctx = {}) => {
    try { record(type, e, ctx, project(e, ctx)); }
    catch { store?.failure(e.runId ?? ctx.runId, hook, 'projection_failed'); api.logger.warn('GovAgentSec trace projection failed: ' + hook); }
  }, { priority: 110 });
  api.on('session_start', (e, ctx = {}) => { sessions.set(e.sessionId ?? ctx.sessionId, { started: true, sessionKey: e.sessionKey ?? ctx.sessionKey }); });
  api.on('before_agent_run', (e, ctx = {}) => {
    record('run.started', e, ctx, { prompt: e.prompt, source: 'openclaw', rule_version: RULE_VERSION });
    const id = e.runId ?? ctx.runId, session = sessions.get(ctx.sessionId);
    if (session?.started) record('session.started', { runId: id }, ctx, { source: 'host_session_start' });
    sessions.set(ctx.sessionId, { runId: id, sessionKey: ctx.sessionKey });
    if (sessions.size > 10000) sessions.delete(sessions.keys().next().value);
  }, { priority: 110 });
  api.on('session_end', (e, ctx = {}) => {
    const session = sessions.get(e.sessionId ?? ctx.sessionId);
    if (session?.runId) record('session.ended', { runId: session.runId }, { ...ctx, sessionKey: session.sessionKey },
      { reason: e.reason, duration_ms: e.durationMs, message_count: e.messageCount });
    sessions.delete(e.sessionId ?? ctx.sessionId);
  });
  on('model_call_started', 'model.started', e => ({ model: e.model, provider: e.provider, transport: e.transport ?? null,
    usage: null, token_scope: 'unavailable', token_missing_reason: 'model_call_not_finished' }));
  api.on('model_call_ended', async (e, ctx = {}) => {
    const ended = record('model.ended', e, ctx, { model: e.model, provider: e.provider, outcome: e.outcome, duration_ms: e.durationMs,
      error_category: e.errorCategory ?? null, failure_kind: e.failureKind ?? null, first_byte_ms: e.timeToFirstByteMs ?? null,
      ...perCallUsage(e), usage_correlation_key: wrapperCallKey(config.usageWrapper, e, ctx) });
    try { await appendWrapperUsage(store, ended, ctx, config.usageWrapper); }
    catch { store?.failure(e.runId ?? ctx.runId, 'model.usage', 'usage_capture_failed'); api.logger.warn('GovAgentSec usage capture incomplete'); }
  }, { priority: 110 });
  const mcp = name => Object.keys(api.config?.mcp?.servers ?? {}).find(server => name?.startsWith(server.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 30) + '__'));
  on('before_tool_call', 'tool.started', e => ({ tool: e.toolName, transport: mcp(e.toolName) ? 'mcp' : 'tool', server: mcp(e.toolName) ?? null,
    params: e.params, input_fields: Object.keys(e.params ?? {}).filter(k => /^[A-Za-z_][A-Za-z0-9_]{0,50}$/.test(k)), rule_hits: ruleHits([e.toolName, e.params]) }));
  api.on('after_tool_call', (e, ctx = {}) => {
    try {
    const details = e.result?.details, control = details?.structuredContent;
    const validRef = details?.mcpServer === 'agentguard-notices' && e.toolName === `agentguard-notices__${details?.mcpTool}` && /^mcp-req-[a-f0-9]{32}$/.test(control?.control_request_id ?? '');
    let association = {}, request;
    if (validRef) {
      association.request_id = control.control_request_id;
      const statusPath = api.config?.plugins?.entries?.['agentguard-runtime-security']?.config?.statusPath;
      if (statusPath) {
        try {
          const row = JSON.parse(readFileSync(path.join(statusPath + '.requests', control.control_request_id + '.json'), 'utf8'));
          const actions = {read_gov_document:'file.read',list_notices:'database.query',request_test_payment:'payment.transfer',run_protected_command:'shell.execute',submit_emergency_notice:'notification.submit'};
          if (actions[details.mcpTool] && row.control_request_id === control.control_request_id && row.request?.request_id === control.control_request_id && row.request.action?.tool === actions[details.mcpTool]) { request = row; association.task_id = row.request.task_id; }
        } catch { /* Record the missing join, never invent a task ID. */ }
      }
    }
    const grid = e.toolName==='gov_analyze_grid' && !e.error && !e.result?.isError ? e.result?.details?.grid_evidence : null;
    const gridEvidence = grid ? {period:grid.period,document_ids:grid.document_ids,report_id:grid.report_id,skill_version:grid.skill_version,skill_hash:grid.skill_hash,skill_prompt_loaded:grid.skill_prompt_loaded===true} : null;
    record('tool.ended', e, ctx, { tool: e.toolName, result: e.result, error: e.error,
      failed: Boolean(e.error || e.result?.isError), duration_ms: e.durationMs ?? null,
      ...(gridEvidence?{grid_evidence:gridEvidence}:{}),
      result_shape: contentEvidence(e.result, 'summary').summary ?? null, transport: mcp(e.toolName) ? 'mcp' : 'tool',
      control_status: validRef ? control.status : null, correlation_verified: Boolean(request) }, association);
    if (validRef) record('protection.agentguard', e, ctx, { decision: control.status === 'blocked' ? 'BLOCK' : control.status === 'pending_approval' ? 'REVIEW' : control.status === 'success' ? 'ALLOW' : 'UNKNOWN',
      enforced: request ? control.executed === false : false, status: control.status, reason_code: control.reason_code, source: 'AgentGuard', correlation_verified: Boolean(request) }, association);
    if (validRef && (control.approval_required || request?.request?.approval?.status)) record('approval.observed', e, ctx,
      { status: request?.request?.approval?.status ?? 'pending', source: 'AgentGuard', verified: Boolean(request) }, association);
    if(gridEvidence?.skill_hash && gridEvidence.skill_version && gridEvidence.skill_prompt_loaded)record('skill.observed',e,ctx,{name:GRID_SKILL,evidence:'native_prompt_skill_loaded_and_tool_verified',execution_confirmed:true,
      version:gridEvidence.skill_version,artifact_hash:gridEvidence.skill_hash});
    const file = e.params?.path ?? e.params?.file_path;
    if (/^(read|read_file)$/i.test(e.toolName) && typeof file === 'string' && /(?:^|[\\/])SKILL\.md$/i.test(file) && !e.error && !e.result?.isError) {
      record('skill.observed', e, ctx, { name: file.replaceAll('\\', '/').split('/').at(-2) ?? 'unknown',
        evidence: 'successful_SKILL.md_read', execution_confirmed: false, file: contentEvidence(file) });
    }
    } catch { store?.failure(e.runId ?? ctx.runId, 'after_tool_call', 'projection_failed'); api.logger.warn('GovAgentSec trace projection failed: after_tool_call'); }
  }, { priority: 110 });
  on('llm_output', 'model.output', e => ({ model: e.model, provider: e.provider, harness: e.harnessId ?? null,
    texts: e.assistantTexts, has_content:(Array.isArray(e.assistantTexts)?e.assistantTexts:[e.assistantTexts]).some(t=>typeof t==='string'&&t.trim().length>0),
    usage: e.usage ?? null, token_scope: 'run_aggregate', rule_hits: ruleHits(e.assistantTexts) }));
  on('agent_end', 'run.ended', e => ({ success: e.success, error: e.error,
    error_code:e.success===false?(/No callable tools remain/i.test(String(e.error??''))?'TOOL_PREFLIGHT_EMPTY':'AGENT_RUN_FAILED'):null,
    duration_ms: e.durationMs ?? null }));
  const observers = globalThis[OBSERVERS] ??= new Map();
  observers.set('govagentsec-trace', entry => {
    record(entry.phase?.startsWith('approval') ? 'approval.observed' : 'protection.' + entry.phase, entry,
      { sessionKey: entry.sessionKey, sessionId: entry.sessionId, toolCallId: entry.toolCallId },
      { decision: entry.decision, enforced: entry.enforced, risk: entry.riskLevel, reason_code: entry.reasonCode,
        status: entry.phase, duration_ms: entry.durationMs, source: 'Group1', categories: entry.categories });
  });
  const loaderRoots = [...new Set([path.join(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.openclaw/skills'),
    path.join(api.config?.agents?.defaults?.workspace ?? path.join(process.env.USERPROFILE ?? '.', '.openclaw/workspace'), 'skills'),
    ...(api.config?.skills?.load?.extraDirs ?? [])])];
  const currentRoot=path.join(config.dataDir,'skill-workshop');
  const gridWorkspace=api.config?.agents?.defaults?.workspace??path.join(process.env.USERPROFILE??'.','.openclaw/workspace');
  const jobs=new AssessmentJobs(store,path.join(config.dataDir,'assessment-jobs'));
  const source = p => p.pack_id === undefined ? {store,workshopRoot:currentRoot,read_only:false} : openEvidencePack(p.pack_id);
  const workshop = (root=currentRoot) => new Workshop(root, loaderRoots);
  const candidates = (root=currentRoot) => {
    return existsSync(root) ? readdirSync(root).filter(id => /^[a-f0-9-]{36}$/.test(id)).map(id => {
      try { const c=workshop(root).read(id),receipt=path.join(root,id,'grid-release.json');
        return {...c,...(existsSync(receipt)?{grid_release:JSON.parse(readFileSync(receipt,'utf8'))}:{})}; } catch { return { id, status: 'unreadable' }; }
    }) : [];
  };
  const only = (p,keys) => {if (!p || Array.isArray(p) || Object.keys(p).some(k=>!keys.includes(k)))throw Error('UNEXPECTED_PARAMETERS');};
  const methods = { historyPacks,
    list: p => {const s=source(p);return { traces:s.store.list().filter(t=>!p.session_key||t.session_key===p.session_key),capture_failures:s.store.failures,failures:s.read_only?[]:failures,read_only:s.read_only };},
    detail: p => source(p).store.read(p.trace_id), health: () => ({ available: Boolean(store), failures, capture_failures: store?.failures ?? [], version: '2026.7.1-2', content_mode: config.contentMode ?? 'hash' }),
    candidates: p => ({ candidates: candidates(source(p).workshopRoot),read_only:source(p).read_only }), assign: p => store.assign(p.trace_id, p),
    assessmentStart: p => {only(p,['task_key','trace_ids','judge']);return jobs.start(p);},
    assessmentStatus: p => {only(p,['job_id']);return jobs.status(p.job_id);},
    assessmentCancel: p => {only(p,['job_id']);return jobs.cancel(p.job_id);},
    selectionPreview: p => {only(p,['task_key','trace_ids','keep','pack_id']);return selectionPreview(source(p).store,p);},
    releaseGate: (p,client,business) => {const s=source(p),w=workshop(s.workshopRoot),c=w.read(p.candidate_id);
      const gate=releaseGate(c,s.store.list().map(t=>t.assessment).filter(Boolean),s.read_only?null:reviewerIdentity(client),readReviewReceipt(w,c.id));
      if(!s.read_only&&c.generation?.release?.scope==='openclaw-grid-demo'){
        const receiptFile=path.join(w.directory(c.id),'grid-release.json');
        gate.grid=gridReleaseGate({candidate:c,store,config:config.gridDemoRelease,workspace:gridWorkspace,identity:business,receipt:existsSync(receiptFile)?JSON.parse(readFileSync(receiptFile,'utf8')):null});
        gate.grid.after=readFileSync(path.join(w.directory(c.id),'bundle','SKILL.md'),'utf8');
      }
      if(s.read_only)gate.confirmation={enabled:false,reason:'历史证据包只读；候选尚未安装',receipt:gate.confirmation.receipt};return gate;},
    gridPublish: (p,client,business) => {only(p,['candidate_id','artifact_hash']);return publishGridCandidate({workshop:workshop(),store,id:p.candidate_id,expectedHash:p.artifact_hash,
      config:config.gridDemoRelease,workspace:gridWorkspace,identity:business});},
    confirmReview: (p,client) => {if(Object.keys(p).some(k=>!['candidate_id','artifact_hash'].includes(k)))throw Error('unexpected parameters');
      return confirmReview(workshop(),p.candidate_id,p.artifact_hash,client,store.list().map(t=>t.assessment).filter(Boolean));},
    generate: p => {only(p,['task_key','name','trace_ids','snapshot_hash','keep']);const preview=selectionPreview(store,p);
      if(!p.snapshot_hash||p.snapshot_hash!==preview.snapshot_hash)throw Error('SELECTION_CHANGED');
      if(!preview.can_generate)throw Error('NEED_TWO_SELECTED_TRACES');
      const grid=config.gridDemoRelease?.enabled&&p.task_key===GRID_TASK;
      if(grid&&p.name!==GRID_SKILL)throw Error('GRID_SKILL_NAME_REQUIRED');
      return generateCandidate(store,preview.rows,{task_key:p.task_key,name:p.name,workshopRoot:currentRoot,loaderRoots,keep:.9,
        ...(grid?{release:gridGeneration(config.gridDemoRelease,gridWorkspace),inputs:['普通资料 grid_curves：2024年9月匿名日电量与采集事件','受限资料 grid_records：需按用途及时限获批的企业档案与检修演示记录'],
          preconditions:['分别用 gov_read_document 读取 grid_curves 和 grid_records；被拒绝时停止并请求资料授权。','调用 gov_analyze_grid 时只传 period="2024-09"，从工具返回的报告链接交付，不能编造计算结果。'],
          output_format:'用电异常诊断报告、曲线图、来源证据、待核查建议；检修与缺失演示记录明确标注合成。'}:{})});},
    admit: p => { const policy = api.config?.security?.installPolicy?.exec;
      if (!policy?.command || !policy.args?.[0]) throw new Error('combined policy not configured');
      return workshop().admit(p.candidate_id, { command: policy.command, script: policy.args[0], env: policy.env, openclawVersion: '2026.7.1-2' }); } };
  for (const [name, fn] of Object.entries(methods)) api.registerGatewayMethod?.('govagentsec.trace.' + name, async ({ params, respond, client }) => {
    try {
      const {bearer,...p}=params??{};
      const business=name!=='health'?await requireBusinessPermission(bearer,
        ['admit','confirmReview','gridPublish'].includes(name)?'admission.manage':
        ['assign','generate','assessmentStart','assessmentCancel'].includes(name)?'audit.assess':'audit.read'):null;
      if(['assign','generate','admit','confirmReview','gridPublish','assessmentStart','assessmentCancel'].includes(name) && p.pack_id!==undefined)throw Error('HISTORY_READ_ONLY');
      respond(true,await fn(p,client,business));
    } catch(error) {
      if(error.message.startsWith('BUSINESS_'))return respond(false,undefined,{code:error.message,message:'请先到动态权限登录，并确认当前账号有此操作权限。'});
      const messages={ASSESSMENT_BUSY:'本地评估正在进行，请等待完成。',SELECTION_CHANGED:'来源记录已变化，请重新预览筛选结果。',
        NEED_TWO_SELECTED_TRACES:'保留后不足两条合格来源，请补充同任务运行。',CONFIRMED_SAME_TASK_REQUIRED:'请先确认所选运行属于同一任务。',
        HISTORY_READ_ONLY:'历史证据包只读，请回到当前任务操作。',JOB_NOT_FOUND:'评估记录不存在，请检查作业编号。'};
      respond(false, undefined, { code: 'INVALID_REQUEST', message: messages[error.message]??'记录不存在、证据变化、身份不足或参数不完整；未执行安装' });
    }
    }, { scope: ['confirmReview','gridPublish'].includes(name)?'operator.admin':['assign', 'generate', 'admit','assessmentStart','assessmentCancel'].includes(name) ? 'operator.write' : 'operator.read' });
  for (const file of ['view.mjs', 'view-model.mjs', 'usage.mjs']) api.registerHttpRoute({ path: '/plugins/govagentsec/trace/' + file, auth: 'plugin', match: 'exact', handler: async (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return true; }
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(readFileSync(new URL(file, import.meta.url))); return true;
  }});
  return store;
}
