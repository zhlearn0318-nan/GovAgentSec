import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {AssessmentJobs,selectionPreview,UI_CALIBRATION} from '../assessment-jobs.mjs';
import {TraceStore} from '../store.mjs';
import {createFixtures} from '../fixtures.mjs';
import {HeuristicLocalJudge} from '../local-judges.mjs';
import {generateCandidate} from '../evolution.mjs';
import {registerTrace} from '../register.mjs';
import {historyPacks,openEvidencePack} from '../evidence-packs.mjs';
import {Workshop} from '../../trajectory-governance/workshop.mjs';
import {confirmReview,releaseGate,reviewerIdentity} from '../release-gate.mjs';

const task='expense-word-template';
function setup(){const root=mkdtempSync(path.join(os.tmpdir(),'gov-assessment-')),store=new TraceStore(path.join(root,'traces'));
 const evidence=createFixtures(store),ids=Object.keys(evidence);return{root,store,ids,jobs:new AssessmentJobs(store,path.join(root,'jobs'))};}
async function done(jobs,id){for(let i=0;i<200;i++){const job=jobs.status(id);if(!['queued','running'].includes(job.status))return job;await new Promise(r=>setTimeout(r,5));}throw Error('job timeout');}
const args=ids=>({task_key:task,trace_ids:ids,judge:'heuristic'});

test('local UI batch persists scores, separates risks, and binds only selected traces',async()=>{
 const {store,jobs,ids,root}=setup();const job=jobs.start(args(ids));assert.equal(jobs.start(args(ids)).job_id,job.job_id);
 assert.throws(()=>jobs.start(args(ids.slice(0,2))),/BUSY/);
 const result=await done(jobs,job.job_id);assert.equal(result.status,'completed');assert.equal(result.completed,ids.length);
 assert(result.rows.every(r=>r.assessment.test_only&&r.assessment.ui_review.calibration_version===UI_CALIBRATION));
 assert(result.rows.some(r=>r.assessment.safety.decision==='quarantine'));assert(result.rows.some(r=>r.assessment.safety.decision==='pass'));
 assert(result.rows.every(r=>store.read(r.trace_id).integrity.valid));
 const preview=selectionPreview(store,{task_key:task,trace_ids:ids});assert(preview.can_generate);assert.equal(preview.selection.keep,.9);
 const safe=preview.rows.filter(r=>r.safety.decision==='pass');const two=selectionPreview(store,{task_key:task,trace_ids:safe.slice(0,2).map(r=>r.trace_id)});
 assert.equal(two.can_generate,false);assert.equal(two.selection.denominator,2);assert.equal(two.selection.requested_count,1);
 const c=generateCandidate(store,preview.rows,{task_key:task,name:'ui-review-candidate',workshopRoot:path.join(root,'skill-workshop'),loaderRoots:[path.join(root,'loader')]}).candidate;
 assert.equal(c.generation.test_only,true);assert(c.generation.steps.every(s=>s.evidence.every(e=>preview.trace_ids.includes(e.trace_id))));
 const w=new Workshop(path.join(root,'skill-workshop'),[path.join(root,'loader')]);w.transition(c.id,'draft','admission_passed',{artifact_hash:c.artifact_hash,response:{decision:'allow'}});
 const admin={isDeviceTokenAuth:true,connect:{role:'operator',scopes:['operator.admin'],device:{id:'a'.repeat(64)}}};
 assert.equal(releaseGate(w.read(c.id),[],reviewerIdentity(admin)).confirmation.enabled,false);
 assert.throws(()=>confirmReview(w,c.id,c.artifact_hash,admin),/NOT_REVIEWABLE/);
 assert.equal(new AssessmentJobs(store,path.join(root,'jobs')).status(job.job_id).status,'completed');
});

test('snapshot detects changed evidence and assessments, missing Q stays in safe denominator',async()=>{
 const {store,jobs,ids}=setup();await done(jobs,jobs.start(args(ids)).job_id);
 const safe=selectionPreview(store,{task_key:task,trace_ids:ids}).rows.filter(r=>r.safety.decision==='pass');
 const chosen=safe.slice(0,3).map(r=>r.trace_id),before=selectionPreview(store,{task_key:task,trace_ids:chosen});
 const row=structuredClone(safe[2]);row.quality={status:'missing',Q:null,reason:'missing_test_evidence'};
 store.append({trace_id:row.trace_id,event_type:'assessment.completed',payload:row});
 const missing=selectionPreview(store,{task_key:task,trace_ids:chosen});assert.equal(missing.selection.denominator,3);assert.equal(missing.selection.requested_count,2);
 assert.notEqual(missing.snapshot_hash,before.snapshot_hash);assert(missing.selection.decisions.some(d=>d.reason==='quality_missing'));
 store.append({trace_id:chosen[0],event_type:'late.observation',payload:{}});
 const stale=selectionPreview(store,{task_key:task,trace_ids:chosen});assert.equal(stale.rows[0].safety.reason,'assessment_evidence_changed');
 assert.throws(()=>selectionPreview(store,{task_key:'different',trace_ids:chosen}),/SAME_TASK/);
 assert.throws(()=>selectionPreview(store,{task_key:task,trace_ids:[chosen[0],chosen[0]]}),/SELECTION/);
});

