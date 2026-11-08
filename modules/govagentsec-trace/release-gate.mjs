import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {digest,redact} from './privacy.mjs';

// OpenClaw 2026.7.1-2 GatewayRequestHandlerOptions.client, not RPC parameters.
// Shared gateway credentials and developer MCP identities do not identify a reviewer.
export function reviewerIdentity(client) {
  const c=client?.connect;
  if(client?.isDeviceTokenAuth!==true || c?.role!=='operator' || !c.scopes?.includes('operator.admin')
    || typeof c.device?.id!=='string' || !/^[a-f0-9]{64}$/i.test(c.device.id)) return null;
  return {actor:'openclaw-device:'+c.device.id,kind:'host-verified-device-admin',production_oidc:false};
}
export function releaseGate(candidate,records=[],identity=null,receipt=null) {
  const selection=candidate.generation?.selection;
  const rows=candidate.generation?.assessment_snapshot??records;
  const decisions=new Map((selection?.decisions??[]).map(r=>[r.trace_id,r]));
  const task=candidate.generation?.task_key;
  const relevant=rows.filter(r=>task&&r.task_key===task);
  const evidence=candidate.admission_passed??candidate.rejected??candidate.unverified;
  const decision=evidence?.response?.decision??null;
  const admitted=candidate.status==='admission_passed'&&decision==='allow'&&evidence?.artifact_hash===candidate.artifact_hash;
  const scored=!!selection?.selected?.length&&selection.selected.every(s=>relevant.some(r=>r.trace_id===s.trace_id
    &&r.safety?.decision==='pass'&&Number.isFinite(r.quality?.Q)));
  const bound=receipt?.candidate_id===candidate.id&&receipt?.artifact_hash===candidate.artifact_hash
    &&receipt.admission_hash===digest(candidate.admission_passed)&&receipt.selection_hash===digest(selection);
  const state=admitted?(bound?'ready_for_review':'admitted_allow'):decision==='block'||candidate.status==='rejected'?'admitted_block':scored?'scored':'draft';
  const reason=!identity?'需 OIDC 或宿主验证的具名管理员身份；共享网关令牌/本机开发身份不能确认。':
    !admitted?'仅联合准入 allow 的候选可提交人工复核。':!scored?'评分与 TopK 证据缺失，不可确认。':bound?'已写入人工复核回执，未安装。':null;
  return redact({state,flow:['draft','scored','admitted_allow|admitted_block','ready_for_review'],
    candidate_id:candidate.id,artifact_hash:candidate.artifact_hash,task_key:task??null,
    summary:{format:'instruction-only',steps:(candidate.generation?.steps??[]).map(s=>({step:s.step,tool:s.tool})),test_only:!!candidate.generation?.test_only,location:'skill-workshop',installed:false},
    counts:{participating:relevant.length,safe:relevant.filter(r=>r.safety?.decision==='pass').length,quarantine:relevant.filter(r=>r.safety?.decision==='quarantine').length},
    rows:relevant.map(r=>({trace_id:r.trace_id,task_key:r.task_key,Q:r.quality?.Q??null,S:r.safety?.S??null,
      decision:r.safety?.decision??'missing',reason:r.safety?.reason??'评分缺失',selected:decisions.get(r.trace_id)?.selected??false,selection_reason:decisions.get(r.trace_id)?.reason??'未参与本候选选择'})),
    selection:selection?{keep:selection.keep,denominator:selection.denominator,requested_count:selection.requested_count}:null,
    evidence_source:candidate.generation?.assessment_snapshot?'generation_snapshot':'current_local_assessments_or_missing',
    admission:{decision,reason:evidence?.response?.reason??'尚无可靠准入结论',rule_ids:evidence?.response?.findings?.map(f=>f.ruleId)??[]},
    confirmation:{enabled:!reason,reason,receipt:bound?receipt:null},notice:'admission_passed ≠ 发布/安装'});
}
export function readReviewReceipt(workshop,id) {
  const file=path.join(workshop.directory(id),'review-receipt.json');
  return existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
}
export function confirmReview(workshop,id,expectedHash,client,records=[]) {
  const identity=reviewerIdentity(client),candidate=workshop.read(id);
  if(!identity)throw Error('REVIEW_IDENTITY_REQUIRED');
  if(expectedHash!==candidate.artifact_hash)throw Error('CANDIDATE_CHANGED');
  const prior=readReviewReceipt(workshop,id),gate=releaseGate(candidate,records,identity,prior);
  if(prior&&gate.state==='ready_for_review')return prior;
  if(!gate.confirmation.enabled)throw Error('CANDIDATE_NOT_REVIEWABLE');
  const receipt={candidate_id:id,artifact_hash:candidate.artifact_hash,...identity,at:new Date().toISOString(),
    action:'confirm_for_review_only',state:'ready_for_review',installed:false,test_only:!!candidate.generation?.test_only,
    admission_hash:digest(candidate.admission_passed),selection_hash:digest(candidate.generation.selection)};
  // Exclusive creation makes simultaneous requests single-writer. No loader or Releases call.
  writeFileSync(path.join(workshop.directory(id),'review-receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});
  return receipt;
}
