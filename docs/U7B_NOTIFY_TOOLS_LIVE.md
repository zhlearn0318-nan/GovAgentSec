# U7b 通知工具现网登记

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

**结论：PASS。** 已将 `submit_emergency_notice` 登记进现网，保留该配置；11 条验收命令全部 exit 0。实际 MCP tools/list 与真实工作台均可见，未发起模型聊天。OpenClaw 仍为 2026.7.1-2，未 push、轨迹未外发。

## 阶段 0 盘点（修改配置前）

| 项 | 实查 |
| --- | --- |
| 工具名 | submit_emergency_notice；完整名 agentguard-notices__submit_emergency_notice |
| 已登记 | MCP tools/list/调用路由、AgentGuardClient、示例 toolFilter、轨迹 action 映射 notification.submit、工作台 toolCoverage、U7 单测与演示 |
| 现网 | enabled=true，loopback_static_dev（既有非生产演示身份）；include 有五个原工具，缺通知；无 exclude |
| 生成侧 | scripts/build_config.py 缺通知；默认 enabled=false / oidc 应保留 |
| 批次 | .runtime/config-batch.json 是 path/value 数组，准入验收仍读取；对应 include 有原四项，缺 read_gov_document 和通知。本包仅补通知，文档读取旧批次缺项单列，不顺带部署 |
| 会话沙箱 | MANAGED_TOOLS 缺通知；仅保留此前已授权工具的机制不变 |
| 其他实际阻挡 | tools.alsoAllow 与 tools.sandbox.tools.alsoAllow 均缺通知，需按单工具加入；gov-evolution-demo 自有两项 allow 不扩大 |
| 其他 U7 新工具 | MCP 共六项，本次点名新工具只有通知；其余五项已在现网 include |
| 防护接线 | U6 独立可信拒绝判断原仅支持 read_gov_document 的 D004/D005；通知可信 blocked 回执需最小接线，普通工具错误处理不变 |

## 实施范围

只补通知登记、必要返回阻断接线与测试。现网修改前备份原字节并记录 SHA-256；仅修改通知的三个数组，不动身份、模型、插件和其他工具限制。默认生成配置仍禁用 MCP/要求 OIDC。批次只改对应 include。

通知只写隔离合成送审账本，不接短信/邮件。OPA、provenance、privilege contract、审批与票据仍沿用 U7。新增可信通知拒绝判断仅针对宿主绑定的 agentguard-notices / submit_emergency_notice 结构化拒绝，不解析文本，不把任意普通工具错误当作安全拒绝。

逐聊天 run 自动契约与原生工具全量 ACL 留给 U11，不据登记成功宣称全工具已托管。

## 现网配置与恢复

修改文件：`C:\Users\23684\.openclaw\openclaw.json`。仅三个数组各补一项：

- `mcp.servers.agentguard-notices.toolFilter.include` 加短名。
- `tools.alsoAllow`、`tools.sandbox.tools.alsoAllow` 加完整名。

修改前 SHA-256：`0b6a24718f17312c9ab5aaa1d9f344b0508dbfc70ff8784681266875acbe3374`。

修改后 SHA-256：`ad6f883e73137df5af3b5ee90a7c41648491b92a08f186d04a9726899e1fb6d6`。

原字节备份：`C:\Users\23684\.openclaw\backups\openclaw.before-u7b-2026-11-08T06-18-53-362Z.json`。备份未复制进证据包，避免分发网关凭据。现网原本 enabled=true，未临时开启服务或放宽身份。配置语义差异检查确认其余字段一致，gov-evolution-demo 的原专用白名单保持不变。

已通过核对端口进程后重启本机网关，加载 MCP 清单和新拒绝接线；未清理会话、未升级。当前**保留新登记，未恢复旧配置**。按 [restore-steps.md](../local-validation/u7b-notify-live/2026-11-08T06-18-53-362Z/restore-steps.md) 可校验备份并恢复逐字节一致；恢复前先确认没有需保留的后续配置变更。

## 验收

在仓库根目录执行：

```powershell
node scripts/verify_u7b_notify_live.mjs
```

