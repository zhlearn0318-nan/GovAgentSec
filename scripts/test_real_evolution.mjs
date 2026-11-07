import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { inspectEvolutionTrace,DOC_TOOL,NOTICE_TOOL } from './lib/real_evolution.mjs';
import { contentEvidence } from '../modules/govagentsec-trace/privacy.mjs';
import { selectTopK } from '../modules/govagentsec-trace/scoring.mjs';
import { commonSequence } from '../modules/govagentsec-trace/evolution.mjs';

function example(kind='success'){
 const root=mkdtempSync(path.join(os.tmpdir(),'real-evolution-test-')),events=[];
 const add=(type,payload,extra={})=>{const e={event_id:'e'+events.length,event_hash:String(events.length).padStart(64,'0'),sequence:events.length+1,event_type:type,payload,...extra};events.push(e);return e;};
 add('run.started',{});add('model.started',{provider:'ollama'});
 function tool(name,params,failed=false,request=true){
  const call='call'+events.length,start=add('tool.started',{tool:name,params:contentEvidence(params)},{tool_call_id:call});
  const id='mcp-req-'+String(events.length).padStart(32,'0');
  const e=add('tool.ended',{tool:name,failed,control_status:failed?'blocked':'executed_isolated',correlation_verified:request},{tool_call_id:call,request_id:request?id:null,task_id:'task'});
  if(request)writeFileSync(path.join(root,id+'.json'),JSON.stringify({control_request_id:id,request:{request_id:id,task_id:'task',action:{tool:name===DOC_TOOL?'file.read':'database.query',parameters:params}},
    status:failed?'blocked':'executed_isolated',executed:!failed,policy_reason_codes:failed?['D004_CLEARANCE_INSUFFICIENT']:[],receipt:failed?null:{business_result:{adapter:'local'}}}));
  return e;
 }
 if(kind==='recovery')tool(NOTICE_TOOL,{limit:0},true,false);
 if(kind==='d004'){const e=tool(DOC_TOOL,{document_id:'command_contacts'},true);add('protection.agentguard',{enforced:true,decision:'BLOCK'},{request_id:e.request_id});}
 else{tool(DOC_TOOL,{document_id:'emergency_plan'});tool(NOTICE_TOOL,{limit:1});}
 add('run.ended',{});add('model.output',{provider:'ollama'});
 const trace={events,integrity:{valid:true},summary:{trace_id:'test',trace_status:kind==='d004'?'blocked':'complete',source:'openclaw',metrics:{success:true}}};
 return{root,trace};
}
for(const kind of ['success','recovery','d004'])test('verifies '+kind+' from exact metadata and trusted request joins',()=>{
 const {root,trace}=example(kind);try{const r=inspectEvolutionTrace(trace,root);assert.equal(r.kind,kind);assert.equal(r.eligible,true);
 if(kind==='recovery')assert.equal(r.recovery.same_parameters,false);if(kind==='d004')assert.equal(r.d004.read_count_measured,false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('missing joins, foreign model, wrong parameters and extra tools cannot qualify',()=>{
 for(const mutate of [
  t=>{t.events.find(e=>e.event_type==='tool.ended').request_id=null;},
  t=>{t.events.find(e=>e.event_type==='model.started').payload.provider='external';},
  t=>{t.events.find(e=>e.event_type==='tool.started').payload.params=contentEvidence({document_id:'wrong'});},
  t=>{t.events.push({event_type:'tool.started',payload:{tool:'exec'}});},
  t=>{t.integrity.valid=false;},
  t=>{t.events=t.events.filter(e=>e.event_type!=='run.started');},
  t=>{t.events=t.events.filter(e=>e.event_type!=='model.output');},
 ]){const {root,trace}=example();try{mutate(trace);assert.equal(inspectEvolutionTrace(trace,root).eligible,false);}finally{rmSync(root,{recursive:true,force:true});}}
});

test('host schema orphan is reported as recovery evidence, never repaired into a complete trace',()=>{
 const {root,trace}=example('recovery');
 try{
  const failure=trace.events.find(e=>e.event_type==='tool.ended'&&e.payload.failed);
  trace.events=trace.events.filter(e=>!(e.event_type==='tool.started'&&e.tool_call_id===failure.tool_call_id));
  trace.summary.trace_status='partial';
  const result=inspectEvolutionTrace(trace,root);
  assert.equal(result.kind,'recovery');assert.equal(result.recovery.failed_start_observed,false);
  assert.equal(trace.summary.trace_status,'partial');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('keep=0.9 includes missing Q in safe denominator and does not select all',()=>{
 const rows=Array.from({length:5},(_,i)=>({trace_id:String(i),task_key:'t',task_confirmed:true,safety:{decision:'pass'},quality:{Q:i===4?null:.95,status:i===4?'missing':'computed'}}));
 rows.push({trace_id:'blocked',task_key:'t',task_confirmed:true,safety:{decision:'quarantine',reason:'enforced_security_block'},quality:{Q:null}});
 const result=selectTopK(rows,'t',{keep:.9});assert.equal(result.denominator,5);assert.equal(result.requested_count,4);assert.equal(result.selected.length,4);
 assert.equal(result.decisions.find(x=>x.trace_id==='4').reason,'quality_missing');
 assert.deepEqual(commonSequence([DOC_TOOL,NOTICE_TOOL],[NOTICE_TOOL,DOC_TOOL,NOTICE_TOOL]),[DOC_TOOL,NOTICE_TOOL]);
});
