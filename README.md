# 政安智枢 GovAgentSec

**GovAgentSec（政安智枢）是一套运行在 OpenClaw 中的智能体安全系统**，将输入防护、运行时安全、供应链准入和技能安全测评整合到一个控制台入口。它面向需要安装第三方 Skill、连接 MCP 工具、处理外部内容并执行本地操作的智能体场景，帮助使用者检查风险、控制敏感操作并追溯处理结果。

系统覆盖三个主要环节：**安装前检查扩展是否可信，运行时检查输入与工具操作，执行后查看输出风险与审计记录。** OpenClaw 负责智能体运行和模型调用，GovAgentSec 通过插件、安装策略和本地服务提供安全能力。

Windows 集成发行版。已在原生 Windows、OpenClaw `2026.7.1-2` 上完成整套安装、真实模型推理、联合准入与五个控制台页面验收，详见 [验收记录](docs/VALIDATION.md)。


## 政安纵深（当前版本主题）

评委演示与能力叙事统一为 **政安纵深** 四层（与控制台模块一一对应）：

| 中文名 | 对应能力 | 说明 |
| --- | --- | --- |
| 行为护栏 | 输入防护链（原 Group1） | 提示注入、内容安全、工具结果与输出检查 |
| 权限闸门 | AgentGuard | 受管工具策略、审批、执行票据；含政务受管读文件演示 |
| 过程台账 | 轨迹审计 | 会话轨迹、调用关系图、审批与准入证据 |
| 经验自演进 | 轨迹转 Skill | 质量+安全双门控，候选隔离后经联合准入，不自动安装 |

文档总索引见 [docs/README.md](docs/README.md)。宿主锁定 OpenClaw `2026.7.1-2`。

当前版本将安全功能直接放入 OpenClaw 工作区：左侧固定 **工作台、能力接入、待审批、任务轨迹**；顶栏常驻 **任务与轨迹**，切换页面或折叠侧栏后仍可打开。首页展示真实待办、最近对话任务和防护覆盖；能力接入直接使用紧凑的 Skill/MCP 表单。详见 [原生工作区使用与部署](docs/openclaw-workspace.md)。

| 模块 | 功能 | 源码 |
| --- | --- | --- |
| Aegis | Skill / 插件安装前审计、Docker 隔离扫描、报告、规则和 MCP 准入 | `modules/aegis` |
| AgentGuard | 工具调用策略、审批、一次性执行票据与审计 | `modules/agentguard-group2` |
| 输入防护链 | PIGuard、Qwen3Guard、TrustRAG 检测与 OpenClaw 生命周期保护 | `modules/protect-agent-group1` |
| 安全测评与审计 | Skill 文档、权限和代码行为检查 | `modules/supply-chain-group4` |
| 轨迹治理 | 会话轨迹图、AgentGuard 审批关联、MCP 配置准入证据与受控技能演进 | `modules/trajectory-governance` |

## 项目功能

完整的使用前、使用中、使用后流程，以及各模块如何衔接，见 [产品使用逻辑与模块协同](docs/产品使用逻辑与模块协同.md)。该文档区分现有能力、当前接入状态和下一步整合项。

### 1. Aegis：扩展安装与供应链准入

在 Skill 或插件进入 OpenClaw 前执行安全检查，并把判断依据保存在可查询的报告与审计记录中。

- **安装前检查**：接入 OpenClaw 安装策略，对 Skill 和插件给出放行或阻断决定；当前安装配置将需要复核的结果按阻断处理。
- **静态与语义分析**：检查文档、代码及可疑指令，结合本地 Ollama 模型辅助识别隐瞒行为、敏感访问和指令覆盖等风险。
- **Docker 隔离试运行**：对支持的 Python、Node.js、Shell 入口进行隔离执行，收集运行证据；容器禁止联网、使用只读根文件系统和非特权用户。
- **安全管理页面**：查看准入统计、扫描报告、审计链状态，管理自定义规则及 MCP 准入相关信息。

### 2. AgentGuard：工具操作与运行时管控

为接入 AgentGuard 的工具调用提供策略判断、审批和执行记录，帮助使用者控制可能产生实际影响的操作。

