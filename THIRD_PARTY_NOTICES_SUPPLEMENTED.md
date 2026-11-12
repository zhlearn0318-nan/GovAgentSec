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
| PyTorch | https://pytorch.org | The Harness preview runtime includes a development snapshot of the installed CUDA wheel. Upstream binary distribution licenses apply and remain in the wheel. |
| OpenClaw | https://github.com/openclaw/openclaw | Installed separately; its upstream license applies |
| GSAP / ScrollTrigger 3.13.0 | https://github.com/greensock/GSAP/tree/3.13.0 | Bundled in `modules/govagentsec-ui/vendor`; original headers retained. [GSAP Standard License](https://gsap.com/community/standard-license/) applies, not Apache-2.0 |
| Cabinet Grotesk Bold | https://www.fontshare.com/fonts/cabinet-grotesk | [ITF Free Font License](https://www.fontshare.com/licenses/itf-ffl); binary excluded from Git. Installer downloads from official Fontshare CDN and verifies SHA-256; system font fallback is available |
| DeepSeek Harness | https://github.com/deepseek-ai/deepseek-harness | MIT; host deployed separately. GovAgentSec includes only its integration adapter; the host's own third-party notices remain applicable |
| Ollama | https://github.com/ollama/ollama | MIT; installed separately. Model weights retain their own upstream licenses |
| Qwen2.5-7B-Instruct | https://huggingface.co/Qwen/Qwen2.5-7B-Instruct | Original model declares Apache-2.0; fetched through Ollama as `qwen2.5:7b-instruct-q4_K_M` for Aegis semantic analysis. Quantized artifact notices also apply; distinct from Qwen3Guard |

Model weights, CUDA libraries, Docker images, OpenClaw, and local runtime environments are not committed. Downloading them does not change their upstream licensing terms. Existing module notices remain applicable to code derived from those modules.
