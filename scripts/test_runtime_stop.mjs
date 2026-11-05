import test from 'node:test';import assert from 'node:assert/strict';
import {registerProtectAgent} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/register.mjs';
import {createGuardEventStore} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/guard-events.mjs';
import {executeWithResultGuard} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/result-gate.mjs';
function setup(screen,stopRun){const hooks={};const store=createGuardEventStore();registerProtectAgent({id:'protect-agent',config:{plugins:{entries:{'protect-agent':{hooks:{allowConversationAccess:true}}}}},logger:{warn(){}},on(n,h){hooks[n]=h},registerHttpRoute(){},registerService(){}},{config:{projectRoot:process.cwd(),highImpactTools:[]},client:{screen},eventStore:store,sidecarService:{},stopRun});return {hooks,store};}
test('tool BLOCK requests actual cancellation, stops subsequent tools and confirms only at agent end',async()=>{
let cancelled=0;const {hooks,store}=setup(async r=>({decision:r.kind==='tool_result'?'BLOCK':'ALLOW',riskLevel:r.kind==='tool_result'?'HIGH':'LOW',reasonCode:'TEST',durationMs:12}),ctx=>{assert.equal(ctx.sessionId,'session-stop');cancelled++;return true});
const ctx={runId:'run-stop',sessionId:'session-stop',sessionKey:'session-key'};
await hooks.before_agent_run({prompt:'ordinary task'},ctx);
const result=await executeWithResultGuard(async()=>({content:[{type:'text',text:'fixture'}]}),['call',{},undefined],{...ctx,toolCallId:'call'},true);
assert.equal(result.details.govagentsec.withheld,true);assert.equal(cancelled,1);assert.equal(store.snapshot().incident.stopConfirmed,false);
assert.equal((await hooks.before_tool_call({toolName:'exec',params:{}},ctx)).block,true);
hooks.agent_end({success:false},ctx);assert.equal(store.snapshot().incident.stopConfirmed,true);
});
test('ordinary execution exception is screened, reported as tool_error and does not cancel',async()=>{
let cancelled=0;const {hooks,store}=setup(async()=>({decision:'ALLOW',riskLevel:'LOW'}),()=>{cancelled++;return true});const ctx={runId:'run-error',sessionId:'s'};await hooks.before_agent_run({prompt:'normal'},ctx);
const result=await executeWithResultGuard(async()=>{throw Error('file missing')},['call',{}],ctx,true);assert.equal(result.isError,true);assert.equal(cancelled,0);assert.equal(store.snapshot().incident.kind,'tool_error');assert.equal(store.snapshot().status,'running');
});

test('approval wait is visible; timeout cancels instead of retrying',async()=>{
let cancelled=0;const {hooks,store}=setup(async()=>({decision:'REVIEW',riskLevel:'MEDIUM'}),()=>{cancelled++;return true});const ctx={runId:'run-approval',sessionId:'s'};
// Start an admitted run, then exercise the tool approval boundary directly.
store.beginRun(ctx.runId);
const pending=await hooks.before_tool_call({toolName:'exec',params:{}},ctx);
assert.equal(store.snapshot().incident.kind,'approval_pending');assert.equal(store.snapshot().status,'running');
pending.requireApproval.onResolution('timeout');assert.equal(cancelled,1);assert.equal(store.snapshot().incident.reasonCode,'APPROVAL_TIMEOUT');
assert.equal((await hooks.before_tool_call({toolName:'exec',params:{}},ctx)).block,true);
});
