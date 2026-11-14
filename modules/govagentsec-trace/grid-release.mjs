// Explicit local recording release domain. Production Releases and test_only gates remain unchanged.
import path from 'node:path';
import {existsSync,readFileSync,writeFileSync,renameSync,realpathSync,lstatSync,mkdirSync} from 'node:fs';
import {digest} from './privacy.mjs';
import {digest as artifactHash} from '../trajectory-governance/trace-store.mjs';

export const GRID_SKILL='grid-anomaly-diagnosis';
export const GRID_TASK='a-park-electricity-diagnosis';
const json=p=>JSON.parse(readFileSync(p,'utf8'));
function save(file,value){writeFileSync(file+'.tmp',JSON.stringify(value,null,2));renameSync(file+'.tmp',file);}
export function gridTarget(config,workspace){
 if(!config?.enabled)throw Error('GRID_RELEASE_DISABLED');
 const expected=path.resolve(workspace,'skills',GRID_SKILL),target=path.resolve(config.skillDirectory??'');
 if(target.toLowerCase()!==expected.toLowerCase())throw Error('GRID_RELEASE_TARGET_MISMATCH');
 for(const part of [path.resolve(workspace),path.dirname(target),target]){
  if(!existsSync(part)||lstatSync(part).isSymbolicLink()||realpathSync(part).toLowerCase()!==part.toLowerCase())throw Error('GRID_RELEASE_LINKED_OR_MISSING_TARGET');
 }
 const file=path.join(target,'SKILL.md');
 if(!existsSync(file)||lstatSync(file).isSymbolicLink())throw Error('GRID_BASELINE_MISSING');
 return {directory:target,file};
}
export function gridBaseline(config,workspace){const target=gridTarget(config,workspace),content=readFileSync(target.file,'utf8');
 const version=content.match(/^version:\s*(\d+\.\d+\.\d+)\s*$/m)?.[1];
 if(!version||!content.includes(`name: ${GRID_SKILL}`))throw Error('GRID_BASELINE_INVALID');
 return {...target,content,version,artifact_hash:artifactHash(content)};
}
export function gridGeneration(config,workspace){const baseline=gridBaseline(config,workspace),[major,minor]=baseline.version.split('.').map(Number);
 return {scope:'openclaw-grid-demo',version:`${major}.${minor+1}.0`,baseline_version:baseline.version,baseline_hash:baseline.artifact_hash,
  baseline_content:baseline.content,loader_directory:baseline.directory,task_key:GRID_TASK};
}
function trustedReviewer(identity){return identity?.user?.id&&identity.user.roles?.includes('workspace_maintainer')&&identity.permission_summary?.capabilities?.includes('admission.manage');}
function sourceChecks(candidate,store){
 if(candidate.name!==GRID_SKILL||candidate.generation?.task_key!==GRID_TASK||candidate.generation?.release?.scope!=='openclaw-grid-demo')throw Error('GRID_CANDIDATE_SCOPE_REQUIRED');
 if(candidate.source_traces?.length<2)throw Error('GRID_TWO_SOURCES_REQUIRED');
 const snapshots=candidate.generation.assessment_snapshot??[];
 return candidate.source_traces.map(source=>{
  const trace=store.read(source.trace_id),s=trace.summary,a=s.assessment,snapshot=snapshots.find(r=>r.trace_id===source.trace_id);
  if(!trace.integrity.valid||s.source!=='openclaw'||s.trace_status!=='complete'||s.metrics.success!==true||s.task_key!==GRID_TASK||!s.task_confirmed||s.evidence_hash!==source.evidence_hash)throw Error('GRID_SOURCE_CHANGED');
  if(!a||a.evidence_hash!==s.evidence_hash||a.safety?.decision!=='pass'||!Number.isFinite(a.quality?.Q)||!snapshot||digest({quality:a.quality,safety:a.safety})!==digest({quality:snapshot.quality,safety:snapshot.safety}))throw Error('GRID_ASSESSMENT_CHANGED');
  const ends=trace.events.filter(e=>e.event_type==='tool.ended'&&!e.payload.failed),analysis=ends.find(e=>e.payload.tool==='gov_analyze_grid'&&e.payload.grid_evidence);
  if(ends.filter(e=>e.payload.tool==='gov_read_document').length<2||!analysis)throw Error('GRID_NATIVE_TOOLS_REQUIRED');
  const e=analysis.payload.grid_evidence;
  if(e.period!=='2024-09'||!e.skill_prompt_loaded||!Array.isArray(e.document_ids)||!['grid_curves','grid_records'].every(id=>e.document_ids.includes(id))||!e.report_id||!/^[a-f0-9]{64}$/.test(e.skill_hash??''))throw Error('GRID_NATIVE_EVIDENCE_REQUIRED');
  if(!trace.events.some(e=>e.event_type==='skill.observed'&&e.payload.name===GRID_SKILL))throw Error('GRID_SKILL_READ_REQUIRED');
  return {trace_id:source.trace_id,evidence_hash:s.evidence_hash,analysis_event:analysis.event_id,report_id:e.report_id,skill_version:e.skill_version,skill_hash:e.skill_hash};
 });
}
export function gridReleaseGate({candidate,store,config,workspace,identity,receipt}){
 let reason=null,baseline=null,sources=[];
 try{baseline=gridBaseline(config,workspace);sources=sourceChecks(candidate,store);
  if(candidate.status!=='admission_passed'||candidate.admission_passed?.response?.decision!=='allow'||candidate.admission_passed?.artifact_hash!==candidate.artifact_hash)throw Error('GRID_ADMISSION_REQUIRED');
  if(candidate.generation.release.baseline_hash!==baseline.artifact_hash&&baseline.artifact_hash!==candidate.artifact_hash)throw Error('GRID_BASELINE_CHANGED');
  if(!trustedReviewer(identity))throw Error('GRID_REVIEWER_REQUIRED');
 }catch(error){reason=error.message;}
 const released=Boolean(receipt&&receipt.artifact_hash===candidate.artifact_hash&&baseline?.artifact_hash===candidate.artifact_hash);
 const before=candidate.generation?.release?.baseline_content??'',after=existsSync(candidate.bundleFile??'')?readFileSync(candidate.bundleFile,'utf8'):null;
 return {enabled:!reason&&!released,reason,released,scope:'openclaw-grid-demo',production_published:false,
  version:candidate.generation?.release?.version??null,baseline_version:candidate.generation?.release?.baseline_version??null,
  artifact_hash:candidate.artifact_hash,baseline_hash:baseline?.artifact_hash??null,sources,receipt:released?receipt:null,before,after};
}
export function publishGridCandidate({workshop,store,id,expectedHash,config,workspace,identity}){
 const candidate=workshop.read(id),file=path.join(workshop.directory(id),'grid-release.json');
 const prior=existsSync(file)?json(file):null;
 const gate=gridReleaseGate({candidate,store,config,workspace,identity,receipt:prior});
 if(!trustedReviewer(identity))throw Error('GRID_REVIEWER_REQUIRED');
 if(expectedHash!==candidate.artifact_hash)throw Error('GRID_CANDIDATE_CHANGED');
 if(gate.released)return prior;
 if(!gate.enabled)throw Error(gate.reason||'GRID_NOT_RELEASABLE');
 const baseline=gridBaseline(config,workspace),content=readFileSync(path.join(workshop.directory(id),'bundle','SKILL.md'),'utf8');
 const tools=(candidate.generation.steps??[]).map(s=>s.tool);
 if(!tools.includes('gov_analyze_grid')||tools.filter(t=>t==='gov_read_document').length<2||tools.some(t=>!['read','read_file','gov_read_document','gov_analyze_grid'].includes(t)))throw Error('GRID_TOOL_SEQUENCE_REJECTED');
 if(content.match(/^version:\s*(\S+)/m)?.[1]!==gate.version)throw Error('GRID_VERSION_MISMATCH');
 const receipt={scope:'openclaw-grid-demo',production_published:false,installed:true,loader_status:'new_session_required',candidate_id:id,
  artifact_hash:candidate.artifact_hash,version:gate.version,previous_hash:baseline.artifact_hash,reviewer:identity.user.id,
  reviewer_label:identity.user.label,at:new Date().toISOString(),source_hash:digest(gate.sources),selection_hash:digest(candidate.generation.selection),admission_hash:digest(candidate.admission_passed)};
 // Prepare bytes and receipt first; only this named, validated Skill can be replaced.
 const releaseDir=path.join(workshop.root,'grid-releases');mkdirSync(releaseDir,{recursive:true});
 save(path.join(releaseDir,id+'.json'),{...receipt,status:'prepared'});
 writeFileSync(baseline.file+'.next',content);renameSync(baseline.file+'.next',baseline.file);
 save(path.join(baseline.directory,'release.json'),receipt);save(file,receipt);save(path.join(releaseDir,id+'.json'),{...receipt,status:'installed'});
 return receipt;
}
