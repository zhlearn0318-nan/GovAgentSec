# Licenses and attribution

GovAgentSec integration code and the contributors' Aegis, Protect Agent and Group4 code are distributed under Apache-2.0, except files carrying their own license notices.

| Component | Source | License handling |
| --- | --- | --- |
| AgentGuard | Included contributor module | Original MIT license retained in `modules/agentguard-group2/LICENSE` |
| Aegis | Included contributor module | Apache-2.0; original notices retained |
| PIGuard | https://huggingface.co/leolee99/PIGuard | Model card declares MIT; fetched from pinned upstream revision |
| Qwen3Guard | https://huggingface.co/Qwen/Qwen3Guard-Gen-0.6B | Apache-2.0; upstream license downloaded with model |
| SimCSE | https://huggingface.co/princeton-nlp/sup-simcse-bert-base-uncased | Model card does not declare a license; weights fetched directly, not redistributed in this repository |
| TrustRAG | https://github.com/HuichiZhou/TrustRAG | MIT; original LICENSE retained in `third_party/TrustRAG` |
| OPA | https://github.com/open-policy-agent/opa | Apache-2.0; executable fetched from official release with checksum verification |
| Cisco Skill Scanner / MCP Scanner | https://github.com/cisco-ai-defense | Built from commits pinned by the Aegis runtime bootstrap; see each upstream repository license |
| PyTorch | https://pytorch.org | Official binary downloaded separately; upstream binary distribution licenses apply |
| OpenClaw | https://github.com/openclaw/openclaw | Installed separately; its upstream license applies |

Model weights, CUDA libraries, Docker images, OpenClaw, and local runtime environments are not committed. Downloading them does not change their upstream licensing terms. Existing module notices remain applicable to code derived from those modules.
