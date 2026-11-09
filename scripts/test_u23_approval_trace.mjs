import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {TraceStore} from '../modules/govagentsec-trace/store.mjs';
import {appendNativeApproval,NATIVE_APPROVAL} from '../modules/govagentsec-trace/native-approval.mjs';
import {traceGraph,nodePresentation} from '../modules/govagentsec-trace/view-model.mjs';
import {DemoIdentityBridge} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';

test('real audit annotations append without changing history; exact edges, no duplicate or invented parent',t=>{
 const root=fs.mkdtempSync(path.resolve('local-validation/u23-trace-unit-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const store=new TraceStore(root),run='run-original',session='agent:main:trace';
 store.append({trace_id:run,event_type:'run.started',session_key:session});
 const tool=store.append({trace_id:run,event_type:'tool.started',tool_call_id:'call',payload:{tool:'read'}});
 const before=fs.readFileSync(store.file(run),'utf8');
 const entry={audit_id:'a'.repeat(32),timestamp:new Date().toISOString(),event_type:'approval.requested',run_id:run,
  origin_run_id:run,session_key:session,request_id:'req',task_id:'task',tool_call_id:'call',tool:'read',status:'pending_approval',actor_roles:['office_user']};
 const requested=appendNativeApproval(store,entry);assert(requested.captured);
 assert(fs.readFileSync(store.file(run),'utf8').startsWith(before));
 assert.equal(appendNativeApproval(store,entry).event_id,requested.event_id);
 appendNativeApproval(store,{...entry,audit_id:'b'.repeat(32),event_type:'approval.approved',status:'authorized'});
 let trace=store.read(run);assert(trace.integrity.valid);assert.equal(trace.events.length,4);
 assert.equal(trace.events[2].parent_event_id,tool.event_id);assert.equal(trace.events[3].parent_event_id,requested.event_id);
 const graph=traceGraph(trace);assert.equal(graph.nodes.at(-1).state,'approved');assert.match(nodePresentation(graph.nodes.at(-1)).title,/批准本次重试/);
 store.append({trace_id:'retry',event_type:'run.started',session_key:session});
 appendNativeApproval(store,{...entry,run_id:'retry',audit_id:'c'.repeat(32),event_type:'approval.execution',status:'succeeded'});
 trace=store.read('retry');assert(trace.integrity.valid);assert.equal(trace.events.at(-1).parent_event_id,null);
 assert.equal(trace.events.at(-1).payload.origin_run_id,run);assert.equal(traceGraph(trace).nodes.at(-1).state,'normal');
 assert(!appendNativeApproval(store,{...entry,run_id:'missing'}).captured);assert(store.failures.length);
 assert(!fs.existsSync(store.file('missing')));
});

test('missing/failed capture is surfaced without altering the authorization response',()=>{
 const old=globalThis[NATIVE_APPROVAL];delete globalThis[NATIVE_APPROVAL];
 try{
  const bridge=new DemoIdentityBridge();bridge.traceCapture={captured:0,failed:0};
  bridge.captureApprovals({trace_events:[{}]});assert.equal(bridge.traceCapture.failed,1);
  globalThis[NATIVE_APPROVAL]=()=>{throw Error('disk failure');};
  bridge.captureApprovals({trace_events:[{}],trace_projection_failed:true});assert.equal(bridge.traceCapture.failed,3);
 }finally{if(old)globalThis[NATIVE_APPROVAL]=old;else delete globalThis[NATIVE_APPROVAL];}
});
