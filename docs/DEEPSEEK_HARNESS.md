# DeepSeek Harness 接入

Windows 预览版的下载、安装与启动见 [DeepSeek Harness 安装说明](./INSTALL_DEEPSEEK_HARNESS.md)。

独立 bundle、开发版 Windows 安装器、可移植运行时与事务安装说明见 [bundle 安装指南](./HARNESS_BUNDLE_INSTALLATION.md)，验证范围见 [开发验收记录](./HARNESS_BUNDLE_VALIDATION.md)。下文保留原有源码 overlay 部署方式。

本适配器把 GovAgentSec 的防护检查接到 DeepSeek Harness 的原生 Cordis 运行流程。
已验证宿主为源码版 `@deepseek-ai/dsh 0.2.2-alpha.2`、Node `26.7.0`。
不修改 Harness 源码，也不改 OpenClaw 插件、模型提供商或登录凭据。

## 已接入的检查

| 位置 | 行为 |
| --- | --- |
| `agent/pre-step` | 对实际进入下一步的文本输入检查；非 ALLOW 拒绝进入模型回合 |
| `tools/pre-execute` | 工具参数检查；BLOCK 拒绝，REVIEW 或敏感工具要求 Harness 原生单次审批 |
| `tools/post-execute` | 检查下游策略处理后的工具结果；风险结果替换成阻断反馈，不交给模型 |
| `llm/stream` | 缓冲文本、思考及工具调用流；文本与思考复检通过后才发出，避免先泄漏后撤回 |
| `govagentsec_scan_skill` | 对指定目录调用 Aegis 静态/敏感流/不可信执行流分析与 Group4 静态、权限、代码行为检查 |

防护模型通过本地 Bearer 认证的 sidecar 工作。真实模式使用现有 PIGuard、Qwen3Guard、
SimCSE 与 TrustRAG 权重，不把输入发给额外的云端安全模型。工具结果进入现有 TrustRAG
过滤路径。没有防护服务、检测器不可用、超时、格式错误或超限时都拒绝相应操作。

输入检查区分宿主与外部内容：Harness 自己生成的 `runtime-context` 和 `time-context`
不作为用户提示注入检查；`skill-catalog` 仅去除已核对版本的固定说明行，技能名称、描述及
其他未知行仍接受检测。用户输入、工作区指令、加载的 Skill 正文和未知插件来源均需检查。
输入阻断通过 Harness 原生错误界面显示 GovAgentSec 提示，避免回合静默结束；审计记录
来源类型、阶段和决定，不记录正文。升级 Harness 后应复测技能目录说明的兼容性。

敏感工具默认包括 `bash`、`pwsh`、`exec`、`write`、`edit`、`apply_patch`、`run_code`、`cordis`。
没有审批服务时，Harness 会拒绝执行。其他原有策略的拒绝与审批要求继续生效。

## 本机启动

### 完整安全工作区

Harness 聊天页右侧的 **安全工作区 ↗** 按钮打开完整页面，快捷键为 `Ctrl+Shift+G`。
工作区在独立对话框中运行，关闭、按 Esc 或点击“返回对话”后保留原聊天草稿；也可点击“独立页面”打开新标签。
已登录的本机独立入口为 `http://127.0.0.1:3081/api/govagentsec/workspace`。

工作区默认打开“防护设置”，采用与参考 OpenClaw 工作区相同的侧栏、浅绿色背景及纵向卡片布局：
上方为五项受控请求统计、六步控制路径及运行组件，中间为实际防护状态，下方为配置与维护。
统计来自本机 AgentGuard 审计；未配置或获取失败时显示“— / 待核验”。工具审批仍由 Harness 原生界面处理，
不提供 OpenClaw 业务登录或沙箱切换按钮。顶部“查看过程”保留实时防护链路入口。

