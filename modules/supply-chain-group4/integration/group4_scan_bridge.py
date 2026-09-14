"""One-shot HTTP panel bridge for the deployed Group 4 MCP scanner."""

from __future__ import annotations

import json
from pathlib import Path
import sys


def main() -> int:
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "需要一个扫描目录"}, ensure_ascii=False))
        return 2
    integration_root = Path(__file__).resolve().parent
    sys.path.insert(0, str(integration_root))
    try:
        import group4_mcp_server as scanner

        target = scanner._resolve_target(sys.argv[1])
        result = scanner._run_scan(target)
        payload = {"ok": True, "data": result}
        code = 0
    except Exception as exc:
        payload = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        code = 2
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
