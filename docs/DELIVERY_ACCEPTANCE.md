# OpenClaw 定制交付整改记录

核验日期：2026-11-05。宿主适配基线：OpenClaw `2026.7.1-2`。

本轮已把输入拦截、工具返回前审查、按任务保存的防护决策及轨迹图接通。正式业务身份未配置，因此 AgentGuard 开发身份工具和页面执行默认停用；不能将当前环境称为已完成组织身份验收。

## 使用路径

1. **能力接入**：在工作区提交 Skill/MCP 检测，查看准入结果和报告。已安装技能使用只读清单；随附内置技能默认停用，由管理员逐项审核后开启。
2. **对话执行**：左侧常显输入防护链，顶栏“当前任务”打开当前会话的任务详情。输入被拒绝时停止运行；工具文本返回经过检测后才交给模型。状态来自后端能力和服务探测。
3. **任务追溯**：进入“审计中心”，按任务查看输入、模型、工具、防护决策、审批与回执。测试记录默认不进入日常视图，可切换“测试”或“全部”。
4. **配置维护**：进入“防护设置”，查看当前覆盖、身份缺失项、上游更新和策略面板；子面板均有返回入口。

## 对审查清单的逐项处理

| 编号 | 处理结果 | 验收边界 |
|---|---|---|
| P1 防护链隐藏 | 移除隐藏样式，默认展开，通过认证 RPC 获取当前会话状态 | 新的注入测试在对话中显示阻断，工具阶段跳过 |
| P2 状态写死 | 改为真实服务探测、授权状态和宿主适配状态；每次防护决策按 run ID 写入轨迹 | 回复终审仍是复检/请求重写，聊天流式输出没有完整发送前门控 |
| P3 compare 深链 | `section=compare` 与审计页按钮落到同一工作区视图 | 保留对照与候选记录作为高级功能 |
| P4 准入路径 | 工作区改为只读技能清单；默认停用随附内置技能；检查宿主安装策略调用点 | 原生市场安装调用安装策略，“存在市场即旁路”不成立。手工复制到技能目录的存量代码仍需补做准入；不能宣称已覆盖任意文件系统写入 |
| P5 更新提示 | 更新提示集中在防护设置，注明定制基线；提供宿主适配预检和恢复脚本 | 未升级上游，也未宣称包含新版本安全修复；升级需单独回归 |
| P6 设置导航 | 防护设置进入一级导航，带当前页高亮和面包屑 | 日常入口无需快捷键 |
| P7 子面板返回 | 所有设置子面板保留“返回防护设置” | 保留单层来源隔离 iframe |
| P8 轨迹入口 | 审计中心负责历史，当前任务负责上下文详情；旧 history 地址转到审计中心 | 原始兼容组件仍存在于源码，不作为独立主入口 |
| P9 测试数据 | 日常/测试/全部筛选；原始会话 key 显示为任务名或未命名会话 | 不删除历史证据；不会因会话名称含测试前缀就隐藏真实用户任务 |
| P10 中文交付 | 登录错误帮助、技能筛选、语言名称补齐中文 | 开发者高级设置仍可能包含协议名和上游技术术语 |
| P11 编码 | 本轮源码按 UTF-8 检查，轨迹分隔符正常显示 | 不自动重写已有证据文件 |
| P12 视觉 | 登录、工作区、嵌入面板共用浅色和青绿色控件；去掉嵌入页营销头部 | 部分复杂管理表单仍沿用原模块结构 |
| P13 默认安全 | `allowInsecureAuth=false`、`embedSandbox=scripts`；概览移除凭据控件 | 登录页按认证需求仍接受令牌/密码 |
| P14 匿名访问 | 敏感页面须管理员签发一次性访问凭据；状态/API 使用受限页面凭据；轨迹数据由网关鉴权 | 不含用户数据的 JS/CSS 静态资源仍公开，和登录壳相同 |
| P15 开发身份 | MCP `enabled=false`，去除开发身份文件配置；插件执行默认 disabled；服务默认拒绝无 OIDC 的执行 | 等待真实 issuer、audience、角色和用户令牌委托；不以网关管理员令牌冒充业务身份 |
| P16 可达性 | 可见主导航、当前页状态、返回路径、面板标题、键盘焦点、Escape 关闭、减少动画 | 未完成专业读屏器全流程验收 |

## 安全边界与身份接入

管理页面访问使用 `govagentsec.ui.open` RPC，要求 `operator.admin`。访问凭据有效期 60 秒、仅限指定 URL、使用一次即作废；页面的 API 凭据与网关登录令牌分开。iframe 保持 `allow-scripts`，不授予 `allow-same-origin`。