| 页面 | 数据与操作 |
| --- | --- |
| 防护设置 | 安全总览、实际防护状态、配置与维护；统计与业务身份就绪状态分别展示 |
| 防护过程 | 当前 Harness 进程的真实检查状态、风险分数、服务就绪状态，以及本机最近 100 条脱敏审计（含历史） |
| 输入防护 | 输入、风险策略、工具返回与输出检查的接入说明和实时防护模型状态 |
| 动态权限（运行时安全） | AgentGuard 真实就绪状态、策略统计与本机执行审计；记录可能包含其他宿主的历史调用 |
| 能力准入（供应链安全） | 输入允许范围内的本地 Skill 绝对目录，执行现有 Aegis + Group4 检查、查看与下载 JSON 报告 |
| 审计演进（任务轨迹） | 核对真实回合的调用关系与完整事件时间线 |
| 经验自演进 | 查看隔离候选及质量、安全门控状态 |

工作区复用 `modules/govagentsec-ui/workspace-style.mjs` 的 OpenClaw 工作区样式令牌，
由 `integrations/deepseek-harness/workspace.mjs` 和 `ui/workspace*` 适配 Harness。
页面与接口均注册到 Harness 原生 owner 连接，不依赖 OpenClaw 网关或另一次登录。
新增接口为 `GET /api/govagentsec/workspace`、`GET /api/govagentsec/runtime`、`POST /api/govagentsec/scan`。
扫描仅接受 `{ "path": "绝对目录" }` JSON 请求，正文最多 8 KiB、路径最多 1024 字符；同一进程同时只接受一次扫描。
扫描范围和执行限制沿用原 `govagentsec_scan_skill`；结果不自动安装 Skill，也不执行待查代码。
工具审批继续使用 Harness 原生界面，不在工作区代为批准。OpenClaw 专属上传、安装、通知和动态沙箱流程未在此迁移。

### 运行过程可视化

启动后，Harness 聊天页右下方自动出现可折叠的 **GovAgentSec · 防护过程** 面板，显示：

- 输入安全检查与风险策略决定；
- 工具参数、工具返回内容的检查，以及 Harness 原生工具审批的待审批状态；
- 模型输出发送前复检的检查中、通过、拦截或异常状态；
- 防护服务的真实就绪状态与检测风险分数。规则基线模式会单独标注，不显示为真实模型就绪。

面板复用 Group1 的 `guard-events.mjs` 脱敏状态存储及 `ui/styles.css`，由适配器中的
`ui.mjs` 通过 Harness 原生 `webserver/index-inject` 接口加载，无需改动 Harness 安装文件。
`ui/panel.js` 和 `ui/styles.css` 是 Harness 的面板交互与布局适配。
页面与适配器代码更新后需重启 Harness 并刷新浏览器。

面板展示**当前 Harness 进程、全部会话中最近一次检查活动**，不提供当前聊天的独立历史记录。
重启后等待新的实际检测事件，不把历史审计回放成实时检测。审批操作仍在 Harness 原生审批界面完成。
状态接口为只读的 `/api/govagentsec/state`，沿用 Harness 的 Host/Origin 校验、登录认证与 owner 权限；
浏览器不接收防护服务令牌、提示词、工具参数、模型输出或会话标识。

原有 OpenClaw 页面和独立前端继续保留；Harness 完整工作区复用其共享样式、AgentGuard 只读数据模型和已有扫描器，
并按当前宿主的实际防护与审批能力展示。

准备完成后，双击根目录 `Start-DeepSeekHarness.cmd`，或运行：

```powershell
.\Start-DeepSeekHarness.ps1
```

默认使用 `D:\deepseek-harness` 的已构建 CLI，在 `127.0.0.1:3081` 启动并由 Harness
打开带登录令牌的浏览器入口。`3080` 可留给已有服务；用 `-Port` 修改端口。
`-NoOpen` 可禁止自动打开浏览器。前台运行时 Ctrl+C 退出。

首次或迁移机器时，在仓库根目录准备配置：

```powershell
python scripts/configure_deepseek_harness.py `
  --harness-root 'C:\Harness\deepseek-harness' `
  --python 'C:\GovRuntime\Scripts\python.exe' `
  --model-root 'C:\GovModels' `
  --trustrag-module 'C:\GovModels\TrustRAG\defend_module.py'
```

扫描器使用运行配置脚本的 Python，该环境需要兼容的 Pydantic 2；防护 Python 需要真实模型依赖与 CUDA。
配置输出在 `.runtime/deepseek-harness/`，sidecar 默认使用独立的 `19172` 端口。
令牌、机器路径、审计与验收结果均不进入 Git。

