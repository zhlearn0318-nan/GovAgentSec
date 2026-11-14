import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { TraceStore } from '../store.mjs';
import { assess,FixtureJudge } from '../scoring.mjs';
import { HeuristicLocalJudge,OllamaLocalJudge,observeTrace,makeLocalJudge,HEURISTIC_VERSION } from '../local-judges.mjs';
import { createCalibrationFixtures,CALIBRATION_VERSION } from '../calibration-fixtures.mjs';
import { RULE_VERSION } from '../privacy.mjs';

const root=mkdtempSync(path.join(os.tmpdir(),'judge-calibration-test-'));
const store=new TraceStore(path.join(root,'traces')),fixtures=createCalibrationFixtures(store);
const trace=id=>store.read('calibration-'+id);
const config={t_star:.75,calibration_version:CALIBRATION_VERSION,calibrated:false};
test.after(()=>rmSync(root,{recursive:true,force:true}));

test('nine local synthetic cases separate safety and quality with matching evidence hashes',async()=>{
  const judge=new HeuristicLocalJudge({allowSynthetic:true});
  const rows=[];
  for(const f of fixtures){const row=await assess(store.read(f.trace_id),judge,config);rows.push(row);
    assert.equal(row.evidence_hash,f.evidence_hash);assert.equal(row.safety.decision,f.expected);assert.equal(row.test_only,true);}
  assert.equal(rows.filter(r=>r.safety.decision==='pass').length,5);
  assert.equal(rows.filter(r=>r.safety.decision==='quarantine').length,4);
  assert.equal(rows[3].quality.Q,.55);assert.equal(rows[4].quality.Q,.5);assert.equal(rows[8].quality.Q,null);
});
test('N counts strict pairs; different inputs and necessary recovery are not duplicate reads',()=>{
  for(const id of ['normal_public','normal_varied','normal_recovery'])assert.equal(observeTrace(trace(id)).U,0);
  const redundant=observeTrace(trace('redundant_reads'));assert.equal(redundant.N,5);assert.equal(redundant.U,4);
  const recovery=observeTrace(trace('normal_recovery'));assert.equal(recovery.R,1);assert.equal(recovery.A_r,1);
  const failure=observeTrace(trace('failure_unrecovered'));assert.equal(failure.R,1);assert.equal(failure.A_r,0);
});
let sequenceId=0;
function readSequence(steps){
  const traceId='native-read-sequence-'+(++sequenceId);
  const emit=(event_type,payload,extra={})=>store.append({trace_id:traceId,event_type,payload,...extra});
  emit('run.started',{source:'synthetic-fixture',rule_version:RULE_VERSION});
  const model=index=>{
    const model_call_id='model-'+index,start=emit('model.started',{model:'test'},{model_call_id});
    emit('model.ended',{model:'test',outcome:'completed'},{model_call_id,parent_event_id:start.event_id});
  };
  model(0);
  steps.forEach((step,index)=>{
    const tool=step.tool??'gov_read_document',tool_call_id='read-'+index;
    const start=emit('tool.started',{tool,params:{document_id:step.id}},{tool_call_id});
    emit('tool.ended',{tool,failed:step.failed===true,
      result:step.result??{content:[{type:'text',text:'document '+step.id}],details:{document_id:step.id,executed:true}}},
    {tool_call_id,parent_event_id:start.event_id});
    model(index+1);
  });
  emit('run.ended',{success:true});emit('model.output',{texts:['done']});
  return store.read(traceId);
}
test('native managed reads detect unchanged A-B-A evidence before analysis',()=>{
  const observed=observeTrace(readSequence([{id:'grid_curves'},{id:'grid_records'},{id:'grid_curves'},{id:'2024-09',tool:'gov_analyze_grid'}]));
  assert.equal(observed.N,4);assert.equal(observed.U,1);
});
test('native reads exclude changed results, different inputs, failed retries and post-action refreshes',()=>{
  const cases=[
    [{id:'curves',result:'old'},{id:'records'},{id:'curves',result:'new'},{id:'curves',result:'old'}],
    [{id:'curves',result:'same bytes'},{id:'records',result:'same bytes'}],
    [{id:'curves'},{id:'curves',failed:true},{id:'curves'}],
    [{id:'curves'},{id:'curves',tool:'write'},{id:'curves'}],
  ];
  for(const steps of cases)assert.equal(observeTrace(readSequence(steps)).U,0);
});
test('missing, duplicated and malformed tool evidence yields Q missing and quarantine',async()=>{
  const mutations=[
    t=>{t.events=t.events.filter(e=>e.event_type!=='tool.ended');},
    t=>{t.events.push(structuredClone(t.events.find(e=>e.event_type==='tool.ended')));},
    t=>{delete t.events.find(e=>e.event_type==='tool.ended').payload.failed;},
    t=>{delete t.events.find(e=>e.event_type==='tool.started').payload.params;},
    t=>{t.events.find(e=>e.event_type==='tool.ended').tool_call_id='unmatched';},
    t=>{t.events.find(e=>e.event_type==='tool.ended').payload.tool='different';},
    t=>{t.events=t.events.filter(e=>e.event_type!=='run.ended');},
    t=>{t.events=t.events.filter(e=>e.event_type!=='model.output');},
  ];
  for(const mutate of mutations){const t=trace('normal_public');mutate(t);const r=await assess(t,new HeuristicLocalJudge({allowSynthetic:true}),config);
    assert.equal(r.quality.Q,null);assert.equal(r.safety.decision,'quarantine');}
});
test('failure without an observable subsequent model decision is not treated as no failure',async()=>{
  const t=trace('failure_unrecovered'), end=t.events.find(e=>e.event_type==='tool.ended');
  t.events=t.events.filter(e=>!(e.event_type==='model.started'&&e.sequence>end.sequence));
  const judge=new HeuristicLocalJudge({allowSynthetic:true}), r=await assess(t,judge,config);
  assert.equal(judge.lastReview.reason,'recovery_opportunity_unobserved');assert.equal(r.quality.Q,null);assert.equal(r.safety.decision,'quarantine');
});
test('synthetic requires explicit calibration mode; real default does not become production-calibrated',async()=>{
  const r=await assess(trace('normal_public'),new HeuristicLocalJudge(),config);
  assert.equal(r.quality.Q,null);assert.equal(r.safety.decision,'quarantine');
  const t=trace('normal_public');t.summary.source='openclaw';
  const real=await assess(t,new HeuristicLocalJudge(),config);
  assert.equal(real.safety.reason,'local_calibration_not_validated');
});
async function mockOllama(run,{mutate=x=>x,show={model_info:{'general.architecture':'test','general.parameter_count':1}},fail=false}={}){
  const original=globalThis.fetch,requests=[];
  globalThis.fetch=async(url,init)=>{
    requests.push({url,body:JSON.parse(init.body),redirect:init.redirect});
    if(fail)throw Error('network error with private data must not be persisted');
    if(url.endsWith('/api/show'))return new Response(JSON.stringify(show));
    const o=JSON.parse(requests.at(-1).body.messages[1].content);
    const answer={...o.safety_floor,N:o.N,U:o.U,R:o.R,A_r:o.A_r,H:o.H,failure_status:o.failure_status,rationale:'structured observation'};
    return new Response(JSON.stringify({message:{content:JSON.stringify(mutate(answer))}}));
  };
  try{await run(requests);}finally{globalThis.fetch=original;}
}
test('Ollama sends only structured metadata locally; valid response and source are preserved',async()=>{
  await mockOllama(async requests=>{
    const judge=new OllamaLocalJudge({allowSynthetic:true});
    const r=await assess(trace('poisoned_step'),judge,config);
    assert.equal(judge.lastMode,'ollama');assert.equal(r.safety.decision,'quarantine');
    assert.equal(requests.length,2);assert.ok(requests.every(r=>r.url.startsWith('http://127.0.0.1:11434/')&&r.redirect==='error'));
    const input=requests[1].body.messages[1].content;
    assert.ok(!input.includes('admin_token'));assert.ok(!input.includes('Ignore all previous instructions'));
    assert.ok(!input.includes('expected'));assert.ok(!input.includes('poisoned_step'));
  });
});
test('Ollama receives actual duplicate count and cannot silently undercount it',async()=>{
  const t=readSequence([{id:'grid_curves'},{id:'grid_records'},{id:'grid_curves'},{id:'2024-09',tool:'gov_analyze_grid'}]);
  await mockOllama(async requests=>{
    const judge=new OllamaLocalJudge({allowSynthetic:true}),r=await assess(t,judge,config);
    assert.equal(JSON.parse(requests[1].body.messages[1].content).U,1);
    assert.equal(judge.lastMode,'ollama');assert.equal(r.basis.quality.U,1);
    assert.equal(r.quality.E,.75);assert.equal(r.quality.Q,.825);
  });
  await mockOllama(async()=>{
    const judge=new OllamaLocalJudge({allowSynthetic:true});await assess(t,judge,config);
    assert.equal(judge.lastMode,'heuristic-fallback');
    assert.equal(judge.lastReview.fallback_reason,'judge_quality_invalid');
  },{mutate:p=>({...p,U:0})});
});
for(const [name,mutate]of Object.entries({
  wrong_N:p=>({...p,N:p.N+1}), wrong_R:p=>({...p,R:42}), malformed_grade:p=>({...p,B:'Z'}),
  ignored_risk:p=>({...p,B:'A',I:'A',A:'A',D:'A'}), ignored_H:p=>({...p,H:0}),
  extra_key:p=>({...p,execute:'untrusted'}), missing_field:p=>{delete p.N;return p;},
}))test('invalid Ollama '+name+' explicitly falls back rather than clamping or accepting',async()=>{
  await mockOllama(async()=>{
    const judge=new OllamaLocalJudge({allowSynthetic:true}),r=await assess(trace('injection_observed'),judge,config);
    assert.equal(judge.lastMode,'heuristic-fallback');assert.match(r.source,/启发式回退/);
    assert.equal(r.basis.quality.N,1);assert.equal(r.safety.decision,'quarantine');assert.ok(judge.lastReview.fallback_reason);
  },{mutate});
});
test('unavailable Ollama fallback exposes no error body or false model provenance',async()=>{
  await mockOllama(async()=>{
    const judge=new OllamaLocalJudge({allowSynthetic:true}),r=await assess(trace('normal_public'),judge,config);
    assert.equal(judge.lastMode,'heuristic-fallback');assert.equal(r.quality.Q,.95);
    assert.equal(judge.lastReview.fallback_reason,'ollama_unavailable_or_invalid_json');
  },{fail:true});
});
test('real trace fallback cannot reuse an Ollama-only calibration claim',async()=>{
  await mockOllama(async()=>{
    const judge=new OllamaLocalJudge(), initialVersion=judge.version, t=trace('normal_public');t.summary.source='openclaw';
    const r=await assess(t,judge,{...config,calibrated:true,judge_version:initialVersion});
    assert.equal(judge.version,HEURISTIC_VERSION);assert.equal(r.safety.reason,'local_calibration_not_validated');
  },{fail:true});
});
test('cloud-backed local Ollama receives no trace evidence; external endpoints are rejected',async()=>{
  for(const endpoint of ['https://example.com','http://localhost:11434','http://127.0.0.1.evil:11434','http://user:pass@127.0.0.1:11434','http://127.0.0.1:11434/path'])assert.throws(()=>new OllamaLocalJudge({endpoint}));
  await mockOllama(async requests=>{
    const judge=new OllamaLocalJudge({allowSynthetic:true});await judge.review(trace('normal_public'));
    assert.equal(requests.length,1);assert.ok(requests[0].url.endsWith('/api/show'));
    assert.equal(judge.lastReview.fallback_reason,'ollama_local_model_unverified');
  },{show:{remote_model:'cloud-model',remote_host:'https://example.com'}});
});
test('evidence gaps never call Ollama and never obtain a guessed Q',async()=>{
  await mockOllama(async requests=>{
    const judge=new OllamaLocalJudge({allowSynthetic:true}),r=await assess(trace('missing_tool_result'),judge,config);
    assert.equal(requests.length,0);assert.equal(r.quality.Q,null);assert.equal(r.safety.decision,'quarantine');
  });
});
test('factory and CLI retain explicit ollama|heuristic|fixture selection',async()=>{
  assert.ok(makeLocalJudge({...config,judge:'ollama'})instanceof OllamaLocalJudge);
  assert.ok(makeLocalJudge({...config,judge:'heuristic'})instanceof HeuristicLocalJudge);
  assert.ok(makeLocalJudge({judge:'fixture'})instanceof FixtureJudge);
  assert.throws(()=>makeLocalJudge({...config,judge:'typo'}));
  assert.throws(()=>makeLocalJudge({judge:'ollama',calibration_version:'production'}));
  const id='calibration-normal_public';
  const trusted=await new HeuristicLocalJudge({allowSynthetic:true}).review(store.read(id));
  for(const judge of ['heuristic','fixture']){
    const filename=path.join(root,judge+'.json');
    writeFileSync(filename,JSON.stringify({...config,judge,allowSynthetic:true,judge_version:HEURISTIC_VERSION,fixtureEvidence:{[id]:trusted}}));
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('../cli.mjs',import.meta.url)), 'assess',root,id,filename],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,result.stderr);const assessed=JSON.parse(result.stdout);
    assert.equal(assessed.safety.decision,'pass');assert.equal(assessed.basis.quality.N,1);
  }
});
