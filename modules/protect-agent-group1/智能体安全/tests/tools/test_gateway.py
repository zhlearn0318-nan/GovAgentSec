import unittest

from tools.base import ToolArgument, ToolRequest, ToolSpec, ToolStatus
from tools.gateway import ToolGateway
from tools.permissions import PermissionContext


class FakeTool:
    def __init__(self, *, operation_risk: float = 0.8, broken: bool = False) -> None:
        self.spec = ToolSpec(
            name="delete_note",
            allowed_parameters=("note_id",),
            required_parameters=("note_id",),
            required_permissions=("notes:delete",),
            allowed_scopes=("notes",),
            operation_risk=operation_risk,
        )
        self.broken = broken
        self.executions = 0

    def execute(self, arguments):
        self.executions += 1
        if self.broken:
            raise RuntimeError("secret executor detail")
        return f"deleted {arguments['note_id']}"


def request(*, confirmed: bool = False, parameter: str = "note_id") -> ToolRequest:
    return ToolRequest(
        name="delete_note",
        arguments=(ToolArgument(parameter, "42"),),
        scope="notes",
        confirmed=confirmed,
    )


class ToolGatewayTests(unittest.TestCase):
    def test_high_risk_tool_requires_confirmation_before_execution(self) -> None:
        tool = FakeTool()
        gateway = ToolGateway((tool,))
        permissions = PermissionContext(
            permissions=frozenset({"notes:delete"}),
            scopes=frozenset({"notes"}),
        )

        outcome = gateway.execute(request(), permissions)

        self.assertEqual(outcome.status, ToolStatus.CONFIRMATION_REQUIRED)
        self.assertEqual(tool.executions, 0)

    def test_confirmed_authorized_request_executes_registered_tool(self) -> None:
        tool = FakeTool()
        gateway = ToolGateway((tool,))
        permissions = PermissionContext(
            permissions=frozenset({"notes:delete"}),
            scopes=frozenset({"notes"}),
        )

        outcome = gateway.execute(request(confirmed=True), permissions)

        self.assertEqual(outcome.status, ToolStatus.EXECUTED)
        self.assertEqual(outcome.output, "deleted 42")
        self.assertEqual(tool.executions, 1)

    def test_missing_permission_is_denied_without_execution(self) -> None:
        tool = FakeTool(operation_risk=0.1)
        outcome = ToolGateway((tool,)).execute(
            request(), PermissionContext(scopes=frozenset({"notes"}))
        )

        self.assertEqual(outcome.status, ToolStatus.DENIED)
        self.assertEqual(outcome.reason_code, "PERMISSION_DENIED")
        self.assertEqual(tool.executions, 0)

    def test_unknown_parameter_is_denied(self) -> None:
        tool = FakeTool(operation_risk=0.1)
        permissions = PermissionContext(
            permissions=frozenset({"notes:delete"}),
            scopes=frozenset({"notes"}),
        )

        outcome = ToolGateway((tool,)).execute(
            request(parameter="shell_command"), permissions
        )

        self.assertEqual(outcome.status, ToolStatus.DENIED)
        self.assertEqual(outcome.reason_code, "INVALID_PARAMETERS")
        self.assertEqual(tool.executions, 0)

    def test_blank_required_parameter_is_denied(self) -> None:
        tool = FakeTool(operation_risk=0.1)
        permissions = PermissionContext(
            permissions=frozenset({"notes:delete"}),
            scopes=frozenset({"notes"}),
        )
        blank = ToolRequest(
            name="delete_note",
            arguments=(ToolArgument("note_id", "   "),),
            scope="notes",
        )

        outcome = ToolGateway((tool,)).execute(blank, permissions)

        self.assertEqual(outcome.status, ToolStatus.DENIED)
        self.assertEqual(outcome.reason_code, "INVALID_PARAMETERS")
        self.assertEqual(tool.executions, 0)

    def test_executor_exception_returns_generic_failure(self) -> None:
        tool = FakeTool(operation_risk=0.1, broken=True)
        permissions = PermissionContext(
            permissions=frozenset({"notes:delete"}),
            scopes=frozenset({"notes"}),
        )

        outcome = ToolGateway((tool,)).execute(request(), permissions)

        self.assertEqual(outcome.status, ToolStatus.ERROR)
        self.assertNotIn("secret", outcome.message)

    def test_unknown_tool_is_highest_risk_and_denied(self) -> None:
        gateway = ToolGateway(())
        unknown = ToolRequest(name="shell", scope="system")

        self.assertEqual(gateway.operation_risk(unknown), 1.0)
        self.assertEqual(
            gateway.execute(unknown, PermissionContext()).reason_code,
            "UNKNOWN_TOOL",
        )


if __name__ == "__main__":
    unittest.main()