- **策略决策**：由 AgentGuard 与 OPA 对受管操作进行检查，返回允许、需要审批或拒绝。
- **审批与执行票据**：对需要确认的请求记录审批结果，并使用一次性执行票据约束后续执行。
- **MCP 工具接入**：提供通知查询、测试支付请求、受保护命令执行和请求状态查询接口。
- **运行时控制台**：查看服务就绪状态、操作时间线、审批记录和异常事件。

这里的管控范围是已接入的工具与执行路径，不代表自动接管机器上的所有进程或任意第三方工具。

### 3. 输入防护链：提示注入、内容风险与检索材料检查

通过本地防护服务接入 OpenClaw 生命周期，在智能体开始运行、工具调用前后及最终回复前进行相应检查。

| 组件 | 主要作用 |
| --- | --- |
| PIGuard | 检测输入中的提示注入风险 |
| Qwen3Guard | 对用户输入及模型回复进行内容安全分类 |
| TrustRAG + SimCSE | 对检索材料进行聚类与 n-gram 过滤，辅助筛除污染内容 |
| OpenClaw 防护插件 | 将检测结果接入运行流程，记录防护事件，并按策略放行、请求复核或阻断 |

发行版默认使用真实模型，权重从官方固定版本下载后在本机加载。TrustRAG 当前接入的是官方第一阶段过滤能力，具体范围见下方模型说明。

### 4. 安全测评与审计：Skill 专项检查

对指定目录中的 Skill 文档与代码执行分阶段检查，既可用于手动排查，也参与安装时的联合准入。

- **静态扫描**：检查可疑文本、提示投毒指令和代码风险线索。
- **权限校验**：检查 Skill 的权限声明与相关访问配置。
- **行为检查**：分析代码中的敏感访问、外传等行为线索；此处代码分析与 Aegis 的 Docker 实际执行是不同检查环节。
- **报告与调用入口**：生成包含风险项和处理建议的报告，通过控制台或 `security_scan` MCP 工具发起检查。

安装 Skill 时，Aegis 与此模块组成联合策略；任一模块发现阻断条件，都不能自动放行。

## 模块如何配合

```mermaid
flowchart TD
    A[安装 Skill 或插件] --> B[模块一：Aegis 供应链安全中心<br/>安装前审计与隔离扫描]
    B --> C{是否为 Skill}
    C -->|是| D[模块四：安全测评与审计 Group4<br/>Skill 专项检查与联合准入]
    C -->|否| E[插件准入决策]
    D --> F[允许安装或阻断]
    E --> F
    G[用户输入与外部内容] --> H[模块三：输入防护链 Protect Agent<br/>提示注入、内容安全与检索材料检查]
    H --> I[OpenClaw 智能体运行]
    I --> J[模块二：AgentGuard 运行时安全<br/>受管工具的策略、审批与执行票据]
    J --> K[模块三：输入防护链 Protect Agent<br/>工具结果与最终输出检查]
    F --> L[/GovAgentSec 统一控制台<br/>输出准入结果、风险报告与审计记录/]
    J --> L
    K --> L
```

例如，安装一个第三方 Skill 时，先检查其声明、代码和可疑指令，再按适用条件执行隔离试运行；运行过程中，防护链检查输入与工具结果，AgentGuard 处理受管操作的策略与审批。使用者可在统一控制台查看对应的风险、报告和记录。

## 适用场景与使用入口

- **引入第三方扩展**：安装前检查 Skill、插件及相关工具接入风险。
- **处理外部材料**：识别输入、工具返回或检索内容中的提示注入和内容风险。
- **控制敏感操作**：对受管命令和工具请求设置策略、审批与审计。
- **本机演示与集成验证**：在 Windows OpenClaw 中展示完整流程，并使用固定样例检查各模块是否正常工作。

安装完成后，OpenClaw 控制台提供统一入口及以下页面；第四模块通过独立路由访问：

