// Installed OpenClaw dispatcher + actual local JWT/OPA/ticket worker.
// Synthetic user turns; no provider call. Native execution is an instrumented
// real filesystem read, not a claim of model/chat E2E.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {DemoIdentityBridge} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';
import {registerChatAcl,workspacePath,hostWorkspace} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/chat-acl.mjs';

const out=path.resolve(process.env.GOV_ACL_FULL_EVIDENCE??'local-validation/identity-task-acl-full/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const report={passed:false,source:'installed-host-dispatcher-real-local-oidc-opa-ticket',
  synthetic_turns:true,provider_e2e:false,production_oidc:false,external_requests:0,checks:[]};
const config={agents:{defaults:{sandbox:{mode:'all',backend:'docker',scope:'session',workspaceAccess:'none',workspaceRoot:path.join(out,'workspaces')}}}};
const ctx={runId:'u11-run-a',sessionKey:'agent:main:u11-test',workspaceDir:path.join(out,'agent-workspace')};
const workspace=await hostWorkspace(config,ctx);
for(const dir of ['A','B']){fs.mkdirSync(path.join(workspace,dir),{recursive:true});fs.writeFileSync(path.join(workspace,dir,'test.txt'),'合成数据 '+dir);}
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
assert.equal(JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
const dispatcher=await import(pathToFileURL(path.join(host,'dist/plugins/hook-runner-global.js')));
const bridge=new DemoIdentityBridge({root:path.join(out,'worker')});
const typedHooks=[];
registerChatAcl({config,on:(hookName,handler,options)=>typedHooks.push({pluginId:'agentguard-runtime-security',hookName,handler,...options})},bridge);
dispatcher.initializeGlobalHookRunner({plugins:[],hooks:[],typedHooks});
const runner=dispatcher.getGlobalHookRunner();
let reads=0;
const call=async(name,params,context=ctx)=>{
  const event={toolName:name,params,runId:context.runId,toolCallId:'u11-call'};
  const gate=await runner.runBeforeToolCall(event,context);
  if(!gate?.block&&name==='read'){
    reads++;fs.readFileSync(path.join(workspace,params.path.replace('/workspace/','')));
    await runner.runAfterToolCall({...event,result:{isError:false}},context);
  }
  return gate;
};
const check=(id,detail={})=>report.checks.push({id,passed:true,...detail,read_count:reads});
let requestBearer;
const requests=async()=> (await bridge.request('status',{},requestBearer)).requests;
try{
  assert((await call('read',{path:'/workspace/A/test.txt'})).block);assert.equal(reads,0);
  check('no-scope-fail-closed');
  await bridge.request('enable');
  const office='Bearer '+(await bridge.request('login',{user:'office-test'})).access_token;
  const approver='Bearer '+(await bridge.request('login',{user:'approver-test'})).access_token;
  requestBearer=approver;
  assert.deepEqual((await bridge.request('status')).requests,[]);
  assert.equal((await bridge.request('bind_session',{session_key:ctx.sessionKey},office)).status,'ok');
  await runner.runBeforeAgentRun({prompt:'读取 /workspace/A/test.txt',messages:[]},ctx);
  const state=await bridge.request('status',{},office),contract=state.tasks.at(-1);
  assert(contract.task_id.startsWith('chat-acl-'));assert.match(contract.scope_digest,/^[0-9a-f]{64}$/);
  check('chat-scope-auto',{task_id:contract.task_id,scope_digest:contract.scope_digest});
  assert(!((await call('read',{path:'/workspace/A/test.txt'}))?.block));assert.equal(reads,1);check('native-read-allow');
  assert((await call('read',{path:'/workspace/B/test.txt'})).block);assert.equal(reads,1);
  const denied=(await requests()).at(-1);assert.equal(denied.reason_code,'P014_RESOURCE_OUTSIDE_TASK');check('native-read-deny');
  assert.equal((await bridge.request('task_escalate',{request_id:denied.request_id},office)).status,'pending_approval');
  assert.equal((await bridge.request('resolve',{request_id:denied.request_id,resolution:'approve'},office)).reason_code,'D105_SELF_APPROVAL');
  assert.equal(reads,1);check('self-approve-deny');
  assert.equal((await bridge.request('resolve',{request_id:denied.request_id,resolution:'approve'},approver)).status,'authorized');
  assert.equal(reads,1);check('approve-does-not-read');
  // A new user turn must not silently inherit the old base scope. Only the
  // exact saved, approved action may use its old task's signed one-use ticket.
  await runner.runAgentEnd({runId:ctx.runId,success:true,messages:[]},ctx);
  const originalRoot=config.agents.defaults.sandbox.workspaceRoot;
  config.agents.defaults.sandbox.workspaceRoot=path.join(out,'changed-workspaces');
  fs.mkdirSync(await hostWorkspace(config,ctx),{recursive:true});
  ctx.runId='u11-run-different-workspace';
  await runner.runBeforeAgentRun({prompt:'重试原动作',messages:[]},ctx);
  assert((await call('read',{path:'/workspace/B/test.txt'})).block);assert.equal(reads,1);
  check('workspace-switch-reject');
  await runner.runAgentEnd({runId:ctx.runId,success:true,messages:[]},ctx);
  config.agents.defaults.sandbox.workspaceRoot=originalRoot;
  ctx.runId='u11-run-retry';
  await runner.runBeforeAgentRun({prompt:'重试刚批准的原动作',messages:[]},ctx);
  assert((await call('read',{path:'/workspace/B/test.txt',offset:99})).block);assert.equal(reads,1);check('tampered-parameters-deny');
  const concurrent=await Promise.all([call('read',{path:'/workspace/B/test.txt'}),call('read',{path:'/workspace/B/test.txt'})]);
  assert.equal(concurrent.filter(r=>!r?.block).length,1);assert.equal(reads,2);check('approve-once');check('replay-reject');
  for(const name of ['write','edit','exec','process','web_fetch','web_search','browser','apply_patch','sessions_spawn','unknown']){
    assert((await call(name,name==='write'||name==='edit'?{path:'/workspace/B/test.txt',content:'fixture'}:{command:'echo synthetic',url:'https://example.invalid'})).block,name);
  }
  assert.equal(reads,2);check('write-exec-network-delegation-deny');
  for(const p of ['../B/test.txt','/workspace/A/../B/test.txt','C:/Windows/test','/etc/passwd','/workspace/A/%2e%2e/test'])assert.throws(()=>workspacePath(p,workspace));
  fs.symlinkSync(path.join(workspace,'B'),path.join(workspace,'A','link'),'junction');
  assert.throws(()=>workspacePath('/workspace/A/link/test.txt',workspace));
  fs.unlinkSync(path.join(workspace,'A','link'));check('traversal-symlink-deny');
  const notify='agentguard-notices__submit_emergency_notice';
  assert((await call(notify,{recipient:'duty_office',template_id:'typhoon_notice'})).block);
  assert.equal((await requests()).at(-1).reason_code,'P015_TOOL_OUTSIDE_TASK');check('notify-under-contract');
  assert((await call('agentguard-notices__read_gov_document',{document_id:'command_contacts'})).block);
  assert((await requests()).at(-1).policy_reason_codes.includes('D004_CLEARANCE_INSUFFICIENT'));check('opa-hard-deny-retained');
  assert.equal((await bridge.request('status',{},office)).tasks.find(t=>t.task_id===contract.task_id).scope_digest,contract.scope_digest);
  await bridge.request('disable');assert((await call('read',{path:'/workspace/A/test.txt'})).block);assert.equal(reads,2);check('disable-revokes');
  report.passed=true;
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{
  await bridge.request('disable');dispatcher.resetGlobalHookRunner();
  fs.writeFileSync(path.join(out,'hook-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,report:path.join(out,'hook-report.json'),checks:report.checks.length,error:report.error}));
}
