// Fixed-host hook dispatcher regression; synthetic inputs, no model/network call.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {registerProtectAgent} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/register.mjs';
import {createGuardEventStore} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/guard-events.mjs';
import {registerChatAcl} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/chat-acl.mjs';

const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
assert.equal(JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
const dispatcher=await import(pathToFileURL(path.join(host,'dist/plugins/hook-runner-global.js')));
const {p:wrapTool}=await import(pathToFileURL(path.join(host,'dist/agent-tools.before-tool-call-C95DXQXZ.js')));
const typedHooks=[],store=createGuardEventStore(),checks=[];
const api={id:'protect-agent',config:{plugins:{entries:{'protect-agent':{hooks:{allowConversationAccess:true}}}}},
  logger:{warn(){},info(){},error(){}},registerService(){},registerHttpRoute(){},registerGatewayMethod(){},
  on(hookName,handler,options){typedHooks.push({pluginId:this.id,hookName,handler,...options});}};
registerProtectAgent(api,{config:{projectRoot:process.cwd()},eventStore:store,
  client:{screen:async r=>({decision:r.kind==='tool_call'?'REVIEW':'ALLOW',riskLevel:'LOW'})},sidecarService:{id:'test'}});
let authorize=false,failService=false;
const bridge={request:async method=>{
  if(failService)throw Error('synthetic service failure');
  if(method==='chat_start')return {status:authorize?'ok':'blocked'};
  return {status:'host_authorized'};
}};
registerChatAcl({...api,id:'agentguard-runtime-security'},bridge,{workspaceResolver:async()=>process.cwd()});
dispatcher.initializeGlobalHookRunner({plugins:[],hooks:[],typedHooks});
const runner=dispatcher.getGlobalHookRunner();
const context=id=>({runId:id,sessionKey:'agent:main:approval-regression-'+id,workspaceDir:process.cwd()});
const start=ctx=>runner.runBeforeAgentRun({prompt:'合成审批状态测试',messages:[]},ctx);
const call=ctx=>runner.runBeforeToolCall({toolName:'write',params:{path:'/workspace/test.txt'},toolCallId:'call-'+ctx.runId},ctx);
const protectHook=name=>typedHooks.find(h=>h.pluginId==='protect-agent'&&h.hookName===name).handler;

const denied=context('unbound');await start(denied);
let executions=0;
const tool=wrapTool({name:'write',execute:async()=>{executions++;return {content:[]};}},denied,{emitDiagnostics:false});
const blockedResult=await tool.execute('call-unbound',{path:'/workspace/test.txt'});
assert.equal(blockedResult.details.status,'blocked');
assert.match(JSON.stringify(blockedResult),/P001_CONTRACT_REQUIRED/);
assert.equal(executions,0);
assert.equal(store.snapshot().incident.kind,'task_denied');
assert.equal(store.snapshot().incident.reasonCode,'P001_CONTRACT_REQUIRED');
assert.match(store.snapshot().incident.message,/绑定当前任务/);
await runner.runAgentEnd({messages:[],success:true},denied);
assert.equal(store.snapshot().incident.runEnded,true);
assert.equal(store.snapshot().incident.stopConfirmed,false);
checks.push('real host wrapper: REVIEW then ACL deny executes zero tools; binding hint replaces phantom approval');

authorize=true;
const allowed=context('bound');await start(allowed);
const gate=await call(allowed);
assert.equal(gate.block,undefined);assert.equal(gate.requireApproval.timeoutBehavior,'deny');
assert.equal(store.snapshot().incident.kind,'approval_requested');
assert.equal(store.snapshot().incident.toolCallId,'call-bound');
gate.requireApproval.onResolution('allow-once');assert.equal(store.snapshot().incident,null);
checks.push('authorized call keeps native single-use approval; confirmed allow clears its own warning');

const late=context('late');await start(late);const old=await call(late);
bridge.chatRuns.delete(late.runId);await call(late);
old.requireApproval.onResolution('allow-once');
assert.equal(store.snapshot().incident.kind,'task_denied');
checks.push('late approval callback cannot erase a later ACL denial');

for(const resolution of ['deny','timeout','cancelled']){
  const ctx=context(resolution);await start(ctx);const result=await call(ctx);
  result.requireApproval.onResolution(resolution);
  assert.equal(store.snapshot().incident.kind,'approval_denied');
  assert.equal((await call(ctx)).block,true);
  checks.push(resolution+' remains fail-closed');
}
const ended=context('ended');await start(ended);await call(ended);
await protectHook('agent_end')({},ended);assert.equal(store.snapshot().incident,null);
checks.push('agent_end clears an approval intention that never became a request');

const unavailable=context('unavailable');await start(unavailable);failService=true;await call(unavailable);
assert.equal(store.snapshot().incident.reasonCode,'P012_TASK_POLICY_UNAVAILABLE');
assert.equal(store.snapshot().incident.kind,'task_denied');
checks.push('ACL service failure remains blocked with accurate diagnostic');

const out=process.env.GOV_APPROVAL_EVIDENCE??'local-validation/approval-lifecycle';
fs.mkdirSync(out,{recursive:true});
const report={passed:true,source:'fixed-host-dispatcher-synthetic-inputs',version:'2026.7.1-2',external_requests:0,checks};
fs.writeFileSync(path.join(out,'hook-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