AgentGuard HTTP `/approvals/resolve` 在 OIDC 模式下用已验证声明确定审批人和角色，不再相信请求体里的姓名/角色。原申请人和动作来自服务端保存的已验证待审批请求，防止改写申请人绕过禁止自批。服务重启后，未完成请求需要重新发起，不使用未经验证的历史请求恢复执行。

检查当前接入缺口：

```powershell
python scripts/check_identity.py
```

正式服务配置至少包括：

| 配置 | 要求 |
|---|---|
| `AGENTGUARD_OIDC_ENABLED` | `true` |
| `AGENTGUARD_OIDC_ISSUER` | 组织实际 HTTPS issuer，发现与密钥访问禁止重定向 |
| `AGENTGUARD_OIDC_AUDIENCE` | 组织分配给 AgentGuard 的 audience |
| 角色声明 | 当前验证器读取 `realm_access.roles` 或 `resource_access.agentguard.roles` |
| 审批角色 | `business_approver`；发起人不可审批自身请求 |
| 必需声明 | `sub`、`department`、`clearance`，以及 MFA 声明 |
| 用户令牌 | 短期用户令牌由受信登录/委托流程注入，不使用共享开发身份 |

`check_identity.py` 只检查配置缺口，不会把“字段已填写”判为身份已验证。完成真实身份源接入后，需要分别测试有效用户、错误签名/issuer/audience、过期令牌、缺少角色、缺少 MFA 和自批请求。当前 Control UI 没有逐用户 OIDC 委托通道，业务执行保持停用。

工具返回前适配目前支持可序列化、合计不超过 15,000 字符的文本结果。超限、非文本、检测服务不可用时隔离结果；启用时暂停未经审查的工具流式更新。它控制的是工具返回给模型的内容，不撤销工具已经产生的外部副作用；工具调用前控制仍由权限和策略负责。

## UI 身份徽章（U4，2026-11-07）

工作台、待审批、防护设置顶部及嵌入的运行防护面板均显示身份边界。管理页面访问权限与业务身份分开判定：

| 显示 | 判据 | 页面执行/审批 |
|---|---|---|
| 未配置组织身份（OIDC） | 未取得组织身份启用证据 | 禁用 |
| 演示身份（非生产） | MCP/插件显式配置 loopback_static_dev，或服务报告开发身份启用 | 禁用；红色“仅本机验收” |
| 组织身份已启用 | 服务 `/version` 报告 oidc_enabled=true，且 `/readyz` 整体就绪、identity 依赖健康 | 当前仍禁用，Control UI 尚无逐用户业务令牌委托 |
| 组织身份未就绪（OIDC） | 已启用 OIDC，但依赖检查未通过 | 禁用 |

单独填写 MCP 的 `oidc` 配置、健康探针返回 healthy，均不能使徽章变绿：未启用 OIDC 时 identity 探针可能是可选健康项，必须同时核对服务版本信息。嵌入面板读取失败会清除旧的就绪徽章，显示“身份状态不可用”。徽章不是当前用户拥有权限的证明，也不是生产组织身份验收结论。

“如何配置组织身份”直接给出本文“安全边界与身份接入”及 `python scripts/check_identity.py` 的维护指引。U4 原批次没有新增演示开关；U4b 新增的独立演示身份入口见下节，默认关闭，不开放原页面生产执行入口。历史请求、审批和回执继续可查。独立命令行/MCP 合成演示保留原显式测试身份与审计机制。

服务端同步拒绝有效管理页面凭据发来的 `/api/evaluate`、`/api/approvals/resolve` 和 `/api/demo/gov-documents`，返回 **403 BUSINESS_IDENTITY_REQUIRED**；轨迹关联审批 RPC 也不再接受开发身份执行。开发者修改 disabled 属性、填写审批人或拿到网关管理员令牌都不能通过这些入口执行。原 OIDC 服务端禁止自批及角色校验不变。

本机本轮实际显示 **演示身份（非生产）**；这是后续显式演示配置的状态，不代表上文早期 P15 默认停用整改被本轮改回。U4 没有改网关配置。U3 候选人工复核仅写本地回执，不是这里的业务动作审批，也不赋予执行权。

## 演示身份源（U4b，非生产）

组织 OIDC 未接；当前为演示身份源，校验路径与生产同源。

在 OpenClaw 的**工作台 / 待审批 / 防护设置 → 演示身份源**中操作。默认关闭；仅已登录的本机网关管理员可以启用和选人，管理员凭据本身不能作为业务 Bearer。

1. 点击“开启演示身份源”，选择“经办 · office-test”，点击“建立演示会话”。
2. 点击“发起台风通知送审（合成）”。记录进入 `pending_approval`，经办的人工确认按钮禁用；绕过按钮调用服务仍返回 `D105_SELF_APPROVAL`。
3. 切换“处长审批 · approver-test”，重新建立会话，再点击该记录的“人工确认并执行”。只有这里通过双人审批后，原 AgentGuard 链路才向独立本地送审箱写入一次合成记录。
4. 可用“财务 · finance-test”发起 600 元测试付款，再由处长审批。普通经办发起付款命中角色拒绝；所有付款只写测试账本。
5. 点击“关闭演示身份源”。关闭会撤销内存签名密钥和待审批请求，旧 Bearer 不能再执行。界面恢复 U4 默认禁用态；刷新后也不会自动开启。

