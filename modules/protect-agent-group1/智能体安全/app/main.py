from __future__ import annotations

import argparse
import json
import os
from collections.abc import Sequence

from agent.result import AgentStatus
from agent.state import AgentRequest, SourceType

from .config import build_deepseek_agent, build_default_agent


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agent-security",
        description="多层防护智能体（离线基线或 DeepSeek 真实模型）",
    )
    parser.add_argument("prompt", help="需要安全处理的输入")
    parser.add_argument(
        "--source",
        choices=tuple(item.value for item in SourceType),
        default=SourceType.USER.value,
        help="不可信输入的来源类型",
    )
    parser.add_argument("--rag", action="store_true", help="启用 RAG 安全链路")
    parser.add_argument(
        "--profile",
        choices=("baseline", "deepseek"),
        default="baseline",
        help="运行离线基线或本地真实 Guard + DeepSeek",
    )
    parser.add_argument(
        "--model-root",
        default=os.environ.get("PROTECT_AGENT_MODEL_ROOT"),
        help="PIGuard、Qwen3Guard 和 SimCSE 模型根目录",
    )
    parser.add_argument(
        "--trustrag-module",
        default=os.environ.get("PROTECT_AGENT_TRUSTRAG_MODULE"),
        help="TrustRAG 官方 defend_module.py 路径",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        request = AgentRequest(
            content=args.prompt,
            source=SourceType(args.source),
            use_rag=args.rag,
        )
    except ValueError:
        print(
            json.dumps(
                {
                    "status": "INVALID_REQUEST",
                    "message": "输入无效。",
                },
                ensure_ascii=False,
            )
        )
        return 2

    try:
        if args.profile == "deepseek":
            if not args.model_root or not args.trustrag_module:
                raise ValueError("real guard paths are required")
            agent = build_deepseek_agent(args.model_root, args.trustrag_module)
        else:
            agent = build_default_agent()
    except ValueError:
        print(
            json.dumps(
                {
                    "status": "INVALID_CONFIGURATION",
                    "message": "运行配置无效，请检查模型路径和环境变量。",
                },
                ensure_ascii=False,
            )
        )
        return 2

    try:
        response = agent.handle(request)
        payload = {
            "status": response.status.value,
            "action": response.decision.action.value,
            "risk_level": response.assessment.level.value,
            "risk_score": round(response.assessment.score, 4),
            "used_rag": response.used_rag,
            "message": response.content,
        }
        print(json.dumps(payload, ensure_ascii=False))
        if response.status is AgentStatus.COMPLETED:
            return 0
        if response.status is AgentStatus.CONFIRMATION_REQUIRED:
            return 3
        return 2
    except Exception:
        print(
            json.dumps(
                {
                    "status": "ERROR",
                    "message": "安全处理失败。",
                },
                ensure_ascii=False,
            )
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