不持久安装时，启动器使用 `--patch` 加载生成的 overlay。安装到现有 web profile：

```powershell
python scripts/configure_deepseek_harness.py --install-profile
```

此命令备份原 `~/.dsh/profiles/web/cordis.patch.yml` 到项目运行目录，再添加带标记的插件段落，
保留现有设置。之后普通的 Harness web 启动也会加载防护。重复安装只更新自身段落。
恢复时删除 `BEGIN GOVAGENTSEC MANAGED INTEGRATION` 至 `END GOVAGENTSEC MANAGED INTEGRATION`
的段落；如期间有其他设置变更，不要整份覆盖回旧备份。

## 新版轨迹与受控技能演进

已适配 GovAgentSec `4e24831` 的共享轨迹存储、哈希校验、调用关系投影和候选门控组件。
工作区新增“过程台账 · 任务轨迹”和“经验自演进”，并以“行为护栏、权限闸门、过程台账、经验自演进”呈现四层能力。
新版 AgentGuard MCP 同时提供第五个工具 `read_gov_document`，只访问服务端固定注册的合成政务文档，保留密级、审批、单次票据与拒绝策略。

新版 AgentGuard 服务默认关闭开发身份。当前部署遵照用户选择保留此默认值；未配置正式 OIDC 身份时，业务 MCP 工具返回 `S006_BUSINESS_IDENTITY_DISABLED`，不会执行查询、付款或文档读取。
运行时页面区分服务依赖就绪和正式身份就绪。正式接入需要组织 HTTPS issuer、audience、当前用户短期令牌的安全注入，以及 MCP 的 OIDC 身份配置；原演示身份文件不能替代它们。

采集器订阅 Harness 原生 `session/event` 和 `agent/assistant-stream`，使用真实回合、模型尝试和工具调用 ID 配对。
不回放旧会话，不采集隐藏思考；提示、参数和结果正文仅保存脱敏内容的哈希与大小。
取消、失败、缺失用量和不完整配对不会补成成功经验。防护检测记录与实际已执行门控分开标识，待审批记录不等于审批通过。

启动器按端口分开保存轨迹：`.runtime/deepseek-harness/trajectory/3081/traces`；`-Port 3080` 使用对应的 `3080` 目录。
普通 Harness 启动未设置实例端口时使用 `trajectory/web`。同一实例目录仅允许一个宿主进程写入。
新增只读接口 `/api/govagentsec/trajectories`、`/api/govagentsec/trace?id=...` 和 `/api/govagentsec/evolution` 沿用 Harness owner 认证。

回合结束后可复用新版轨迹 CLI，由本机操作者确认任务归属、评审与生成候选：

```powershell
$dataDir = Join-Path $PWD '.runtime/deepseek-harness/trajectory/3081'
node modules/govagentsec-trace/cli.mjs list $dataDir
node modules/govagentsec-trace/cli.mjs verify $dataDir TRACE_ID
node modules/govagentsec-trace/cli.mjs assign $dataDir TRACE_ID TASK_KEY
node modules/govagentsec-trace/cli.mjs assess $dataDir TRACE_ID LOCAL_JUDGE_CONFIG.json
node modules/govagentsec-trace/cli.mjs generate $dataDir GENERATION_CONFIG.json
```

评审配置和候选配置沿用 `modules/govagentsec-trace/config.example.json` 的字段，但必须替换 OpenClaw 路径为本机实际 Harness 技能加载目录。
生成配置的 `loaderRoots` 必须包含项目、用户、自定义及内置的所有技能加载根目录；候选区必须与这些目录互斥。
适配器可通过 `skillLoaderRoots` 配置同一组目录以核验并展示已有候选；未配置时页面明确显示待核对状态。
缺少合格本地标定时保持隔离，不把启发式分数当作生产安全许可；生成至少需要两条同任务的已确认合格轨迹及有效质量评审。
候选继续经过 Aegis + Group4、独立任务验证和人工确认。OpenClaw 专属发布、宿主前端补丁和审批 RPC 不直接搬入 Harness，当前没有自动发布接口。