| 演示用户 | 已签名角色 | 密级 / 部门 | 用途 |
|---|---|---|---|
| office-test | office_user | 1 / 综合办公室 | 发起合成通知送审；不能审批 |
| finance-test | finance_operator | 2 / 财务部 | 发起合成付款；不能审批 |
| approver-test | business_approver | 2 / 审批中心 | 审批他人原始请求；不能自批 |

实现选择 **B3 + 进程内 RS256 JWKS**。用户声明来自既有 `identity/keycloak/agentguard-realm.json`，不读取或使用其中的密码占位符。每次激活生成新 RSA 密钥；JWT 的签名、issuer、audience、有效期、scope/client、角色、部门、密级和 MFA 声明均经过现有 `OidcVerifier`。只替换演示元数据/JWKS 的读取方式，没有关闭生产 `_build_verifier` 的 HTTPS 或重定向校验，也没有开放 HTTP issuer。

**身份真实性边界：** 本地管理员可直接选择固定演示用户，MFA/amr 为合成声明，不是组织登录、真实 MFA 或真实人员身份认证。徽章、回执及审计固定标“演示身份源（非生产）”；`check_identity.py` 不把该 issuer 判为组织配置完成。

激活最多 15 分钟，Bearer 最多 5 分钟且不超过激活期限。Bearer 只在当前页面内存与私有进程通道中流转，不写 localStorage、sessionStorage 或审计；刷新或离开该工作区页面后需要重新选人。默认不运行演示子进程，关闭及网关停止会撤销会话。异常/超时默认拒绝。

演示使用仓库 `.runtime/identity-demo/<运行编号>/` 中的独立 HMAC、审批状态和合成业务数据库，不修改 `openclaw.json`、正式 AgentGuard 服务或 MCP 身份配置。入口仅接受固定用户、固定场景及服务端保存的请求编号，不接受自报角色、动作路径、审批票据或摘要。执行链仍是 `invoke / resolve_approval_authenticated → OPA → task contract / action digest → 一次性审批凭证和 HMAC 票据 → Wasm / 隔离适配器 → 审计`。

原 `/api/evaluate`、旧运行防护 iframe 执行入口、真实任务审批和 Skill 候选发布闸保持原限制。新按钮“人工确认并执行”只处理本演示的合成业务记录，不安装或发布 Skill，不发送企业微信或外部消息。

