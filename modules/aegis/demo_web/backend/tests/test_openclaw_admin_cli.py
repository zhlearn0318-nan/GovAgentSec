from __future__ import annotations

from tools.openclaw_admin_cli import _builtin_summary


def test_mcp_preview_never_commits_and_save_rechecks(monkeypatch) -> None:
    from tools import openclaw_admin_cli as cli

    calls = []

    def admit(payload, *, commit):
        calls.append((payload, commit))
        return {"decision": "ALLOW", "saved": commit}

    monkeypatch.setattr(cli, "admit_mcp_server", admit)
    payload = {"name": "isolated-fixture", "server": {"url": "https://example.test/mcp"}}
    assert cli.handle({"operation": "preview_mcp", "request": payload})["saved"] is False
    assert cli.handle({"operation": "admit_mcp", "request": payload})["saved"] is True
    assert calls == [(payload, False), (payload, True)]


def test_openclaw_overview_counts_dict_and_list_rule_families() -> None:
    summary = _builtin_summary()

    assert summary["count"] == 146
    context = next(
        family
        for family in summary["families"]
        if family["analyzer"] == "aegis-context-v1-families"
    )
    assert context["count"] == 55