| 页面 | 可以查看或操作的内容 |
| --- | --- |
| 政安智枢 GovAgentSec | 整套系统的统一入口与模块导航 |
| Aegis 供应链安全中心 | 安装准入、报告、审计、规则与 MCP 管理 |
| AgentGuard 运行时安全 | 服务状态、受管请求、审批与执行记录 |
| 输入防护 | 防护链状态、检测与风险事件 |
| 安全测评与审计（独立页面） | 发起 Skill 目录扫描并查看报告；访问 `/plugins/supply-chain-security/panel` |

## 安装目标

Windows、已有 OpenClaw `2026.7.1-2`、Python 3.12、Miniconda、Git、Docker Desktop Linux 引擎、Ollama 与 NVIDIA CUDA 显卡。验收硬件为 32 GB 内存、RTX 3070 Ti Laptop 8 GB 显存；这不是最低配置承诺。安装包含多个隔离 Python 环境、约 3 GB 防护权重、4.7 GB Ollama 模型及 CUDA 安装缓存，请预留充足磁盘空间。宿主模型提供商由用户自行配置。

尚未安装 OpenClaw？先按 [独立 Windows 部署说明](docs/OPENCLAW_WINDOWS.md) 操作。

## 一键安装

下载本仓库 ZIP 并解压到长期保留的目录，或执行：

```powershell
git clone https://github.com/zhlearn0318-nan/GovAgentSec.git
cd GovAgentSec
.\Install.cmd
```

也可直接双击 `Install.cmd`。安装器检查并通过 winget 补齐缺失的应用，下载固定版本 Python 依赖、官方模型权重、OPA 和沙箱镜像，完成真实推理与准入检查后接入 OpenClaw。当前定制宿主基线为 `2026.7.1-2`，安装时校验适配结构，保留配置和宿主文件备份。首次 Docker/WSL2 初始化、Windows 权限提示或系统重启需按系统提示完成，再重新运行安装器；模型提供商凭据需自行填写。

权重保存在本地 `models/`，不放进 Git 仓库。下载支持重试及权重断点续传；复装复用校验通过的文件和已有固定摘要镜像。

也可以先生成配置供检查：

```powershell
.\Install.ps1 -PrepareOnly
```

安装器保留无关插件、MCP 和模型配置，在 OpenClaw 状态目录的 `govagentsec/` 下备份配置与控制台入口。发现不属于 Aegis 的现有安装策略时停止。它注册当前用户登录时启动的 AgentGuard 任务，防护服务由网关管理；安装后不要移动仓库目录。安装完成后刷新 OpenClaw 控制台，选择“政安智枢 GovAgentSec”。也可直接打开 `http://127.0.0.1:18789/plugins/govagentsec/panel`（若修改了网关端口，请替换端口）。

```powershell
.\Verify.ps1
```

首次启动会等待模型预热。安装失败会尝试恢复配置、控制台入口和原 AgentGuard 服务，报错中给出备份位置；修复原因后重新运行。详细组件结构与维护入口见 [维护说明](docs/MAINTENANCE.md)。

## 官方模型来源

具体提交和权重 SHA-256 记录在 `models.lock.json`：

