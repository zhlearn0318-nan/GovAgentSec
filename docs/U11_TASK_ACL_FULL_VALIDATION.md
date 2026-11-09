# U11 聊天任务与原生工具 ACL 验收

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

**PASS（下述本地验收范围）**。U7b 前置现网检查通过；U10 回归 12 项全绿。无 scope 选 **A：硬 DENY**。已绑定演示业务身份的会话在 `before_agent_run` 自动建只读任务，原生与受管工具在 `before_tool_call` 先过同一 U10 内核。

最终证据：`local-validation/identity-task-acl-full/2026-11-08T06-40-00Z/`。一键验收退出码 **0**，7 组命令全部退出 0；包含真实 OpenClaw 页面截图 **2 张**。宿主固定 **2026.7.1-2**，未升级、未 push、未调用外部模型或发送轨迹。

## 结果与证据性质

| 验收 | 结果 / 证据 |
| --- | --- |
| U7b 现网通知工具 | PASS；tool-list-report.json，真实 MCP stdio tools/list |
| U10 原功能 | PASS；u10-report.json，12 项回归；原报告路径也写入总报告 |
| chat-scope-auto | PASS；固定宿主真实 hook dispatcher → 私有 worker → JWT/OPA；自动生成 task_id 和 scope_digest |
| native-read-deny | PASS；A 读取后 read_count=1，B 越权拒绝后仍为 1 |
| approve-once / replay-reject | PASS；经办自批拒绝，处长批准不读取；同会话新 turn 重试原动作，并发两次只有一次获准，read_count=2；再重放仍为 2 |
| 篡改 / 无 scope | PASS；更改 offset、换 run/session、未绑定身份均拒绝 |
| 路径 / 工具 | PASS；穿越、宿主绝对路径、符号链接、写/执行/网络及未知工具拒绝 |
| 通知与 OPA | PASS；通知不在契约时 P015；读 secret 保留 D004，审批不能越过 OPA 硬拒绝 |
| 故障边界 | PASS；5 项专项覆盖签票/OPA 故障、TTL、审批过期、重新绑定撤销、内部 RPC 伪造、脱敏；重复 start 保留原 scope 不扩权 |
| 原防护 | PASS；Protect tool-surface 与 U9 sandbox-policy 回归 |
| 真实页面 | PASS；绑定入口可用，内部 chat_* 不能作为网关 RPC 调用；测后演示源关闭，配置哈希不变 |

**证据不混称**：hook-report 使用合成 user turn、真实已安装宿主 dispatcher、真实本地 OPA/JWT/HMAC/SQLite，以及带计数的实际文件读取。它没有驱动一次模型聊天，也没有把测试文件读取冒充 Docker/SRT 执行。live-ui-report 是真实网关页面绑定验证；`provider_e2e=false`、`chat_messages_sent=0`。本包没有新增完整模型 → 原生工具 → U9 的生产路径 E2E 证据。

## 实现与覆盖

新消息只从本条明确的 `/workspace/目录/文件` 提取路径，不读取历史/工具输出作为授权。一个明确路径可直接建立其用户参数哈希；多路径仍需针对具体动作确认，不自动把整个目录的所有文件放开。公开预案意图映射现有 `emergency_plan` registry。无可信附件映射时不猜附件权限。

使用固定宿主 `config-Dy4vED5-.js` 的配置解析与 `docker-Hq4HIYYD.js` 的 `resolveSandboxWorkspaceLayoutPaths`，定位 **U9 实际会话工作目录**，不是普通 Agent workspace。要求 sandbox mode=all、scope=session、workspaceAccess=none、Docker/SRT；不符合就拒绝。未修改双沙箱实现。

| 工具实名 | 行为 |
| --- | --- |
| read | `native.read`：当前用户明确路径 + 任务范围；越权先拒绝，可申请原动作一次性扩权 |
| write、edit | `file.write`：进入同一 OPA/任务门控；现有经办角色无写角色权限，硬拒绝，不通过审批绕过角色限制 |
| exec | `shell.execute`：保留 OPA 角色、危险命令、沙箱与 provenance 要求；当前演示经办无执行权限 |
| web_fetch、web_search、browser | 默认拒绝，不用审批解除断网 |
| process、apply_patch、sessions_spawn、其他未映射工具 | 默认拒绝，尚未提供安全动作解析/委派授权，不默许替代入口 |
| agentguard-notices__read_gov_document、list_notices、request_test_payment、run_protected_command、submit_emergency_notice | 当前 run 任务 ACL 前置检查，然后仍受原 MCP 身份与网关限制；后端拒绝不被上层授权覆盖 |
| agentguard-notices__get_control_request_status | 暂拒绝，尚无原控制请求与当前业务主体的可靠授权映射 |

