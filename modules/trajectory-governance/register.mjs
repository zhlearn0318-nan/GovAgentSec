import path from 'node:path';
import { TraceStore, digest } from './trace-store.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { TaskLinks } from './task-links.mjs';
import { renderTrajectoryPanel } from './panel.mjs';
import { LegacyReader } from '../govagentsec-trace/legacy-reader.mjs';
import { renderWelcomePage } from '../govagentsec-ui/welcome.mjs';
import {requireBusinessPermission} from '../agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';

export function registerTrajectory(api) {
  const config = api.pluginConfig ?? {};
  if (!config.dataDir) throw new Error('trajectory dataDir is required');
  api.registerHttpRoute({path:'/plugins/govagentsec/welcome',auth:'plugin',match:'exact',handler:async(req,res)=>{
    if(req.method!=='GET'){res.writeHead(405,{Allow:'GET'});res.end();return true;}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"});
    res.end(renderWelcomePage());return true;
  }});
  const legacyStore = new TraceStore(path.join(config.dataDir, 'traces'));
  const traceConfig = api.config?.plugins?.entries?.['govagentsec-trace'];
  const store = traceConfig?.enabled && traceConfig.config?.dataDir
    ? new LegacyReader(legacyStore, path.join(traceConfig.config.dataDir, 'traces')) : legacyStore;
  api.session?.controls?.registerControlUiDescriptor({
    surface: 'tab', id: 'history', label: '历史调用轨迹',
    description: '历史任务、模型与工具调用关系图', icon: 'activity',
    group: 'control', order: 21, requiredScopes: ['operator.read'],
    path: '/plugins/govagentsec/trajectory-panel',
  });
  for (const [url, file] of [['trajectory-ui.mjs', 'ui.mjs'], ['graph.mjs', 'graph.mjs'], ['trajectory-native.mjs', 'native-view.mjs'], ['workbench.mjs', 'workbench.mjs'], ['workspace.mjs', '../govagentsec-ui/workspace.mjs'], ['library-summary.mjs', '../govagentsec-ui/library-summary.mjs'], ['demo-identity.mjs', '../govagentsec-ui/demo-identity.mjs'], ['identity-session.mjs', '../govagentsec-ui/identity-session.mjs'], ['task-context.mjs', '../govagentsec-ui/task-context.mjs'], ['shell.mjs', '../govagentsec-ui/shell.mjs'], ['workspace-style.mjs', '../govagentsec-ui/workspace-style.mjs'], ['security-overview.mjs', '../govagentsec-ui/security-overview.mjs']]) {
    api.registerHttpRoute({ path: '/plugins/govagentsec/' + url, auth: 'plugin', match: 'exact', handler: async (req, res) => {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return true; }
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(readFileSync(new URL(file, import.meta.url))); return true;
    }});
  }
  const tasks = new TaskLinks(store, api.config ?? {});
  const failures = new Set();
  const captureEnabled = api.config?.plugins?.entries?.['govagentsec-trace']?.enabled !== true;
  globalThis[Symbol.for('govagentsec.protection.audit')] = entry => {
    if (!captureEnabled) return;
    if (!entry.runId) return;
    try {
      store.append({event_type:'protection.'+entry.phase,run_id:entry.runId,seal:false,
        session_key:entry.sessionKey??null,session_id:entry.sessionId??null,tool_call_id:entry.toolCallId,
        payload:{decision:entry.decision,enforced:entry.enforced,riskLevel:entry.riskLevel,at:entry.at,
          reasonCode:entry.reasonCode,categories:entry.categories,duration_ms:entry.durationMs,tool_execution_ms:entry.executionMs},
      });
    } catch(error) {failures.add(entry.runId);api.logger.warn('Protection audit capture failed: '+error.message);}
  };
  const record = (type, payload) => (event, ctx = {}) => {
    if (!captureEnabled) return;
    const runId = event.runId ?? ctx.runId;
    try {
      const saved = store.append({ event_type: type, run_id: runId, seal: false,
        session_key: ctx.sessionKey ?? null, session_id: ctx.sessionId ?? null,
        capture_status: failures.has(runId) ? 'partial' : 'complete',
        tool_call_id: event.toolCallId ?? ctx.toolCallId,
        model_call_id: event.callId, payload: {...payload(event), ...(type==='tool.started'?{capability:tasks.capability(event.toolName)}:{})},
      });
      if (type === 'run.ended' || type === 'model.output') {
        const { events, manifest } = store.read(saved.trace_id);
        const blockedInput=events.some(e=>e.event_type==='protection.input'&&e.payload?.enforced===true&&e.payload?.decision!=='ALLOW');
        if (!manifest && events.some(e => e.event_type === 'run.ended') && (blockedInput || events.some(e => e.event_type === 'model.output'))) store.seal(saved.trace_id);
      }
      if (type === 'run.ended') failures.delete(runId);
    } catch (error) {
      if (runId) failures.add(runId);
      // Observation must not alter a runtime guard's verdict. The capture failure
      // is logged; incomplete/invalid runs are ineligible for experience selection.
      api.logger.warn(`GovAgentSec trace capture failed: ${error.message}`);
    }
  };
  api.on('before_agent_run', record('run.started', e => ({ prompt: e.prompt ?? null })), { priority: 110 });
  api.on('model_call_started', record('model.started', e => ({ model: e.model, provider: e.provider })));
  api.on('model_call_ended', record('model.ended', e => ({ outcome: e.outcome, duration_ms: e.durationMs, error: e.errorCategory ?? null })));
  api.on('before_tool_call', record('tool.started', e => ({ tool: e.toolName, params: e.params })), { priority: 110 });
  api.on('after_tool_call', record('tool.ended', e => ({ tool: e.toolName, result: e.result ?? null, error: e.error ?? null, duration_ms: e.durationMs ?? null })));
  api.on('llm_output', record('model.output', e => ({ texts: e.assistantTexts, usage: e.usage ?? null })));
  api.on('agent_end', record('run.ended', e => ({ success: e.success, error: e.error ?? null, duration_ms: e.durationMs ?? null })));
  api.registerHttpRoute({ path: '/plugins/govagentsec/trajectories', auth: 'gateway', match: 'exact', handler: async (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return true; }
    try {
      await requireBusinessPermission(req.headers?.['x-gov-business-bearer'],'audit.read');
      const id = new URL(req.url, 'http://localhost').searchParams.get('trace_id');
      const data = id ? store.read(id) : { traces: store.list() };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    } catch(error) {
      res.writeHead(error.message.startsWith('BUSINESS_')?401:400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '需要有效业务身份，或记录不可读取' }));
    }
    return true;
  }});
  const listCandidates = () => {
    const root = path.join(config.dataDir, 'candidates');
    const candidates = existsSync(root) ? readdirSync(root).filter(id => /^[a-f0-9-]{36}$/.test(id)).map(id => {
      try {
        const candidate = JSON.parse(readFileSync(path.join(root, id, 'candidate.json'), 'utf8'));
        const content = readFileSync(path.join(root, id, 'bundle', 'SKILL.md'), 'utf8');
        if (candidate.id !== id || digest(content) !== candidate.artifact_hash || readdirSync(path.join(root, id, 'bundle')).join(',') !== 'SKILL.md') return { id, name: candidate.name, status: 'unverified', reason: 'candidate_artifact_changed' };
        return candidate;
      }
      catch { return { id, status: 'unverified', reason: 'candidate_record_unreadable' }; }
    }) : [];
    return { candidates };
  };
  for (const [name, read] of Object.entries({ list: params => ({ traces: store.list().filter(t => !params.session_key || t.session_key === params.session_key) }), detail: params => store.read(params.trace_id), candidates: listCandidates, task: params => tasks.detail(params), status: () => tasks.status(), workspace: () => tasks.workspace() })) {
    api.registerGatewayMethod?.('govagentsec.trajectory.' + name, async ({ params, respond }) => {
      try {
        const {bearer,...p}=params??{};
        if(name==='workspace'&&!bearer){
          const data=await tasks.workspace();
          return respond(true,{coverage:data.coverage,pending:[],traces:[],servers:[],total:0});
        }
        await requireBusinessPermission(bearer,name==='workspace'?'workspace.read':'audit.read');
        respond(true, await read(p));
      }
      catch(error) { respond(false, undefined, { code:error.message.startsWith('BUSINESS_')?error.message:'INVALID_REQUEST', message: '请确认业务身份有效且记录可读。' }); }
    }, { scope: 'operator.read' });
  }
  api.registerGatewayMethod?.('govagentsec.trajectory.resolve', async ({params, respond}) => {
    try {const {bearer,...p}=params??{};await requireBusinessPermission(bearer,'admission.manage');respond(true, await tasks.resolve(p));} catch (error) { respond(false, undefined, {code:'INVALID_REQUEST',message:'身份或操作权限不足，未处理。'}); }
  }, {scope:'operator.approvals'});
  api.registerHttpRoute({ path: '/plugins/govagentsec/candidates', auth: 'gateway', match: 'exact', handler: async (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return true; }
    try{await requireBusinessPermission(req.headers?.['x-gov-business-bearer'],'audit.read');}catch{res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'请先到动态权限登录'}));return true;}
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(listCandidates())); return true;
  }});
  // Static shell is public; all audit data remains behind gateway authentication.
  api.registerHttpRoute({ path: '/plugins/govagentsec/trajectory-panel', auth: 'plugin', match: 'exact', handler: async (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405, { Allow: 'GET' }); res.end(); return true; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'" });
    res.end(renderTrajectoryPanel()); return true;
  }});
  return store;
}
