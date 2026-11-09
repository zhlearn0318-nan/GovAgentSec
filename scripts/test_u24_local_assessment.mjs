// Actual loopback Ollama review of a copied historical trace; never modifies live evidence.
import fs from 'node:fs';import path from 'node:path';
import {TraceStore} from '../modules/govagentsec-trace/store.mjs';
import {AssessmentJobs} from '../modules/govagentsec-trace/assessment-jobs.mjs';
const out=path.resolve(process.argv[2]??'local-validation/u24-local-assessment/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const source=path.resolve('local-validation/real-evolution/2026-11-07-multi-trace-final/evidence/traces');
const id='1a5fd19d-2474-4141-97e7-7a5fa5e40ebe',original=new TraceStore(source),file=original.file(id);
const store=new TraceStore(path.join(out,'evidence/traces'));
fs.copyFileSync(file,store.file(id));fs.copyFileSync(file+'.head.json',store.file(id)+'.head.json');
const trace=store.read(id);if(!trace.integrity.valid)throw Error('historical chain invalid');
const started=Date.now(),jobs=new AssessmentJobs(store,path.join(out,'jobs'));
const job=jobs.start({task_key:trace.summary.task_key,trace_ids:[id],judge:'ollama'});
let result;
for(;;){result=jobs.status(job.job_id);if(!['running','queued'].includes(result.status))break;if(Date.now()-started>210000)throw Error('LOCAL_REVIEW_TIMEOUT');await new Promise(r=>setTimeout(r,250));}
const a=result.rows[0]?.assessment;
const report={source:'real-historical-trace-copy-local-ui-assessment',passed:result.status==='completed'&&a?.test_only===true&&store.read(id).integrity.valid,
 duration_ms:Date.now()-started,trace_id:id,job_id:job.job_id,status:result.status,requested_judge:'ollama',actual_source:a?.source,
 Q:a?.quality?.Q,S:a?.safety?.S,decision:a?.safety?.decision,reason:a?.safety?.reason,test_only:a?.test_only,
 calibration:a?.ui_review,hash_chain_valid:store.read(id).integrity.valid,live_evidence_modified:false,external_review:false};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,report:path.join(out,'report.json')}));
if(!report.passed)process.exitCode=1;
