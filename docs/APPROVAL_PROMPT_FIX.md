# 审批提示与实际请求同步修复

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

日期：2026-11-09。OpenClaw：2026.7.1-2。

## 原因与修复

Group1 的 `before_tool_call`（priority 100）先返回 `requireApproval`，并提前写入“等待操作确认”。之后 AgentGuard 任务 ACL（priority -10000）返回 `P001_CONTRACT_REQUIRED`，固定宿主将该调用直接阻断，不创建原生审批请求。旧提示没有随 ACL 拒绝或运行结束清理。

现在区分“提出确认要求”与“网关已有待审批请求”：

- Group1 只记录 `approval_requested`，包含关联用的 toolCallId/pluginId，不保存工具正文。
- UI 查询固定宿主的 `plugin.approval.list`，核对 sessionKey、toolCallId、pluginId、expiresAtMs 后才显示“等待操作确认”。无请求、过期、无查询权限或连接错误都不会宣称有卡片。
- ACL 拒绝通过现有进程内 protection runtime 传递固定原因码，覆盖旧提示；`P001_CONTRACT_REQUIRED` 明确引导前往“动态权限”绑定当前任务。诊断失败不改变 `block:true`。
- `agent_end` 清理未落实的确认提示，保留权限拒绝原因并标明运行结束。旧版本终态中的 approval_pending 不再显示为等待。
- 允许回调只清除匹配调用的确认提示，不能覆盖后续 ACL 拒绝。

没有调整检查顺序、准入策略、ACL、一次性审批决定或超时拒绝规则。工具被拒绝与整轮 Agent 停止仍分别表述。

## 验证

证据目录：`local-validation/approval-lifecycle/`。

| 验证 | 结果 |
| --- | --- |
| 固定宿主真实 hook dispatcher / tool wrapper + 合成输入 | 8 项通过；ACL 拒绝时底层执行计数 0 |
| 浏览器提示回归 | 15 项通过；覆盖会话切换、过期、错配、查询异常、任务结束 |
| 原任务 ACL 隔离回归 | 15 项通过；使用本地测试身份/OPA/票据 |
| Group1 plugin / event-store / UI-assets 单测 | 25 项通过 |
| 工具返回防护回归 | 10 项通过 |
| 真实本机网关原生审批卡片 | 显示成功；仅拒绝测试自身请求；0 Agent 请求、0 工具执行、0 外部请求 |

原生卡片截图：`native-confirmation-card.png`；报告：`live-card-report.json`。真实卡片测试使用两个本机连接，因为宿主主动将审批请求的发起连接排除在事件接收者之外。首次同连接测试未通过，改为独立请求/审批连接后通过；没有修改宿主投递规则。

额外发现旧 `ui-routes.test.mjs` 的两条授权测试仍使用不带业务 Bearer 的旧 capability，且未等待异步 handler，返回 `BUSINESS_IDENTITY_REQUIRED`；这两项尚未适配前一轮 U25 权限改造，本次没有弱化路由权限来让旧测试通过。初次 event-store 临时目录测试受系统 TEMP 影响，切换仓库内 TEMP 后通过。

## 复跑（仓库根目录，PowerShell）

```powershell
$env:GOV_APPROVAL_EVIDENCE = 'local-validation/approval-lifecycle'
node scripts/test_approval_lifecycle.mjs
node scripts/test_protection_alert.mjs
$env:GOV_ACL_FULL_EVIDENCE = 'local-validation/approval-lifecycle/acl-regression'
node scripts/test_identity_task_acl_full.mjs
node scripts/verify_approval_card_live.mjs
```

最后一个命令要求本机网关已启动；使用现有网关登录配置，创建并拒绝带“合成测试”标题的原生确认请求，不执行工具。报告不包含令牌或用户对话。

修复后已在确认没有活动任务时重启网关。`openclaw.json` 重启前后 SHA256 均为 `5497e4fd8840b1d3ba939c74b006612fec53c5795ba4705969a320ae16f60083`。未升级、未修改宿主内核、未 push。刷新页面后重新登录演示业务身份，再绑定当前任务即可继续使用。
