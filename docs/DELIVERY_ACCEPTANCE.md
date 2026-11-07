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
