# 对话任务工作台

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

更新日期：2026-11-05。新版入口和布局见 [原生工作区](openclaw-workspace.md)；下文保留任务关联与验证协议。日常任务在 OpenClaw 聊天中完成，安全管理页负责能力准入与系统维护。

## 用户怎么用

1. **使用前**：进入“政安智枢 GovAgentSec → 使用前·准入中心”，检查并接入 Skill、插件或 MCP。沿用 Aegis、Group4 的检查与安装机制。
2. **使用中**：正常发送任务，点击OpenClaw 顶栏 **任务与轨迹**。桌面端打开右侧面板，对话仍可操作；窄屏采用全宽面板。
3. **查看过程**：默认只列当前会话的任务运行。选择一次运行，查看调用图、节点详情和事件时间线。需要旧记录时切换“全部历史”。
4. **处理审批**：切到“风险与审批”，核对动作、对象和参数，再填写审批人员及意见。批准、拒绝或中断都交回原 AgentGuard 服务处理；批准后仍需策略复验与受控执行。
5. **使用后**：切到“证据”，查看请求、决策、审批与实际回执，并区分业务验收结果。跨任务对照可使用 OpenClaw 侧栏的“历史调用轨迹”。

关闭面板或按 Esc 返回聊天，输入草稿保留。面板只在打开时轮询，填写审批表时暂停刷新。“安全管理”在当前窗口进入 OpenClaw 管理页。输入防护状态组件默认折叠。

## 关联依据

| 关联 | 使用的证据 | 缺失时的行为 |
| --- | --- | --- |
| 会话 → 运行 | OpenClaw 钩子上下文中的 session_key/session_id | 旧记录保持未知，不按时间补写 |
| 运行 → 工具调用 | run_id 与唯一 tool_call_id 开始/结束配对 | 重复、孤立事件不视为可靠调用 |
| 工具调用 → AgentGuard | 宿主 MCP 包装字段、已知工具名、适配器生成的 control_request_id、操作员侧原始请求文件 | 任意工具文本不能创建审批关联 |
| 请求 → 审批/回执 | 原 AgentGuard 审批与审计记录的相同请求编号 | 未验证的关联不能在面板发起审批 |
| MCP → 准入报告 | 调用时的 MCP 配置摘要、执行前同摘要的准入记录 | 不用较新报告代替历史证据 |

适配器在已有 `AGENTGUARD_MCP_STATUS_STORE_FILE` 旁保存 `.requests/<request-id>.json`，供管理插件读取。文件保留审批所需请求，不保存 Authorization 请求头或执行票据。审批完成记录覆盖原 pending 状态；同一宿主进程中重复提交会被拒绝，服务仍按原策略与票据机制执行。

只读 RPC 使用 `operator.read`；`govagentsec.trajectory.resolve` 使用 `operator.approvals`。审批身份沿用当前本机演示系统，不代表新增了企业多用户身份认证。模型没有被注册为审批调用方。

## 当前边界

- 本机 Protect Agent 的对话钩子尚未授权；界面显示“尚未授权”，不显示已检查。工具返回内容目前主要是观察记录，尚未强制截断。
- MCP 配置摘要证明的是配置关联，不能证明远端服务实际代码版本。实际 Skill 使用及内容版本仍为 unknown。
- 老轨迹没有 session_key 或适配器请求文件时，保留全历史可读与未关联状态。
- 安全判决、执行成功、轨迹完整性和业务验收分别展示；没有独立业务验收时保持未知。
- 准入和运行防护管理页复用原模块；技能生成、验证、发布与回退仍使用受控本地流程，不因本轮界面整合而自动上线技能。

## 部署与恢复

插件配置沿用已授权的轨迹采集与 AgentGuard 配置。重启 OpenClaw 后端加载新 RPC，执行以下命令适配当前聊天前端，然后刷新浏览器：

```powershell
node scripts/install_trajectory_view.mjs
node scripts/install_trajectory_chat.mjs
node scripts/install_openclaw_workspace.mjs
# 如需恢复新版宿主外壳
node scripts/install_openclaw_workspace.mjs --restore
# 如需恢复 OpenClaw 原聊天资源
node scripts/install_trajectory_chat.mjs --restore
```

适配器会先备份原资源，重复运行不会重复注入。当前适配实测 OpenClaw 2026.7.1-2；升级后须重新适配，不兼容的资源结构会停止修改。模块静态资源通过 no-store 提供。

## 验证与复现

在仓库根目录运行。浏览器测试依赖当前用户 npm 安装的 OpenClaw/Playwright、Edge、本机已登录网关与运行中的 AgentGuard。测试报告和截图都在忽略目录 `local-validation`，不提交对话、模型或凭据。

```powershell
node --test modules/trajectory-governance/test/*.test.mjs scripts/test_ui_release.mjs
python scripts/test_release.py
.\.runtime\protect\Scripts\python.exe -m unittest discover -s modules/trajectory-governance/test -p test_adapter.py
node scripts/test_trajectory_native.mjs
node scripts/test_trajectory_chat.mjs

# 真实本机服务 + 合成业务：查询、测试付款待审批、命令阻断
python scripts/probe_task_requests.py local-validation/task-workbench-integration
# 测试页面批准上述合成付款；请求每次须重新生成
node scripts/test_task_workbench.mjs

# 发出一条真实 OpenClaw 模型任务，仅查询一条合成内部公告
node scripts/test_task_live.mjs
# 复查最近测试会话，不再次发送任务
node scripts/test_task_live.mjs --reuse
```

本轮验证：45 项 Node、6 项配置测试、4 项采购验收器测试通过；实际 OpenClaw 公告查询得到完整 9 事件轨迹，并按准确会话和请求编号展示 AgentGuard 证据。另一个隔离 UI 测试使用合成宿主事件连接真实本机 AgentGuard，验证待审批到 approved_executed 的回执。这两种证据分别保存于 `task-live-report.json` 和 `task-workbench-integration/report.json`，不把合成宿主事件称为真实 OpenClaw 对话。

原生历史页、聊天侧栏、草稿保留、Esc/focus、窄屏布局均通过浏览器检查。上述测试不包含真实资金支付，也不代表全部 MCP/原生工具路径已完成验收。