- [PIGuard](https://huggingface.co/leolee99/PIGuard)
- [Qwen3Guard-Gen-0.6B](https://huggingface.co/Qwen/Qwen3Guard-Gen-0.6B)
- [SimCSE](https://huggingface.co/princeton-nlp/sup-simcse-bert-base-uncased)
- [TrustRAG](https://github.com/HuichiZhou/TrustRAG)

TrustRAG 当前接入官方第一阶段聚类与 n-gram 过滤，不代表论文中全部可选流程。模型冒烟测试仅验证真实推理与接口工作，不代表安全检测准确率。

## 数据与配置

受管 MCP 新增 `read_gov_document`，用于隔离合成数据的密级、受保护资源和一次性审批演示。参见 [运行命令、验证结果与限制](docs/CONTROLLED_DOCUMENT_VALIDATION.md)。

不分发作者的密钥、令牌、聊天记录、上传文件、审计数据库或已安装 Skill。新部署的历史记录从空开始。AgentGuard 开发身份默认停用。正式业务执行需要组织 OIDC 配置和逐用户授权委托，接入检查见 [身份与交付说明](docs/DELIVERY_ACCEPTANCE.md)。安装会启用本地轨迹采集和输入检查；新 govagentsec-trace 默认仅保存脱敏后的内容哈希和事件元信息，不保存 prompt、参数及输出原文。

界面内嵌使用 OpenClaw 的 `scripts` 模式，保留来源隔离。敏感面板由已认证管理员通过一次性访问凭据打开；匿名请求拒绝访问状态与审计数据。动态代码扫描仍使用禁止联网、只读根文件系统、非特权用户的 Docker 容器。

## 项目结构与文档

### 轨迹审计与候选 Skill

OpenClaw **审计中心**提供 JSONL 驱动的调用图、毫秒时间线、同 task_key 多运行对比及候选来源。人工确认任务归属后，按安全 S 严格门控，再按质量 Q 取 TopK，归纳到隔离的 skill-workshop，重新通过 Aegis + Group4 联合准入；不会自动安装。

```powershell
node scripts/probe_trace_hooks.mjs
node modules/govagentsec-trace/demo.mjs
```

演示产生六条本地合成轨迹和候选，并调用真实联合准入验证通过与拒绝。默认评审明确标为本地测试来源，不代表本地模型已经标定。详见 [运行与接口](modules/govagentsec-trace/README.md)、[固定版本 Hook 核验](docs/TRACE_HOOK_VERIFICATION.md)、[评分规则与边界](docs/TRACE_SCORING_AND_EVOLUTION.md)、[本轮验证结果](docs/TRACE_DELIVERY_VALIDATION.md)。

真实 Agent 采集冒烟：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke_real_trace.ps1`。它连接真实 OpenClaw、要求本地模型与已授权 AgentGuard MCP，校验同一 runId 的事件、参数哈希、执行回执和哈希链；失败退出非零并写 report.json。[前置条件、历史阻塞与复跑](docs/TRACE_LIVE_SMOKE.md)。

2026-11-07 已跑通**六条真实轨迹的本地演进演示**：`node scripts/evolve_real_demo.mjs local-validation/trace-audit`。优先复用，不足再补采；同任务 4 条安全通过、2 条隔离，TopK 取 3 条，候选公共步骤为“受控读预案 → 查询公告”，良性联合准入通过、毒技能拒绝，输出评分/对比/候选/调用图素材。本机使用获授权的 `loopback_static_dev` 演示身份，非生产 OIDC；`admission_passed` 不等于发布。[报告、复现命令与恢复轨迹缺失边界](docs/REAL_MULTI_TRACE_EVOLUTION.md)。

```text
GovAgentSec/
├─ Install.cmd / Install.ps1     # 安装到已有 OpenClaw
├─ Setup-OpenClaw.ps1            # 单独部署 OpenClaw 宿主
├─ Verify.ps1                   # 已安装系统验收
├─ modules/
│  ├─ aegis/                    # 扩展审计与安装准入
│  ├─ agentguard-group2/        # 运行时策略、审批与审计
│  ├─ protect-agent-group1/     # 输入、工具结果与输出防护
│  ├─ supply-chain-group4/      # Skill 专项检查
│  ├─ govagentsec-trace/        # JSONL 轨迹、双门控、候选 Skill
│  └─ govagentsec-ui/           # 首页及三个安全入口共享的界面资源
├─ scripts/                     # 下载、配置生成及验证工具
├─ hooks/                       # 网关启动集成标记
├─ third_party/TrustRAG/         # 保留许可证的官方过滤代码
├─ models.lock.json             # 官方模型版本与文件校验和
└─ docs/                        # 部署、维护与验收说明
```

- [独立部署 OpenClaw](docs/OPENCLAW_WINDOWS.md)
- [维护说明](docs/MAINTENANCE.md)
- [已验证功能与验收边界](docs/VALIDATION.md)
- [发行版下载](https://github.com/zhlearn0318-nan/GovAgentSec/releases)

## 开源许可

新增整合代码及自有模块采用 [Apache-2.0](LICENSE)。AgentGuard 保留原 MIT 许可证，其他第三方代码和模型遵循各自许可，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。
