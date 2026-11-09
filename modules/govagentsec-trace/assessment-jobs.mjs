import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { digest } from './privacy.mjs';
import { assess, selectTopK } from './scoring.mjs';
import { makeLocalJudge } from './local-judges.mjs';
import { loadRouting } from '../model-routing/routing.mjs';

export const UI_CALIBRATION = 'ui-process-assessment-v1-not-production';
const active = job => ['queued', 'running'].includes(job.status);
export function selectedTraces(store, { task_key, trace_ids }) {
  if (typeof task_key !== 'string' || !task_key.trim() || task_key.length > 200 || !Array.isArray(trace_ids)
      || !trace_ids.length || trace_ids.length > 100 || new Set(trace_ids).size !== trace_ids.length) throw Error('SELECTION_REQUIRED');
  const traces = trace_ids.map(id => store.read(id));
  if (traces.some(t => t.summary.task_key !== task_key || !t.summary.task_confirmed)) throw Error('CONFIRMED_SAME_TASK_REQUIRED');
  return traces;
}
export function selectionPreview(store, params) {
  if (params.keep !== undefined && params.keep !== .9) throw Error('RETENTION_FIXED');
  const traces = selectedTraces(store, params);
  const rows = traces.map(t => {
    const s = t.summary, a = s.assessment;
    const reason = !t.integrity.valid ? 'incomplete_or_invalid_trace' : !a ? 'assessment_missing' : a.evidence_hash !== s.evidence_hash ? 'assessment_evidence_changed' : null;
    return reason ? { trace_id:s.trace_id, task_key:s.task_key, task_confirmed:s.task_confirmed, evidence_hash:s.evidence_hash,
      source:a?.source ?? null, test_only:a?.test_only ?? true, safety:{decision:'quarantine',S:null,reason}, quality:{status:'missing',Q:null,reason} } : a;
  });
  const selection = selectTopK(rows, params.task_key, {keep:.9});
  // Binds both the underlying events and the actual assessment, including excluded rows.
  const snapshot_hash = digest(traces.map(t => ({trace_id:t.summary.trace_id, evidence_hash:t.summary.evidence_hash,
    integrity:t.integrity, assessment:t.summary.assessment ?? null})));
  return { task_key:params.task_key, trace_ids:[...params.trace_ids], rows, selection, snapshot_hash,
    can_generate:selection.selected.length >= 2, reason:selection.selected.length >= 2 ? null : 'need_two_selected_after_retention' };
}

// One bounded local batch at a time; job receipts survive page refresh and process restarts.
export class AssessmentJobs {
  constructor(store, root, { judgeFactory = makeLocalJudge } = {}) {
    this.store=store; this.root=root; this.judgeFactory=judgeFactory; this.current=null;
  }
  save(job) {
    mkdirSync(this.root,{recursive:true}); const file=path.join(this.root,job.job_id+'.json'), temp=file+'.tmp';
    writeFileSync(temp,JSON.stringify(job,null,2),{mode:0o600}); renameSync(temp,file);
  }
  start(params) {
    if (!['ollama','heuristic'].includes(params.judge)) throw Error('LOCAL_JUDGE_REQUIRED');
    const traces=selectedTraces(this.store,params), key=digest({task_key:params.task_key,trace_ids:params.trace_ids,
      judge:params.judge,hashes:traces.map(t=>t.summary.evidence_hash)});
    if (this.current && active(this.current)) {
      if (this.current.key === key) return structuredClone(this.current);
      throw Error('ASSESSMENT_BUSY');
    }
    const job={job_id:randomUUID(),key,status:'queued',task_key:params.task_key,trace_ids:[...params.trace_ids],judge:params.judge,
      source:'本地过程评估（仅候选）',test_only:true,calibrated:false,calibration_version:UI_CALIBRATION,t_star:.75,
      total:traces.length,completed:0,rows:[],created_at:new Date().toISOString()};
    this.save(job); this.current=job;
    setImmediate(()=>{void this.run(job,traces).catch(()=>{job.status='failed';job.reason='job_storage_or_execution_failed';try{this.save(job);}catch{ /* Current job still exposes failed state. */ }});});
    return structuredClone(job);
  }
  status(id) {
    if (!/^[a-f0-9-]{36}$/.test(id ?? '')) throw Error('JOB_NOT_FOUND');
    if (this.current?.job_id === id) return structuredClone(this.current);
    const file=path.join(this.root,id+'.json'); if (!existsSync(file)) throw Error('JOB_NOT_FOUND');
    const job=JSON.parse(readFileSync(file,'utf8'));
    if (active(job)) {job.status='interrupted';job.reason='gateway_restarted';this.save(job);}
    return job;
  }
  cancel(id) {
    const job=this.current?.job_id===id ? this.current : this.status(id);
    if (active(job)) {job.cancel_requested=true;this.save(job);}
    return structuredClone(job);
  }
  async run(job,traces) {
    job.status='running';this.save(job);
    for (const original of traces) {
      if (job.cancel_requested) break;
      const id=original.summary.trace_id;
      try {
        const config={...loadRouting().security_review_llm,judge:job.judge,allowSynthetic:true,
          calibration_version:UI_CALIBRATION,calibrated:false,t_star:.75};
        const judge=this.judgeFactory(config); config.judge_version=judge.version;
        const assessment=await assess(original,judge,config);
        // Local demonstration selection must never acquire production status via a UI request.
        assessment.test_only=true;
        assessment.ui_review={calibrated:false,calibration_version:UI_CALIBRATION,purpose:'candidate-process-review'};
        const latest=this.store.read(id);
        if (!latest.integrity.valid || latest.summary.evidence_hash!==original.summary.evidence_hash) {
          job.rows.push({trace_id:id,status:'changed',reason:'evidence_changed_during_review'});
        } else {
          this.store.append({trace_id:id,event_type:'assessment.completed',payload:assessment});
          job.rows.push({trace_id:id,status:'completed',assessment});
        }
      } catch {job.rows.push({trace_id:id,status:'failed',reason:'local_assessment_failed'});}
      job.completed++;this.save(job);
    }
    job.status=job.cancel_requested?'cancelled':job.rows.some(r=>r.status!=='completed')?'failed':'completed';
    job.finished_at=new Date().toISOString();this.save(job);
  }
}
