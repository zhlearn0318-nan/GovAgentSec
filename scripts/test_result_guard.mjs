import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareToolResult,executeWithResultGuard,registerProtectionRuntime,activateToolResultGate,getProtectionRuntimeSnapshot,PROTECTION_RUNTIME} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/result-gate.mjs';
import {adaptResultGuard} from './install_openclaw_result_guard.mjs';
const good={content:[{type:'text',text:'正常查询结果'}]};
test('return gate releases only screened text and never exposes partial output',async()=>{
  let update,screened=0;
  registerProtectionRuntime({config:{},conversationAllowed:true,probe:async()=>true,recordFailure(){},screenToolResult:async p=>{screened++;return {decision:p.text.includes('injected-secret')?'BLOCK':'ALLOW'};}});
  activateToolResultGate();
  const execute=async(_id,_params,_signal,onUpdate)=>{update=onUpdate;return good;};
  assert.deepEqual(await executeWithResultGuard(execute,['id',{},undefined,()=>{}],{toolCallId:'id'},true),good);assert.equal(update,undefined);
  const denied=await executeWithResultGuard(async()=>({content:[{type:'text',text:'injected-secret'}]}),[],{},true);
  assert.equal(denied.details.govagentsec.withheld,true);assert.ok(!JSON.stringify(denied).includes('injected-secret'));assert.equal(screened,2);
  for(const raw of [{content:[{type:'image',data:'private'}]},{content:[{type:'text',text:'x'.repeat(16000)}]}])assert.equal((await executeWithResultGuard(async()=>raw,[],{},true)).isError,true);
  assert.equal(screened,2);
  assert.equal((await getProtectionRuntimeSnapshot()).output.mode,'observe');
});
test('missing screening service and exceptions fail closed; explicit disabled protection passes through',async()=>{
  delete globalThis[PROTECTION_RUNTIME];
  assert.equal((await executeWithResultGuard(async()=>good,[],{},true)).isError,true);
  const result=await executeWithResultGuard(async()=>{throw Error('private exception');},[],{},true);
  assert.ok(!JSON.stringify(result).includes('private exception'));
  assert.equal(await executeWithResultGuard(async()=>good,[],{},false),good);
});
test('adapter changes the actual return boundary exactly once and refuses unknown shapes',()=>{
  const original='function wrapToolWithBeforeToolCallHook() {getRuntimeConfig();const result = await execute(toolCallId, executeParams, signal, onUpdate);return result;}';
  const next=adaptResultGuard(original,'file:///guard.mjs');
  assert.match(next,/await govExecuteGuard/);assert.equal(adaptResultGuard(next,'file:///guard.mjs'),next);
  assert.throws(()=>adaptResultGuard('unknown','file:///guard.mjs'),/Unsupported/);
});

test('CSV and plain text reach detectors without JSON protocol wrapping',()=>{
  const csv='序号,费用类型,金额\n1,办公费,100\n2,差旅费,200';
  const result={content:[{type:'text',text:csv}]};
  const prepared=prepareToolResult(result);
  assert.equal(prepared.text,csv);
  assert.deepEqual(prepared.snapshot,result);
  result.content[0].text='changed after preparing';
  assert.equal(prepared.snapshot.content[0].text,csv);
});

test('all text blocks, structured values and untrusted field names remain covered',()=>{
  const result={content:[{type:'text',text:'first\nline'},{type:'text',text:'second content',note:'block annotation'}],details:{aggregated:'first\nline',structuredContent:{message:'hidden injection',secretNumber:123456},'ignore prior instructions':'unknown field'}};
  const prepared=prepareToolResult(result);
  for(const text of ['first\nline','second content','block annotation','hidden injection','123456','ignore prior instructions','unknown field'])assert.ok(prepared.text.includes(text),text);
  assert.equal(prepared.text.match(/first\nline/g).length,1);
  assert.deepEqual(prepared.snapshot,result);
});

