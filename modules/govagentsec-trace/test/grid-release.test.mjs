import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {TraceStore} from '../store.mjs';
import {Workshop} from '../../trajectory-governance/workshop.mjs';
import {digest as artifactHash} from '../../trajectory-governance/trace-store.mjs';
import {generateCandidate} from '../evolution.mjs';
import {GRID_TASK,GRID_SKILL,gridGeneration,gridReleaseGate,publishGridCandidate} from '../grid-release.mjs';
import {releaseGate} from '../release-gate.mjs';
const admin={user:{id:'verified-test-admin',label:'单元测试管理员',roles:['workspace_maintainer']},permission_summary:{capabilities:['admission.manage']}};
function setup(){
 const base=path.resolve('local-validation/grid-release-unit');mkdirSync(base,{recursive:true});const root=mkdtempSync(path.join(base,'case-')),workspace=path.join(root,'workspace'),directory=path.join(workspace,'skills',GRID_SKILL);mkdirSync(directory,{recursive:true});
 const baseline=`---\nname: ${GRID_SKILL}\nversion: 1.0.0\n---\nUse approved grid records and return evidence.`;writeFileSync(path.join(directory,'SKILL.md'),baseline);
 const config={enabled:true,skillDirectory:directory},store=new TraceStore(path.join(root,'traces')),rows=[];
 for(let i=0;i<3;i++){
  const id='fixture-native-'+i;store.append({trace_id:id,event_type:'run.started',payload:{source:'openclaw',task_key:GRID_TASK,task_confirmed:true}});
  store.append({trace_id:id,event_type:'model.started',model_call_id:'m',payload:{model:'fixture'}});
  store.append({trace_id:id,event_type:'model.ended',model_call_id:'m',payload:{model:'fixture'}});
  store.append({trace_id:id,event_type:'skill.observed',payload:{name:GRID_SKILL,evidence:'unit-test'}});
  for(const [j,tool]of ['gov_read_document','gov_read_document','gov_analyze_grid'].entries()){
   store.append({trace_id:id,event_type:'tool.started',tool_call_id:'t'+j,payload:{tool}});
   store.append({trace_id:id,event_type:'tool.ended',tool_call_id:'t'+j,payload:{tool,failed:false,...(tool==='gov_analyze_grid'?{grid_evidence:{period:'2024-09',document_ids:['grid_curves','grid_records'],report_id:'fixture-report',skill_hash:artifactHash(baseline),skill_version:'1.0.0',skill_prompt_loaded:true}}:{})}});
  }
  store.append({trace_id:id,event_type:'model.output',payload:{output:'fixture'}});store.append({trace_id:id,event_type:'run.ended',payload:{success:true}});
  const row={trace_id:id,task_key:GRID_TASK,task_confirmed:true,evidence_hash:store.read(id).summary.evidence_hash,test_only:true,quality:{Q:.9,status:'computed'},safety:{decision:'pass',S:1}};rows.push(row);store.append({trace_id:id,event_type:'assessment.completed',payload:row});
 }
 const w=new Workshop(path.join(root,'workshop'),[path.join(workspace,'skills')]);
 const {candidate}=generateCandidate(store,rows,{task_key:GRID_TASK,name:GRID_SKILL,workshopRoot:w.root,loaderRoots:[path.join(workspace,'skills')],release:gridGeneration(config,workspace)});
 const candidateAllowed=w.transition(candidate.id,'draft','admission_passed',{artifact_hash:candidate.artifact_hash,response:{decision:'allow'},source:'unit-test-fixture'});
 return {root,workspace,directory,config,store,w,candidate:candidateAllowed};
}
const publish=(x,extra={})=>publishGridCandidate({workshop:x.w,store:x.store,id:x.candidate.id,expectedHash:x.candidate.artifact_hash,config:x.config,workspace:x.workspace,identity:admin,...extra});
test('演示发布需要可信具名管理员并且不能发布到任意目录',()=>{const x=setup();assert.throws(()=>publish(x,{identity:null}),/REVIEWER/);assert.throws(()=>publish(x,{identity:{...admin,user:{id:'spoof',roles:[]}}}),/REVIEWER/);assert.throws(()=>publish(x,{config:{enabled:true,skillDirectory:path.join(x.root,'other')}}),/TARGET/);});
test('真实来源绑定发布写入宿主加载文件，生产闸保持禁止',()=>{const x=setup();assert.equal(releaseGate(x.candidate).confirmation.enabled,false);const r=publish(x);assert.equal(r.version,'1.1.0');assert.equal(r.production_published,false);assert.equal(r.installed,true);assert.match(readFileSync(path.join(x.directory,'SKILL.md'),'utf8'),/version: 1.1.0/);assert.equal(artifactHash(readFileSync(path.join(x.directory,'SKILL.md'),'utf8')),x.candidate.artifact_hash);assert.deepEqual(publish(x),r);});
test('生成后轨迹变化阻止发布',()=>{const x=setup();x.store.append({trace_id:x.candidate.source_traces[0].trace_id,event_type:'source.changed',payload:{reason:'unit test'}});assert.throws(()=>publish(x),/SOURCE_CHANGED/);});
test('来源评分变更和基线变更分别阻止发布',()=>{const x=setup(),id=x.candidate.source_traces[0].trace_id,a=x.store.read(id).summary.assessment;x.store.append({trace_id:id,event_type:'assessment.completed',payload:{...a,quality:{Q:.2,status:'computed'}}});assert.throws(()=>publish(x),/ASSESSMENT_CHANGED/);const y=setup();writeFileSync(path.join(y.directory,'SKILL.md'),'---\nname: grid-anomaly-diagnosis\nversion: 1.0.1\n---\nChanged');assert.throws(()=>publish(y),/BASELINE_CHANGED/);});
test('未经联合准入的候选只展示差异，不能安装',()=>{const x=setup(),c={...x.candidate,status:'draft'};const gate=gridReleaseGate({candidate:c,store:x.store,config:x.config,workspace:x.workspace,identity:admin});assert.equal(gate.enabled,false);assert.equal(gate.reason,'GRID_ADMISSION_REQUIRED');assert.match(gate.before,/version: 1.0.0/);});
