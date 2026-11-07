"""Fixed, synthetic scenarios run through the service's existing gateway."""
from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

from enforcement import compute_action_digest
from enforcement.adapters import LocalTestBusinessAdapters
from enforcement.documents import document_action, scrub_document_receipt

IDENTITY_NOTE = "本机演示身份"


def run_gov_document_demo(gateway):
    # Never route the demo to a production business adapter.
    if not isinstance(gateway.business_adapters, LocalTestBusinessAdapters) or gateway.approvals is None:
        raise ValueError("文档演示需要本机合成文档适配器与审批凭证服务")
    run_id = uuid4().hex
    results = []

    def request(case, scenario, document, clearance=1):
        return {
            "request_id": f"govdoc-{run_id}-{case}",
            "task_id": f"govdoc-task-{run_id}-{case}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "subject": {"id": "synthetic-duty-user", "roles": ["office_user"], "clearance": clearance},
            "action": document_action(document),
            "context": {"destination_zone": "internal", "enforcement_point": "gateway",
                        "business_hours": True, "repeat_count": 0, "identity_note": IDENTITY_NOTE,
                        "demo_run_id": run_id, "scenario": scenario},
            "environment": {"sandbox": {"enabled": False, "profile": ""}},
            "approval": {},
        }

    def show(req, result):
        results.append({
            **scrub_document_receipt(result),
            "request_id": req["request_id"], "task_id": req["task_id"],
            "scenario": req["context"]["scenario"],
            "document_id": req["action"]["parameters"]["document_id"],
            "identity_note": IDENTITY_NOTE,
            "policy_reason_codes": result.get("policy_reason_codes", []),
            "executed": result.get("status") == "executed_isolated" and result.get("receipt") is not None,
        })

    for case, scenario, document, clearance in [
        (1, "公开预案放行", "emergency_plan", 1),
        (2, "普通身份读机密通讯录", "command_contacts", 1),
        (3, "受保护资源", "protected_resource", 1),
        (4, "机密通讯录待审批", "duty_contacts", 2),
    ]:
        req = request(case, scenario, document, clearance)
        show(req, gateway.invoke(req))

    # Approve the exact task/action that was pending in scenario 4.
    req = deepcopy(req)
    req["request_id"] = f"govdoc-{run_id}-5"
    req["context"]["scenario"] = "审批后一次合法执行"
    req["approval"] = gateway.approvals.issue(
        req, compute_action_digest(req), "synthetic-approver", ["business_approver"]
    )
    authorization = gateway.authorize(req)
    ticket = authorization.get("ticket")
    show(req, gateway.dispatch(req, ticket) if ticket else authorization)

    # Request IDs separate presentation rows; task/action remain ticket-bound.
    replay = deepcopy(req)
    replay["request_id"] = f"govdoc-{run_id}-6"
    replay["context"]["scenario"] = "执行票据重放"
    show(replay, gateway.dispatch(replay, ticket))
    changed = deepcopy(req)
    changed["request_id"] = f"govdoc-{run_id}-7"
    changed["context"]["scenario"] = "审批后篡改绑定"
    changed["action"]["data_level"] = "public"
    show(changed, gateway.dispatch(changed, ticket))
    return {"demo_run_id": run_id, "identity_note": IDENTITY_NOTE,
            "demo_identity": IDENTITY_NOTE, "results": results}