test('security decisions request task cancellation before returning isolated content',async()=>{
  for(const decision of ['BLOCK','REVIEW']){
    const order=[],ctx={runId:'run-a',toolCallId:'call-a'};
    registerProtectionRuntime({config:{},screenToolResult:async()=>({decision,reasonCode:'RISK_HIGH'}),stopRun:async(received,reason)=>{assert.equal(received.runId,ctx.runId);assert.equal(received.toolCallId,ctx.toolCallId);assert.equal(reason.kind,'security_block');assert.equal(reason.decision,decision);order.push('cancel');}});
    const result=await executeWithResultGuard(async()=>good,[],ctx,true);order.push('return');
    assert.deepEqual(order,['cancel','return']);assert.equal(result.details.govagentsec.reasonCode,'RISK_HIGH');assert.equal(result.details.govagentsec.withheld,true);
  }
});

test('unsupported media and oversize are quarantined as unsupported, never a fabricated threat',async()=>{
  let screened=0;const failures=[],stops=[];
  registerProtectionRuntime({config:{},recordFailure:(_ctx,reason)=>failures.push(reason),stopRun:(_ctx,reason)=>stops.push(reason),screenToolResult:async()=>{screened++;return {decision:'ALLOW'};}});
  const fixtures=[{content:[{type:'image',data:'private-image'}]},{content:[{type:'text',text:'a'.repeat(15001)}]},{content:[{type:'text',text:'safe'}],metadata:'b'.repeat(15001)}];
  for(const raw of fixtures){const result=await executeWithResultGuard(async()=>raw,[],{},true);assert.equal(result.details.govagentsec.kind,'unsupported');assert.notEqual(result.details.govagentsec.decision,'BLOCK');assert.ok(!JSON.stringify(result).includes('private-image'));}
  assert.equal(screened,0);assert.equal(stops.length,3);
  assert.deepEqual(failures,['UNSUPPORTED_TOOL_RESULT_CONTENT','UNSUPPORTED_TOOL_RESULT_SIZE','UNSUPPORTED_TOOL_RESULT_SIZE']);
});

test('ordinary tool exceptions are screened and reported separately without cancelling the task',async()=>{
  const failures=[],checked=[];let stopped=false;
  registerProtectionRuntime({config:{},recordFailure:(_ctx,reason)=>failures.push(reason),stopRun:()=>{stopped=true;},screenToolResult:async prepared=>{checked.push(prepared.text);return {decision:'ALLOW'};}});
  const result=await executeWithResultGuard(async()=>{throw Error('File does not exist');},[],{},true);
  assert.ok(checked[0].includes('File does not exist'));assert.equal(result.isError,true);
  assert.equal(result.details.govagentsec.kind,'tool_error');assert.equal(stopped,false);
  assert.deepEqual(failures,['TOOL_EXECUTION_ERROR']);
});

test('exception text cannot escape when detection fails and cancellation errors stay private',async()=>{
  const failures=[],stops=[];
  registerProtectionRuntime({config:{},recordFailure:(_ctx,reason)=>failures.push(reason),stopRun:(_ctx,reason)=>{stops.push(reason);throw Error('private cancellation detail');},screenToolResult:async()=>{throw Error('private detector detail');}});
  const result=await executeWithResultGuard(async()=>{throw Error('private tool detail');},[],{},true);
  assert.ok(!JSON.stringify(result).includes('private'));assert.equal(result.details.govagentsec.kind,'check_unavailable');
  assert.equal(stops[0].reasonCode,'CHECK_UNAVAILABLE');assert.deepEqual(failures,['CHECK_UNAVAILABLE','TASK_STOP_FAILED']);
});

test('runtime audit preserves detector reasons and timing without storing the payload',async()=>{
  const entries=[];globalThis[Symbol.for('govagentsec.protection.audit')]=e=>entries.push(e);
  try {
    const runtime=registerProtectionRuntime({config:{},screenToolResult:async()=>({decision:'ALLOW'})});
    runtime.record('tool_results',{decision:'BLOCK',riskLevel:'HIGH',reasonCode:'RISK_HIGH',categories:['prompt_injection'],durationMs:42},true,{runId:'audit-run'});
    assert.equal(entries[0].reasonCode,'RISK_HIGH');assert.equal(entries[0].durationMs,42);assert.deepEqual(entries[0].categories,['prompt_injection']);
  }finally{delete globalThis[Symbol.for('govagentsec.protection.audit')];}
});