复验（网关需已加载本轮插件代码）：

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts/verify_demo_identity.mjs
# 单独验证
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_boundary.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_demo_identity.py
node scripts/test_identity_live.mjs
node scripts/test_demo_identity_live.mjs
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\check_identity.py
```

一键验收输出 `local-validation/identity-demo/<UTC时间戳>/report.json`、`live-report.json`、命令日志、启停审计和真实页面 PNG；任何必测失败返回非零退出码。脚本结束在 `finally` 中关闭本轮演示，并比较网关配置前后 SHA-256。若进程被外部强杀，可在页面点击“关闭演示身份源”，或重启固定版本网关；不需要还原任何业务配置。

验证命令：

```powershell
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts/test_identity_boundary.py
node --test scripts/test_panel_access.mjs
node scripts/test_workspace_ia.mjs
node scripts/test_identity_live.mjs
```

最后一条需要本机网关及 Edge；只读实机页面，不发起业务动作。报告、截图和已知限制见 `UPGRADE_ROUND_VALIDATION.md` 的 U4 章节。

## 部署与恢复

本轮没有改变 `exec-approvals.json`。本机当前文件 SHA-256 与修改前一致。

`Install.ps1` 已纳入原生工作区、返回前适配、中文交付界面、本地轨迹采集及安全默认配置。宿主更新由以下脚本先在临时副本校验，再备份并应用；失败会恢复原文件：

```powershell
node scripts/install_delivery.mjs <OpenClaw安装目录> <新的备份目录>
node scripts/install_delivery.mjs <OpenClaw安装目录> <同一备份目录> --restore
```

已有部署的配置整改：

```powershell
python scripts/harden_openclaw.py --openclaw-root <OpenClaw安装目录>
python scripts/harden_openclaw.py --openclaw-root <OpenClaw安装目录> --apply
```

第一条只输出计划；第二条备份原配置并应用。启用输入防护时授权 Protect 插件访问对话；轨迹采集会在本机保存经过基础脱敏的对话与工具事件，部署前应明确本地保留政策。更新 Python/插件代码后重启 AgentGuard 和 OpenClaw。

宿主适配绑定经过验证的结构，未知版本直接报错，不猜测替换。当前已验证本机升级路径和适配器预检/恢复逻辑；未在全新 Windows 主机上重跑依赖安装流程。

## 回归证据

- Node：轨迹采集/完整性、关联、候选、发布、页面凭据、返回门控、Protect 钩子与状态路由。
- Python：OIDC 审批身份边界、默认停用开发身份、配置保留与准入扫描基础回归。
- 浏览器：设置返回、compare 深链、旧轨迹地址、测试记录筛选、会话名称、草稿保留、折叠侧栏、移动端、缓存迁移、匿名拒绝与认证后面板访问。
- 实际模型：正常输入 `ALLOW`，注入输入 `BLOCK`；真实宿主返回前适配接入真实检测器，正常工具文本放行，注入文本隔离。
- 对话实测：输入阻断，工具未执行；轨迹包含输入检查决策并封存，图中可查看该节点。

主要命令：

```powershell
node --test modules/trajectory-governance/test/*.test.mjs scripts/test_panel_access.mjs scripts/test_result_guard.mjs scripts/test_workspace_release.mjs scripts/test_ui_release.mjs
node --test "modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/test/*.test.mjs"
node --test scripts/test_delivery_installer.mjs
node scripts/test_result_guard_host.mjs
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts/test_identity_boundary.py
python scripts/test_release.py
node scripts/test_workspace_ia.mjs
node scripts/test_openclaw_workspace.mjs
node scripts/test_delivery_live.mjs
node scripts/test_protection_live.mjs
node scripts/verify_tool_result_live.mjs
```

本机报告和截图位于 `local-validation/delivery/`、`local-validation/workspace-ui/`、`local-validation/workspace-ia/`，不提交运行数据到仓库。模型测试是功能冒烟证据，不是准确率或完整安全性证明。

## U8 模型双路验收

会话 API 与本地评审分别验收，不能用其中一项替代另一项。

| 验收项 | 成功证据 | 当前边界 |
| --- | --- | --- |
| 会话 API 配置 | 固定宿主 schema 通过、默认 API provider、环境 SecretRef | 本轮模拟 API 回一句，不证明云账号可达；现网未自动切换 |
| 安全评审本地化 | 禁外部目标/重定向/云代理模型；断网启发式明确来源 | 新旧评审、Python 生成均有执行测试 |
| 防护保留 | 应用模型配置不改插件、工具拒绝与网关配置；四层回归通过 | 真实供应商切换后的新会话仍需部署验收 |

运行 `python scripts/check_model_routing.py`；设置页中文区分两条路径。详见 [MODEL_ROUTING.md](MODEL_ROUTING.md)。会话 API 必然接收会话上下文；真实敏感 prompt、公文和轨迹不得用于云冒烟或评审。

## U10 演示身份与任务最小权限

已在 U4b 同一演示源、U7 同一任务契约中补齐：审计只读角色、目录范围、越界硬拒绝、用户显式扩权申请与双人一次性放行。组织 OIDC 未接，所有页面与回执标「演示身份源（非生产）」；网关登录不等于业务身份。

操作：防护设置 → 开演示源 → office-test 建立会话 → 目录 A 创建只读任务 → 尝试目录 B（DENY）→ 申请一次性扩权 → approver-test 建立会话并确认 → auditor-test 查看台账 → 关闭演示源。

范围是独立合成文档 registry 的逻辑 URI 树，不是任意主机文件接入。基础工具/目录只可收紧；审批授权 60 秒、票据 30 秒且一次性绑定原任务/动作/scope。D004/D005 等硬拒绝仍不可审批覆盖；不宣称所有原生工具已受任务 ACL 管理。Aegis 能力准入、U9 会话沙箱保持原边界。

验收：`node scripts/verify_identity_task_acl.mjs`，12 条命令 exit 0；真实 UI 8 张截图、read_count 与恢复哈希见 [U10_IDENTITY_TASK_ACL_VALIDATION.md](U10_IDENTITY_TASK_ACL_VALIDATION.md)。演示结束已关闭，网关配置不变，OpenClaw 仍为 2026.7.1-2。
# 后续边界验收补充

**当前默认：仅演示；组织未接。** 演示开启、开发身份或配置字段齐全均不构成组织身份已验证；以 [U12](U12_ORG_OIDC_OR_DEMO_BOUNDARY.md) 和逐用户 [U13](U13_PER_USER_EXECUTION_DELEGATE.md) 的检查为准。

U17：会话 API 可达 ≠ 轨迹评审可出域。现网默认模型、模拟连通与本地评审分别记录，见 [双轨边界](U17_U8_LIVE_ACTIVATION_BOUNDARY.md)。