本轮指定证据目录运行同一命令，退出码 0。前置为固定版本本机网关、AgentGuard venv/OPA/Wasmtime、Edge 与既有安装态 srt；缺依赖或任一断言失败即非零。验证脚本不修改现网配置。

证据：[local-validation/u7b-notify-live/2026-11-08T06-18-53-362Z/](../local-validation/u7b-notify-live/2026-11-08T06-18-53-362Z/README.md)。包含 report.json、tool-list-report.json、ui-report.json、配置脱敏摘录/哈希、deployment.json、restart.json、恢复命令与逐项日志。

| 检查 | 结果 |
| --- | --- |
| node scripts/check_notify_tools_live.mjs | PASS：实际六工具清单含通知，exclude 未排除；生成源默认关闭/OIDC；两种引擎保留已授权项 |
| AGPY scripts/test_param_provenance.py | PASS，10 项 |
| AGPY scripts/test_task_privilege_contract.py | PASS，10 项 |
| AGPY scripts/test_gov_document.py | PASS，10 项 |
| AGPY scripts/test_identity_boundary.py | PASS，9 项 |
| node scripts/demo_behavior_constraint.mjs | PASS：真实本地 MCP/HTTP/OPA/票据/账本与正式面板；合成身份，非模型会话 |
| node scripts/test_workspace_ia.mjs | PASS：通知受管、原生 exec 未受管 |
| node scripts/test_protect_tool_surface.mjs | PASS，3 组；新增通知可信拒绝取消、后续调用为 0；文本伪造/其他工具不误触发 |
| node --test modules/session-sandbox/test/policy.test.mjs | PASS，7 组；仅此前授权的通知被保留，显式限制不扩大 |
| node scripts/test_session_sandbox_installed.mjs | PASS：真实安装态 ALLOW、DENY_READ:EPERM、DENY_WRITE:EPERM、DENY_NETWORK:EACCES |
| node scripts/test_notify_tools_live.mjs | PASS：真实 OpenClaw 工作台标“已接入受管适配器”，配置未被验收修改 |

AGPY 为 `modules/agentguard-group2/.venv/Scripts/python.exe`。截图 `notify-tool-coverage.png` 来自真实本机 OpenClaw，未绘制假图。

## 改动文件

| 路径 | 用途 |
| --- | --- |
| scripts/build_config.py | 生成侧补通知 include，保持默认禁用/OIDC |
| .runtime/config-batch.json | 只补对应 include，不重新生成其他路径 |
| modules/session-sandbox/policy.mjs | MANAGED_TOOLS 补完整名，保留条件不变 |
| modules/session-sandbox/test/policy.test.mjs | 验证授权保留与严格白名单 |
| modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/result-gate.mjs | 原可信拒绝识别中补通知分支，不改分类器与 U7 内核 |
| scripts/test_protect_tool_surface.mjs | 通知拒绝独立停止与不可伪造测试 |
| scripts/apply_notify_tools_live.mjs | 单工具部署、私有备份、语义差异与哈希证据 |
| scripts/check_notify_tools_live.mjs | 现网/生成/沙箱清单和实际 MCP stdio 列表核验 |
| scripts/test_notify_tools_live.mjs | 真实工作台截图与加载态证明 |
| scripts/verify_u7b_notify_live.mjs | 必跑命令汇总与非零失败 |
| docs/U7B_NOTIFY_TOOLS_LIVE.md、BEHAVIOR_CONSTRAINT_SOTA_UPGRADE.md、UPGRADE_ROUND_VALIDATION.md、U1-U9-ACCEPTANCE-REPORT.md | 盘点、交付、历史补记 |

## 边界

通知只能写合成送审账本，没有真实短信/邮件能力。原现网 loopback_static_dev 保留为非生产身份，组织 OIDC 未接；生成默认关闭策略未变。审批凭证、票据、敏感参数来源仍走原 U7，不因进入菜单而获执行授权。可信通知 blocked 回执可独立停止后续工具；pending_approval 保持既有待审批语义，不混同硬拒绝。未跑云模型会话；按聊天 run 自动绑定任务契约、全原生工具 ACL 归 U11。
