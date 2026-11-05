import {readFileSync,readdirSync,writeFileSync} from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {registerProtectAgent} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/register.mjs';
import {createGuardEventStore} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/guard-events.mjs';
const root=path.join(process.env.APPDATA,'npm/node_modules/openclaw/dist');
const host=await import(pathToFileURL(path.join(root,'plugin-sdk/agent-harness-runtime.js')));
const file=readdirSync(root).find(n=>/^agent-tools.before-tool-call-.*\.js$/.test(n));const {p:wrap}=await import(pathToFileURL(path.join(root,file)));
const store=createGuardEventStore(),hooks={},controller=new AbortController();let aborted=0,executed=0;
const ctx={runId:'probe-gov-stop-run',sessionId:'probe-gov-stop-session',sessionKey:'probe-gov-stop-key',config:{plugins:{entries:{'protect-agent':{enabled:true,hooks:{allowConversationAccess:true}}}}}};
registerProtectAgent({id:'protect-agent',config:ctx.config,logger:{warn(){}},on(n,h){hooks[n]=h},registerService(){},registerHttpRoute(){}},{config:{projectRoot:process.cwd(),highImpactTools:[]},eventStore:store,sidecarService:{},client:{screen:async r=>({decision:r.kind==='tool_result'?'BLOCK':'ALLOW',riskLevel:'HIGH',reasonCode:'SYNTHETIC_ATTACK',durationMs:1})},stopRun:c=>host.abortAgentHarnessRun(c.sessionId,{reason:'protect-agent-policy'})});
host.setActiveEmbeddedRun(ctx.sessionId,{runId:ctx.runId,isAbortable:()=>true,isStreaming:()=>true,isCompacting:()=>false,abort(){aborted++;controller.abort()}},ctx.sessionKey);
try {await hooks.before_agent_run({prompt:'synthetic host lifecycle test'},ctx);const tool=wrap({name:'read',description:'inert test',parameters:{},execute:async()=>{executed++;return {content:[{type:'text',text:'synthetic unsafe result'}]}}},ctx,{emitDiagnostics:false});
const result=await tool.execute('probe-call',{},controller.signal);assert.equal(result.details.govagentsec.withheld,true);assert.equal(aborted,1);assert.ok(controller.signal.aborted);
assert.equal((await hooks.before_tool_call({toolName:'exec',params:{}},ctx)).block,true);assert.equal(executed,1);assert.equal(store.snapshot().incident.stopConfirmed,false);hooks.agent_end({success:false},ctx);assert.equal(store.snapshot().incident.stopConfirmed,true);
console.log(JSON.stringify({passed:true,actualHostCancellation:true,signalAborted:true,nextToolDenied:true,confirmedAfterAgentEnd:true}));
}finally{host.clearActiveEmbeddedRun(ctx.sessionId)}
