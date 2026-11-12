# Third-Party Notices / 第三方组件与许可声明

更新日期：2026-11-02。

本文件覆盖 GovAgentSec 当前源码、安装器使用的主要第三方组件，以及新增的 DeepSeek Harness 接入。
包级依赖、精确版本、平台条件与许可依据见 [第三方依赖明细](docs/THIRD_PARTY_DEPENDENCIES.md)
和 [CSV 清单](docs/third-party-dependencies.csv)。这些文件应与本声明一起保留。

本声明记录来源和上游许可，不将第三方组件重新授权为 Apache-2.0。
上游完整 LICENSE、版权声明、NOTICE 及具体发布包中的附加条款继续适用。

## 1. 项目代码及仓库内保留的模块

GovAgentSec 新增集成代码，以及贡献者提供的 Aegis、Protect Agent 与 Group4 代码，
采用 Apache-2.0，带独立许可声明的文件除外。AgentGuard 保留原 MIT 许可。

| 组件 | 仓库路径 / 来源 | 许可与处理方式 |
| --- | --- | --- |
| GovAgentSec 集成代码 | 仓库根目录、`scripts/`、`integrations/` | [Apache-2.0](LICENSE)；不覆盖第三方代码与资源自身许可 |
| Aegis | `modules/aegis` | [Apache-2.0](modules/aegis/LICENSE)；保留其 [子模块第三方声明](modules/aegis/THIRD_PARTY_NOTICES.md) |
| AgentGuard | `modules/agentguard-group2` | [MIT](modules/agentguard-group2/LICENSE)；保留原始许可证与版权声明 |
| Protect Agent 输入防护链 | `modules/protect-agent-group1` | [Apache-2.0](modules/protect-agent-group1/LICENSE) |
| Group4 Skill 安全测评 | `modules/supply-chain-group4` | [Apache-2.0](modules/supply-chain-group4/LICENSE) |
| TrustRAG 过滤代码 | [HuichiZhou/TrustRAG](https://github.com/HuichiZhou/TrustRAG)，提交 `11dcea0262d14b0e38e22e1d7ddce4a151e82a61` | MIT；仓库内保留 [原始 LICENSE](third_party/TrustRAG/LICENSE)，固定来源和文件校验和见 [models.lock.json](models.lock.json) |
| SkillClaw generation helpers | https://github.com/AMAP-ML/SkillClaw/tree/334ddf82856826b7a259470c6670fb0ef5ce2dc4 | MIT; license and pinned provenance in `third_party/SkillClaw`; minimal initializer adapted, generation helpers unchanged |

## 2. 模型与权重

模型权重不提交到 Git；由安装器下载或复用本机已有权重。
软件代码的许可、模型权重的许可和外部模型服务的使用条款应分别确认。

| 模型 | 来源与版本 | 许可与交付方式 |
| --- | --- | --- |
| PIGuard | [leolee99/PIGuard](https://huggingface.co/leolee99/PIGuard)，修订 `dd78b24e330193a22d2293ac66922dd4f982f563` | 模型卡声明 MIT；按固定修订下载，文件校验和见 `models.lock.json` |
| **Qwen3Guard-Gen-0.6B（千问 3 Guard）** | [Qwen/Qwen3Guard-Gen-0.6B](https://huggingface.co/Qwen/Qwen3Guard-Gen-0.6B)，修订 `fada3b2f655b89601929198343c94cd2f64d93cc` | Apache-2.0；用于输入及输出内容安全检测，安装器同时下载上游 LICENSE |
| SimCSE 编码模型 | [princeton-nlp/sup-simcse-bert-base-uncased](https://huggingface.co/princeton-nlp/sup-simcse-bert-base-uncased)，修订 `2d82fab19ac3a73a20dd20333d27eb8a52d6e97f` | **权重许可待确认**：项目锁文件未记录许可证，原记录说明模型卡未声明。权重直接从上游获取，不在仓库内再分发；不能由此推定权重已获 MIT 或其他授权 |
| Qwen2.5-7B-Instruct | [Qwen/Qwen2.5-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct)，Ollama 标签 `qwen2.5:7b-instruct-q4_K_M` | 原模型 [Apache-2.0](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct/blob/main/LICENSE)；用于 Aegis 本地语义分析。量化制品的转换来源和随包声明仍适用；该标签当前未在本仓库锁定为权重摘要 |

Qwen3Guard 与 Qwen2.5 是两个独立组件，均列入本声明。
DeepSeek 等远程业务模型由使用者配置，其模型、账号及 API 服务条款另行适用；本项目不分发其模型权重。

## 3. 宿主、扫描器与推理运行组件

| 组件 | 版本 / 来源 | 许可与交付方式 |
| --- | --- | --- |
| OpenClaw | 验证目标 `2026.7.1-2`；[openclaw/openclaw](https://github.com/openclaw/openclaw) | [MIT](https://github.com/openclaw/openclaw/blob/main/LICENSE)；单独安装，不包含在本仓库。安装版本自带的许可证与下游依赖声明继续适用 |
| DeepSeek Harness | 已验证 `0.2.2-alpha.2`；[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | [MIT](https://github.com/deepseek-ai/deepseek-harness/blob/master/LICENSE)；宿主单独部署。本仓库只包含 GovAgentSec 适配器，宿主的第三方依赖以其自带 `THIRD_PARTY_NOTICES.md` 为准 |
| DeepSeek Harness MCP 客户端 | `@deepseek-ai/dsh-mcp-client`，已验证 `0.2.2-alpha.2`；[上游包](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/mcp/mcp-client) | MIT；使用 Harness 已提供的包，不在本仓库复制客户端及其依赖 |
| Ollama | [ollama/ollama](https://github.com/ollama/ollama) | [MIT](https://github.com/ollama/ollama/blob/main/LICENSE)；独立安装，模型许可另见第 2 节；安装器未锁定 Ollama 自身版本 |
| Open Policy Agent（OPA） | `1.19.0`；[open-policy-agent/opa](https://github.com/open-policy-agent/opa) | Apache-2.0；从官方 release 下载 Windows 可执行文件并验证上游 SHA-256，不提交可执行文件 |
| Cisco AI Skill Scanner | [cisco-ai-defense/skill-scanner](https://github.com/cisco-ai-defense/skill-scanner)，提交 `4dee90371890ff23e1b21ea974e02847eacaa464`，构建版本 `2.0.13.dev3+g4dee90371` | Apache-2.0，依项目原有子模块声明记录；安装器在本地从固定提交构建，保留该提交的完整许可与 NOTICE |
| Cisco AI MCP Scanner | [cisco-ai-defense/mcp-scanner](https://github.com/cisco-ai-defense/mcp-scanner)，提交 `51966cce214ae057e69c3a672307911f5026e255`，版本 `4.8.2` | Apache-2.0，依项目原有子模块声明记录；安装器在本地从固定提交构建，保留该提交的完整许可与 NOTICE |
| PyTorch | 安装目标 `torch 2.6.0+cu124`；[PyTorch](https://pytorch.org) | 核心采用 [BSD 风格许可](https://github.com/pytorch/pytorch/blob/v2.6.0/LICENSE)；官方 wheel 单独下载，其内置第三方库及 CUDA 相关许可继续适用，不统一标为 Apache-2.0 |

本机复用环境可能与安装目标版本不同；锁文件记录的是项目安装目标，不能作为任意本机环境的已安装版本证明。

## 4. Python 与前端包级依赖

完整的锁文件条目列于 [依赖明细](docs/THIRD_PARTY_DEPENDENCIES.md)。主要依赖包括：

| 所属部分 | 主要第三方包 | 精确版本依据 |
| --- | --- | --- |
| 输入防护与模型加载 | `transformers`、`tokenizers`、`huggingface_hub`、`safetensors`、`sentencepiece`、`protobuf`、`numpy`、`scipy`、`scikit-learn`、`nltk`、`rouge_score`、`einops`、`requests`、`torch` 等 | [requirements-protect-lock.txt](requirements-protect-lock.txt) |
| AgentGuard | `langgraph` 及其 checkpoint / SDK 包、`langchain-core`、`mcp`、`mcp-types`、`wasmtime`、`PyJWT`、`cryptography`、`pydantic`、`pycdlib` 等 | [requirements-lock.txt](modules/agentguard-group2/requirements-lock.txt) |
| Aegis 后端 | `fastapi`、`uvicorn`、`starlette`、`pydantic`、`python-multipart`、`PyYAML` 等 | [后端锁文件](modules/aegis/demo_web/backend/requirements.lock) 及 [安全覆盖约束](modules/aegis/demo_web/backend/runtime-security.lock) |
| Aegis 测试 / CI | 开发锁文件与 CI 附加项，如 `pytest`、`httpx2`、`requests`、`yara-python` | [开发锁文件](modules/aegis/demo_web/backend/requirements-dev.lock)、[CI 锁文件](modules/aegis/demo_web/backend/requirements-ci.lock) |
| Cisco 扫描器依赖 | 固定提交构建所需的直接与传递依赖，含条件性平台条目 | [Skill 依赖锁](modules/aegis/results/skill_scanner_locked_requirements.txt)、[MCP 依赖锁](modules/aegis/results/mcp_scanner_locked_requirements.txt) |
| Aegis 前端运行依赖 | `react 19.2.8`、`react-dom 19.2.8`；MIT，具体版本声明见依赖附表 | [package.json](modules/aegis/demo_web/frontend/package.json) 与 [pnpm-lock.yaml](modules/aegis/demo_web/frontend/pnpm-lock.yaml) |
| Aegis 前端构建依赖 | `vite 8.2.0`、`@vitejs/plugin-react 6.0.5` 及锁定的传递 / 平台可选包；各包许可见依赖附表 | 同上；构建依赖不等同于全部进入运行时页面 |

各隔离环境可合法记录不同版本。本清单按环境分别列出，不用同名包的某一版本覆盖全部环境。
例如 Aegis 后端锁定 `idna 3.19`，AgentGuard 锁定 `idna 3.18`；子模块旧清单中的
`idna 3.15` 是历史安装快照，不作为当前锁定版本的依据。

## 5. 浏览器资源

| 资源 | 来源 / 版本 | 许可与交付方式 |
| --- | --- | --- |
| GSAP / ScrollTrigger | `3.13.0`；[GreenSock/GSAP](https://github.com/greensock/GSAP/tree/3.13.0) | 使用 [GSAP Standard License](https://gsap.com/community/standard-license/)，不是 Apache-2.0。文件包含在 `modules/govagentsec-ui/vendor`；保留原始版权和许可头 |
| Cabinet Grotesk Bold 字体 | [Fontshare](https://www.fontshare.com/fonts/cabinet-grotesk) | [ITF Free Font License](https://www.fontshare.com/licenses/itf-ffl)；字体二进制不提交。安装器从官方 CDN 下载并验证 SHA-256，缺失时回退系统字体 |

## 6. 外部运行环境与工具

以下为部署或构建所需的外部工具，不随本仓库重新授权。

| 外部组件 | 许可 / 条款依据 | 范围说明 |
| --- | --- | --- |
| Python / CPython | [PSF 许可与历史许可](https://docs.python.org/3/license.html) | 依环境使用 Python 3.11 / 3.12 / 3.13；运行环境不提交，内置库附加声明仍适用 |
| Node.js | [上游 LICENSE](https://github.com/nodejs/node/blob/main/LICENSE)：MIT 核心及随包第三方声明 | OpenClaw、Harness 和前端工具链宿主；不将全部内置组件统一归为 MIT |
| Git | [GPL v2 及上游说明](https://github.com/git/git/blob/master/COPYING) | 用于拉取固定来源；Git for Windows 自身附带组件依其发行版声明 |
| Conda / Miniconda | [Conda BSD-3-Clause](https://docs.conda.io/en/latest/license.html)；Miniconda 安装包与软件源另适用 [Anaconda 条款](https://www.anaconda.com/legal) | Conda 核心许可不能替代 Miniconda 安装包及仓库服务条款 |
| Docker Desktop | [Docker Desktop 许可说明](https://docs.docker.com/subscription-billing/desktop-license/) | 独立安装，适用 Docker Subscription Service Agreement；不能仅因使用 Docker Engine 而把 Desktop 标为 Apache-2.0 |
| NVIDIA CUDA 与驱动相关库 | [NVIDIA CUDA EULA](https://docs.nvidia.com/cuda/eula/index.html) 及各具体组件声明 | 驱动、工具包和 wheel 携带的运行库分别按其条款处理；不在本仓库提交 |

## 7. 沙箱容器镜像

镜像在部署时独立下载，不提交到 Git。来源与摘要取自
[skill_dynamic_sandbox_v2.json](modules/aegis/demo_web/config/skill_dynamic_sandbox_v2.json)。

| 用途 | 固定镜像引用 |
| --- | --- |
| Python / Shell 沙箱 | `public.ecr.aws/docker/library/python@sha256:dd29372629eeba2dd003fd9e9d35a5b8236c44727875a0364254b5127af88e65` |
| Node.js 沙箱 | `docker.io/library/node@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0` |

来源项目为 [docker-library/python](https://github.com/docker-library/python) 与
[nodejs/docker-node](https://github.com/nodejs/docker-node)。镜像中的操作系统软件包、语言运行时和
附带库采用各自许可证；镜像构建脚本的许可不代表整个镜像中所有内容的许可。

## 8. 清单范围与仍待确认的事项

- 本清单覆盖当前列明的仓库模块、主要模型、安装依赖与项目锁文件条目。条件性依赖及跨平台可选包也列入附表，但不宣称它们都已在本机安装。
- PyPI / npm 许可字段属于发布者声明；精确版本发布包中的完整许可、嵌入资源和随包 NOTICE 仍是分发时应保留的依据。依赖附表不是许可证全文的替代品。
- Aegis 子模块原有清单继续保留为历史安装快照和原有归属依据；当前版本选择应以相应锁文件、覆盖约束及本次依赖附表为准。
- 外部宿主、CUDA 库、Docker 镜像、模型权重和本地环境不提交到 Git。若另行分发包含这些内容的离线安装包，应随包保留实际制品中的许可与第三方声明。
- SimCSE 权重授权仍待确认；Qwen2.5 的 Ollama 标签及部分外部工具尚未按本仓库固定为内容摘要或版本。这些状态不被“下载成功”或“代码开源”自动解决。
- 漏洞演示 fixtures 中的模拟依赖声明不计为实际部署依赖；账号凭据、日志、缓存及个人运行数据不纳入交付清单。
