from __future__ import annotations

from pathlib import Path

from agent.agent import SecurityAgent
from agent.baseline_model import BaselineAgentModel
from agent.deepseek_model import DeepSeekAgentModel, DeepSeekSettings
from guards.guard_router import GuardRouter
from guards.piguard import BaselinePIGuard
from guards.qwen3guard import BaselineQwen3Guard
from guards.real_piguard import LocalPIGuardBackend, RealPIGuard
from guards.real_qwen3guard import LocalQwen3GuardBackend, RealQwen3Guard
from policy.policy_engine import PolicyEngine
from rag_security.retriever import InMemoryRetriever
from rag_security.trustrag_adapter import BaselineTrustRAG
from rag_security.real_trustrag import LocalOfficialTrustRAGBackend, OfficialTrustRAG
from risk.risk_engine import RiskEngine
from tools.gateway import ToolGateway


def build_default_agent() -> SecurityAgent:
    """Build the dependency-free, fail-closed V1 engineering baseline."""
    return SecurityAgent(
        piguard=BaselinePIGuard(),
        qwen3guard=BaselineQwen3Guard(),
        guard_router=GuardRouter(),
        retriever=InMemoryRetriever(),
        trustrag=BaselineTrustRAG(),
        risk_engine=RiskEngine(),
        policy_engine=PolicyEngine(),
        model=BaselineAgentModel(),
        tool_gateway=ToolGateway(),
    )


def build_real_guard_agent(
    model_root: Path | str,
    trustrag_module: Path | str,
) -> SecurityAgent:
    """Build the agent with explicit, lazy, local-only real security models."""
    root = Path(model_root).resolve()
    piguard = RealPIGuard(LocalPIGuardBackend(root / "PIGuard"))
    qwen3guard = RealQwen3Guard(
        LocalQwen3GuardBackend(root / "Qwen3Guard-Gen-0.6B")
    )
    trustrag = OfficialTrustRAG(
        LocalOfficialTrustRAGBackend(
            root / "princeton-nlp-sup-simcse-bert-base-uncased",
            trustrag_module,
        )
    )
    return SecurityAgent(
        piguard=piguard,
        qwen3guard=qwen3guard,
        guard_router=GuardRouter(),
        retriever=InMemoryRetriever(),
        trustrag=trustrag,
        risk_engine=RiskEngine(),
        policy_engine=PolicyEngine(),
        model=BaselineAgentModel(),
        tool_gateway=ToolGateway(),
    )


def build_deepseek_agent(
    model_root: Path | str,
    trustrag_module: Path | str,
) -> SecurityAgent:
    """Build real local guards with DeepSeek as the screened response model."""
    root = Path(model_root).resolve()
    return SecurityAgent(
        piguard=RealPIGuard(LocalPIGuardBackend(root / "PIGuard")),
        qwen3guard=RealQwen3Guard(
            LocalQwen3GuardBackend(root / "Qwen3Guard-Gen-0.6B")
        ),
        guard_router=GuardRouter(),
        retriever=InMemoryRetriever(),
        trustrag=OfficialTrustRAG(
            LocalOfficialTrustRAGBackend(
                root / "princeton-nlp-sup-simcse-bert-base-uncased",
                trustrag_module,
            )
        ),
        risk_engine=RiskEngine(),
        policy_engine=PolicyEngine(),
        model=DeepSeekAgentModel(DeepSeekSettings.from_env()),
        tool_gateway=ToolGateway(),
    )
