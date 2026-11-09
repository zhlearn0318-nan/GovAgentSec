import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Workshop} from '../../trajectory-governance/workshop.mjs';
import {releaseGate,confirmReview,reviewerIdentity} from '../release-gate.mjs';
const admin={isDeviceTokenAuth:true,connect:{role:'operator',scopes:['operator.admin'],device:{id:'a'.repeat(64)}}};
test('low-quality and quarantined evidence remain visible outside TopK',()=>{
 const {c}=setup();
 c.generation.assessment_snapshot.push(
  {trace_id:'low',task_key:'task',safety:{decision:'pass',S:1,reason:'above_threshold'},quality:{Q:.2}},
  {trace_id:'poison',task_key:'task',safety:{decision:'quarantine',S:.3,reason:'enforced_security_block'},quality:{Q:.8}});
 c.generation.selection.decisions.push({trace_id:'low',selected:false,reason:'below_topk'},
  {trace_id:'poison',selected:false,reason:'enforced_security_block'});
 const gate=releaseGate(c);
 assert.deepEqual(gate.counts,{participating:3,safe:2,quarantine:1});
 assert.equal(gate.rows.find(r=>r.trace_id==='low').Q,.2);
 assert.equal(gate.rows.find(r=>r.trace_id==='low').selection_reason,'below_topk');
 assert.equal(gate.rows.find(r=>r.trace_id==='poison').selected,false);
 assert.equal(gate.confirmation.enabled,false);
});
function setup(){const root=mkdtempSync(path.join(os.tmpdir(),'review-gate-')),loader=path.join(root,'skills');mkdirSync(loader);
 const w=new Workshop(path.join(root,'skill-workshop'),[loader]);
 const c=w.create({name:'review-fixture',content:'---\nname: review-fixture\n---\nSynthetic instruction-only fixture.',source_traces:[{trace_id:'t',evidence_hash:'h',original_task_group:'task'}],
 generation:{task_key:'task',test_only:false,selection:{selected:[{trace_id:'t'}],decisions:[{trace_id:'t',selected:true}],keep:.9,denominator:2},assessment_snapshot:[{trace_id:'t',task_key:'task',safety:{decision:'pass',S:1},quality:{Q:.9}}]}});
 return {root,loader,w,c};}
test('shared, developer and spoofed display identity cannot confirm',()=>{
 assert.equal(reviewerIdentity({connect:{role:'operator',scopes:['operator.admin'],device:{id:'a'.repeat(64)}}}),null);
 const {w,c}=setup();assert.throws(()=>confirmReview(w,c.id,c.artifact_hash,null),/IDENTITY/);
 assert.equal(releaseGate(c).confirmation.enabled,false);
});
test('confirmation writes one receipt only, preserves workshop state and loader',()=>{
 const {w,c,loader}=setup();w.transition(c.id,'draft','admission_passed',{artifact_hash:c.artifact_hash,response:{decision:'allow'}});
 const before=readFileSync(path.join(w.directory(c.id),'candidate.json'),'utf8');
 assert.throws(()=>confirmReview(w,c.id,'wrong',admin),/CHANGED/);
 const r=confirmReview(w,c.id,c.artifact_hash,admin);assert.equal(r.state,'ready_for_review');assert.equal(r.installed,false);
 assert.deepEqual(confirmReview(w,c.id,c.artifact_hash,admin),r);assert.equal(readdirSync(loader).length,0);
 assert.equal(readFileSync(path.join(w.directory(c.id),'candidate.json'),'utf8'),before);
 assert.equal(releaseGate(w.read(c.id),[],reviewerIdentity(admin),r).state,'ready_for_review');
 assert.equal(releaseGate(w.read(c.id),[],reviewerIdentity(admin),{...r,artifact_hash:'wrong'}).state,'admitted_allow');
});
test('block, missing score and changed bundle fail closed',()=>{
 const {w,c,loader}=setup();w.transition(c.id,'draft','rejected',{artifact_hash:c.artifact_hash,response:{decision:'block'}});
 assert.equal(releaseGate(w.read(c.id),[],reviewerIdentity(admin)).state,'admitted_block');
 assert.throws(()=>confirmReview(w,c.id,c.artifact_hash,admin),/NOT_REVIEWABLE/);
 const allow={...c,status:'admission_passed',generation:{},admission_passed:{artifact_hash:c.artifact_hash,response:{decision:'allow'}}};
 assert.equal(releaseGate(allow,[],reviewerIdentity(admin)).confirmation.enabled,false);
 assert.equal(readdirSync(loader).length,0);
 const file=path.join(w.directory(c.id),'bundle/SKILL.md');chmodSync(file,0o600);writeFileSync(file,'changed');
 assert.throws(()=>confirmReview(w,c.id,c.artifact_hash,admin),/candidate changed/);
});
