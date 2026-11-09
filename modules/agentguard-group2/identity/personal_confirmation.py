"""Local demo operator confirmations, distinct from two-person business approval.

Only the authenticated request owner may confirm a stored exact action. OPA hard
denies remain authoritative; the resulting execution ticket is still single-use.
"""
import copy
import time
from enforcement.tickets import compute_action_digest


def confirm(demo, request_id, resolution, bearer, subject):
    record=demo.requests.get(request_id)
    original=demo.snapshots.get(request_id)
    if (not record or not original or record.get('requester')!=subject['id']
            or demo.chat.sessions.get(record.get('session_key'))!=bearer):
        return demo.blocked('P002_SUBJECT_MISMATCH')
    if not demo.chat.current_scope(record):
        return demo.blocked('P023_TASK_SCOPE_CHANGED')
    if record.get('status')!='pending_approval':
        return demo.blocked('A409_ALREADY_RESOLVED',409)
    if time.time()>=record.get('confirmation_expires_at',0):
        record.update(status='rejected',reason_code='PERSONAL_CONFIRMATION_EXPIRED')
        return demo.blocked('PERSONAL_CONFIRMATION_EXPIRED')
    if resolution not in {'approve','reject'}:
        return demo.blocked('DEMO_UNTRUSTED_FIELD')
    if resolution=='reject':
        record.update(status='rejected',execution_status='not_started',reason_code='PERSONAL_CONFIRMATION_REJECTED')
        demo.audit('chat.personal_confirmation',request_id=request_id,subject=subject['id'],resolution='reject')
        return {'status':'rejected'}
    request=copy.deepcopy(original)
    request['subject']=subject
    # A scoped, process-private authorization for this exact snapshot only.
    # Never fabricate an independent approver or accept a model-provided flag.
    gateway=demo.service.gateway
    original_mode=gateway.native_approval_only
    digest=compute_action_digest(request)
    gateway.personal_confirmation_digest=digest
    gateway.native_approval_only=lambda candidate: (candidate.get('subject',{}).get('id')==subject['id']
        and compute_action_digest(candidate)==digest) or original_mode(candidate)
    try:
        result=gateway.authorize(request)
    finally:
        gateway.native_approval_only=original_mode
        gateway.personal_confirmation_digest=None
    if result.get('status')=='authorized':
        demo.chat.approved(request,result)
        record.update(status='authorized',approver=subject['id'],approval_mode='personal_confirmation')
    demo.audit('chat.personal_confirmation',request_id=request_id,subject=subject['id'],
               resolution='approve',status=result.get('status'),reason_code=result.get('reason_code'))
    return demo.safe_receipt(result,request_id,subject,'resolve')