## 验证

```powershell
node --test integrations/deepseek-harness/test/*.test.mjs
python -m unittest discover -s integrations/deepseek-harness/test -p test_scan_skill.py
node scripts/verify_deepseek_harness.mjs
node scripts/verify_harness_trajectory.mjs
```

最后一项需要真实防护服务已启动，直接使用本机 Harness 已构建的工具注册与执行管线，
检查安全工具放行、未审批工具不执行、恶意输入阻断及输出发送前复检，不调用外部业务模型。
证据位于 `.runtime/deepseek-harness/verification.json`；审计只记录阶段、会话摘要与决定，
不保存输入、工具参数、模型回答或凭据。

## 范围

文本检查采用重叠窗口，不默默丢弃超长文本的尾部。单项最多 256,000 字符，超过拒绝；
缓冲流最多约 2 MB。当前不具备图片/文件内容检测能力，包含这类输入时拒绝处理。
输出缓冲会增加首字出现前的等待时间。分窗检测与模型检测都不构成准确率承诺。

工具正文按原始文本检查，值与渲染正文相同时只检查一次，不再把两份相同正文转义进 JSON。
原始用户任务通过独立字段交给任务一致性检测，外部正文里的 `User task:` 等文字不能改写任务。
明确的文档列表在同一 RAG 请求中处理，保留文档边界，任一片段被移除或拒绝时拒绝整个返回。
同一结果的结构化值、显示文本和补充上下文分别复检，不把不同表示误当成不同检索文档做聚类。
多片段最多 16 项、合计 16,000 字符、完整请求 64 KiB，超限拒绝；不会用不完整子集冒充完整聚类。
单片段仍采用分窗；窗口按完整请求的 UTF-8 大小缩小，保留重叠。检测模型内部的 token 截断限制仍独立存在。
输出上下文优先使用已通过输入检查的用户任务，后来的工具或 Skill 上下文不能覆盖它。
只有用户的解释、分析、翻译等引用任务会提供引用意图；该提示不会跳过内容、执行行为与泄露检查。

扫描工具只允许配置的 `allowedRoots`，拒绝链接、目录联接及超限目录。它不执行待查代码，
不运行 Cisco 扫描器、Ollama 语义分析或 Docker 动态沙箱，不自动安装 Skill。
它复用完整 Aegis 本地静态、语义规则、能力对齐、覆盖、上下文检查及既有 F3，再执行原 Group4 检查；
模型参数、Group4 规则及风险阈值保持原有值；权限结果按 Group4 实际返回的“完成”和风险等级映射，
公开权限正常完成可放行，缺失仍需复核，未知权限拒绝。
原生 `skill` 工具和 `/skill` 注入在使用本地包前强制扫描，校验加载正文与扫描包的正文哈希。
只有与已安装 Harness 的官方渲染器完全匹配时，才移除固定宿主包装再检查原始正文；
额外文本和不同包装继续完整检查，用户文本不能声明自己是 Skill 来跳过检测。
原生工具的 REVIEW 必须通过 Harness 审批；加载后再次核验包摘要，变更时拒绝。
斜杠注入只直接接受 ALLOW；需要复核时应改用原生 Skill 工具审批。
不在扫描根目录内、虚拟、远程或非目录包的 Skill 无法完成当前准入，会拒绝加载。
可用的外部本地 Skill 目录需明确加入 `allowedRoots`；不会因提供了一个路径就扩大扫描范围。
插件安装、第三方自定义加载器、Cisco/动态沙箱仍未接入 OpenClaw 的联合安装准入协议，
不能把当前本地 Skill 加载门禁描述成已覆盖任意插件安装。

Harness 提供上述四个安全工作区页面和聊天防护浮窗；OpenClaw 专属的安装与管理流程仍属于原宿主。
本适配器的工具审批使用 Harness 原生能力；
AgentGuard 的 OPA、一次性票据和隔离业务能力通过独立 MCP 接入，仅覆盖其受控 MCP 工具，
不能把 Harness 任意原生 Shell 调用称为已经走过 AgentGuard 票据链。

官方扩展机制见 [Harness 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
与 [工具执行管线](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md)。