“纳入 ACL”包含明确拒绝，不表示所有工具都已对演示经办开放。MCP 原 request_id/task_id 保留；运行 ACL 的 task_id/run_id 单独关联。MCP 下游仍用现有身份配置，不能宣称 U4b 已透传为生产 MCP 业务身份。

## 审批与接口

- 新公开 RPC：`govagentsec.demoIdentity.bind_session`，仅 `session_key`、`bearer`，需要现有 operator.admin 与已验证的演示经办身份。不能传 subject、role、scope 或票据。
- 私有 worker 操作：chat_start / chat_tool / chat_result / chat_end，只由运行插件经 stdio 调用，不注册网关 RPC/MCP 工具。
- 越权在原审批卡点击“申请一次性扩权”；另一业务审批人点击“批准原动作单次重试”。卡片显示原逻辑目标、参数哈希、基础范围和 TTL。
- 同一 `TaskPolicies`、`resolve_approval_authenticated`、HMAC/SQLite 一次性核销。批准只签授权，不执行宿主工具；原会话、原主体 30 秒内重试原动作一次，其他参数或会话不能消费。关闭/过期/重新绑定撤销旧授权。
- 原生动作摘要还绑定实际 workspace 路径哈希；切换隔离引擎/目录后，旧票据不能授权另一个物理目录里的同名文件。
- native host mode 仅在私有演示 worker 开启。公共 AgentGuard 服务默认不开启；普通 HTTP 请求不能选择此执行模式。授权与 after_tool_call 执行观察分开记录，未返回正文或秘密票据。

## 复跑与页面操作

前置：固定版本网关运行，U7b PASS；AgentGuard 插件启用且允许 conversation hook；本地 OPA/Python/Wasmtime 与 Edge 可用。测试应在没有其他人使用演示身份源时顺序运行。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts/check_notify_tools_live.mjs
node scripts/verify_identity_task_acl.mjs
node scripts/verify_identity_task_acl_full.mjs
```

最后一个命令也包含前两个检查及 U11 专项，默认建立新的带时间戳证据目录；失败退出非零。可用 `$env:GOV_ACL_FULL_EVIDENCE` 指定输出目录。

页面：防护设置 → 开启演示身份源 → 经办“建立演示会话” → 填实际会话 key → “绑定聊天身份”。回到该聊天，当前消息明确写 `/workspace/A/文件名`；不存在的文件不会由 ACL 创建。越权操作在原审批队列里申请、换处长批准；回原会话重试同参数。页面登录刷新不替代会话绑定，JWT 300 秒过期，演示源 900 秒到期；到期重新登录绑定。

关键素材：`u11-chat-binding.png`、`u11-default-closed.png`、`hook-report.json`、`live-ui-report.json`、`report.json`；本轮未复制到 Desktop。

## 配置与文件

只更改 `plugins.entries.agentguard-runtime-security.hooks.allowConversationAccess=true`。备份：`C:\Users\23684\.openclaw\backups\openclaw.before-u11-2026-11-08T06-39-47-603Z.json`。模型、网关认证、MCP、身份与沙箱配置未改变。

- 修改前 SHA-256：`ad6f883e73137df5af3b5ee90a7c41648491b92a08f186d04a9726899e1fb6d6`
- 修改后 SHA-256：`5497e4fd8840b1d3ba939c74b006612fec53c5795ba4705969a320ae16f60083`
- 重启与验收后哈希一致；记录见 deployment.json / restart.json / live-ui-report.json。

部署脚本：`scripts/apply_task_acl_full.mjs`（先备份再限定字段修改）；重启：`scripts/restart_task_acl_gateway.ps1 -EvidenceDir <证据目录>`，只停止核实为 OpenClaw gateway 的 18789 监听进程。

本轮新增：identity/chat_acl.py、runtime plugin/chat-acl.mjs；scripts 下 apply_task_acl_full、restart_task_acl_gateway、test_identity_task_acl_full、test_chat_acl_failures、test_task_acl_full_live、verify_identity_task_acl_full；本文。

本轮扩展：enforcement/task_policy.py、gateway.py、data/agent_guard.json、identity/demo_provider.py、runtime plugin/index.js 和 demo-identity.mjs、govagentsec-ui/demo-identity.mjs 与 workspace.mjs 的身份文案、test_demo_identity_rpc、verify_identity_task_acl、IDENTITY_TASK_ACL_DESIGN 与 U10 验收文档。原工作区未提交改动保留。

## 演示口径与边界

“组织身份仍未接入，用的是非生产演示身份源；绑定身份后，聊天任务自动带最小权限范围，原生工具执行前也走同一套任务 ACL；可审批的越权动作须由另一人确认，票据只能用一次。”

当前不是组织 SSO，不是全盘 OS ACL，不保证对抗拥有主机写权限的并发恶意进程；不宣称恶意代码完全隔离或完整 CaMeL。写/exec、网络和未映射工具的硬拒绝不能描述为已经具备可审批成功执行能力。完整模型聊天端到端证据仍待补充。
