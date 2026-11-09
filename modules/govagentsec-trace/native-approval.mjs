// Process-local producer: DemoIdentityBridge's private worker response only.
// No public RPC accepts trace annotations or client-supplied run IDs.
export const NATIVE_APPROVAL = Symbol.for('govagentsec.trace.nativeApproval');
const types = new Set(['approval.requested', 'approval.approved', 'approval.rejected', 'approval.denied', 'approval.execution']);

export function appendNativeApproval(store, entry) {
  try {
    if (!types.has(entry.event_type) || !/^[a-f0-9]{32}$/.test(entry.audit_id ?? '') ||
        !entry.run_id || !entry.request_id || !entry.task_id || !entry.session_key ||
        !Number.isFinite(Date.parse(entry.timestamp))) throw Error('projection_invalid');
    const trace = store.read(entry.run_id);
    if (!trace.integrity.valid || !trace.events.some(e => e.event_type === 'run.started' && e.session_key === entry.session_key))
      throw Error('origin_run_unavailable');
    const prior = trace.events.find(e => e.payload.source === 'identity-audit' && e.payload.audit_id === entry.audit_id);
    if (prior) return { captured: true, event_id: prior.event_id, duplicate: true };
    // A parent is evidence, not chronological adjacency. Never attach another run's event.
    const request = trace.events.findLast(e => e.event_type === 'approval.requested' && e.request_id === entry.request_id);
    const tool = entry.tool_call_id && trace.events.find(e => e.event_type === 'tool.started' &&
      e.tool_call_id === entry.tool_call_id && e.payload.tool === entry.tool);
    const parent = entry.event_type === 'approval.execution' ? tool : request ?? tool;
    const saved = store.append({ trace_id: entry.run_id, timestamp: entry.timestamp, event_type: entry.event_type,
      session_key: entry.session_key, request_id: entry.request_id, task_id: entry.task_id,
      tool_call_id: entry.tool_call_id, parent_event_id: parent?.event_id ?? null,
      payload: { source: 'identity-audit', audit_id: entry.audit_id, status: entry.status,
        tool: entry.tool, reason_code: entry.reason_code, actor_roles: entry.actor_roles,
        origin_run_id: entry.origin_run_id, production_oidc: false, verified: true,
        failed: entry.event_type === 'approval.execution' && entry.status === 'failed',
        correlation: parent ? 'exact-request-or-tool-call' : 'run-and-request-only' } });
    return { captured: true, event_id: saved.event_id };
  } catch {
    store?.failure(entry?.run_id, 'native_approval', 'approval_capture_failed');
    return { captured: false, reason: 'approval_capture_failed' };
  }
}