test('evidence changed in-flight is not stamped with a stale score; cancellation preserves completed rows',async()=>{
 const {store,ids,root}=setup();let release,entered;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 class SlowJudge extends HeuristicLocalJudge{async review(t){entered();await gate;return super.review(t);}}
 const jobs=new AssessmentJobs(store,path.join(root,'slow'),{judgeFactory:()=>new SlowJudge({allowSynthetic:true})});
 const job=jobs.start(args(ids));await waiting;
 store.append({trace_id:ids[0],event_type:'late.observation',payload:{}});jobs.cancel(job.job_id);release();
 const result=await done(jobs,job.job_id);assert.equal(result.status,'cancelled');assert.equal(result.completed,1);assert.equal(result.rows[0].status,'changed');
 assert.equal(store.read(ids[0]).events.filter(e=>e.event_type==='assessment.completed').length,0);
});

test('judge exceptions are recorded and a restart exposes interrupted jobs',async()=>{
 const {store,ids,root}=setup();const jobs=new AssessmentJobs(store,path.join(root,'bad'),{judgeFactory:()=>{throw Error('secret must not escape');}});
 const result=await done(jobs,jobs.start(args(ids.slice(0,1))).job_id);assert.equal(result.status,'failed');assert.equal(result.rows[0].reason,'local_assessment_failed');
 const file=path.join(root,'bad',result.job_id+'.json');writeFileSync(file,JSON.stringify({...result,status:'running'}));
 const after=new AssessmentJobs(store,path.join(root,'bad')).status(result.job_id);assert.equal(after.status,'interrupted');
 assert.equal(JSON.stringify(after).includes('secret'),false);
});

test('RPC scopes, strict local arguments, explicit generation snapshot, and read-only pack',async t=>{
 const key=Symbol.for('govagentsec.demoIdentity.bridge'),before=globalThis[key];
 globalThis[key]={request:async(operation,params,bearer)=>{
   assert.equal(operation,'authorize');assert.equal(bearer,'Bearer isolated-rpc-fixture');
   return {status:'ok',user:{id:'unit-fixture'},permission_summary:{capabilities:[params.permission]}};
 }};
 t.after(()=>{if(before===undefined)delete globalThis[key];else globalThis[key]=before;});
 const {root,ids}=setup(),methods=new Map(),scopes=new Map();
 const store=registerTrace({pluginConfig:{dataDir:root},config:{},logger:{warn(){}},on(){},registerHttpRoute(){},registerGatewayMethod(n,fn,options){methods.set(n,fn);scopes.set(n,options.scope);}});
 const rpc=async(method,params={})=>{let response;await methods.get('govagentsec.trace.'+method)({params:{...params,bearer:'Bearer isolated-rpc-fixture'},respond:(ok,data,error)=>response={ok,data,error}});return response;};
 assert.equal(scopes.get('govagentsec.trace.assessmentStart'),'operator.write');assert.equal(scopes.get('govagentsec.trace.assessmentStatus'),'operator.read');
 for(const extra of [{endpoint:'https://example.org'},{calibrated:true},{allowSynthetic:false},{t_star:0},{test_only:false},{pack_id:'typhoon-real-20261107'}])assert.equal((await rpc('assessmentStart',{...args(ids),...extra})).ok,false);
 assert.equal((await rpc('assessmentStart',{...args(ids),judge:'fixture'})).ok,false);
 const result=await rpc('assessmentStart',args(ids));assert(result.ok);let job;
 for(let i=0;i<200;i++){job=(await rpc('assessmentStatus',{job_id:result.data.job_id})).data;if(!['running','queued'].includes(job.status))break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(job.status,'completed');
 const p={task_key:task,trace_ids:ids};const preview=(await rpc('selectionPreview',p)).data;
 assert.equal((await rpc('generate',{task_key:task,name:'old-ambiguous-request'})).ok,false);
 assert.equal((await rpc('generate',{...p,name:'bound-candidate',snapshot_hash:'wrong'})).ok,false);
 assert.equal((await rpc('generate',{...p,name:'bound-candidate',snapshot_hash:preview.snapshot_hash})).ok,true);
 store.append({trace_id:ids[0],event_type:'late.observation',payload:{}});
 assert.equal((await rpc('generate',{...p,name:'stale-candidate',snapshot_hash:preview.snapshot_hash})).ok,false);
 for(const method of ['assign','generate','admit','confirmReview','assessmentStart','assessmentCancel'])assert.equal((await rpc(method,{pack_id:'typhoon-real-20261107'})).ok,false);
 assert.throws(()=>openEvidencePack('../anything'),/NOT_FOUND/);
 const packs=historyPacks();assert(packs.packs.every(p=>p.read_only&&!Object.hasOwn(p,'root')));
 const pack=packs.packs.find(p=>p.id==='typhoon-real-20261107');
 if(pack){const traces=(await rpc('list',{pack_id:pack.id})).data;assert.equal(traces.traces.length,6);
   const d=(await rpc('detail',{pack_id:pack.id,trace_id:traces.traces[0].trace_id})).data;assert(d.integrity.valid);
   const c=(await rpc('candidates',{pack_id:pack.id})).data;assert.equal(c.candidates.length,2);
   const gate=(await rpc('releaseGate',{pack_id:pack.id,candidate_id:c.candidates[0].id})).data;assert.equal(gate.confirmation.enabled,false);}
});
