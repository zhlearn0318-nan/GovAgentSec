import test from 'node:test';
import assert from 'node:assert/strict';
import {executeWithResultGuard,registerProtectionRuntime,activateToolResultGate,getProtectionRuntimeSnapshot,PROTECTION_RUNTIME} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/result-gate.mjs';
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
