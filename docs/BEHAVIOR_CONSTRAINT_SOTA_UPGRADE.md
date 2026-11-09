# U7：参数来源与任务权限闸门

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

本轮在现有 OPA → 动作摘要 → 一次性 HMAC 票据 → 隔离适配器 → 审计链上增加参数来源约束与任务契约。OpenClaw 固定 **2026.7.1-2**。不升级宿主、不推送、不外发轨迹。

## 已实现的行为

| 情况 | 处理 | 执行结果 |
| --- | --- | --- |
| 用户明确授权的公开文档参数 | 标记 `user`，继续 OPA 与票据检查 | 可读取合成文档 |
| 工具回执污染了文档 ID、收件人、金额或命令 | `tool_untrusted`；未记录来源的值为 `unknown` | `P006_PARAMETER_SOURCE_UNTRUSTED`，待审批，底层不执行 |
| 动作超出任务只读工具集合 | `P004_EXPANSION_REQUIRES_APPROVAL` | 待审批，不扩大基础集合 |
| 不同业务审批人确认精确动作 | 来源提升为 `approved_snapshot` | 签入一次性作用域；仍必须通过 OPA 和可信审批凭证验证 |
| 任务收紧、换主体、换参数、票据过期或重放 | 拒绝 | 不执行 |
| D004 / D005 等 OPA 硬拒绝 | 原规则优先 | 不能经任务扩权审批改成允许 |
| 任务权限数据库不可用 | `P012_TASK_POLICY_UNAVAILABLE` | 失败关闭 |

新增 `submit_emergency_notice(recipient, template_id)`：收件人只允许 `duty_office` / `synthetic_external_office`，模板只允许 `typhoon_notice`。动作映射为 `notification.submit / submit`，固定 `high / internal`。只写服务状态目录内的合成 SQLite 送审账本，**没有邮件、HTTP 发送或真实公文投递能力**。工具不接受主体、来源、任务 ID、审批结果或票据参数。

## 来源与契约的可信边界

1. HTTP 服务全部调用路径强制启用任务校验，客户端更改 `context.source` 不能关闭。低层 Python 网关仍兼容既有内部测试调用；它不是允许不可信输入直接访问的服务接口。新增通知工具、MCP 来源调用、已有任务契约的调用即使使用低层网关也会校验。
2. 没有契约时，首次调用建立 `database.query / file.read` 只读模板，**不把模型提交的参数自动记为用户授权**。公开文档参数来源也必须确认。
3. 用户授权由独立 OIDC 控制接口 `POST /task-contracts` 创建：主体来自已验证 Bearer，支持 `create` / `tighten`。网关管理员令牌不能代替业务身份；开发身份不能通过此接口创建授权。演示脚本使用内部受控测试入口初始化固定合成任务。
4. `user_values` 保存规范 JSON 的 SHA-256，不保存原值；`TaskPolicies.observe()` 是可信上游接入点，只能登记为 `tool_untrusted`，不能升级为用户授权。当前没有全宿主自动数据流追踪：未接入的邮件/网页回执一律仍为 `unknown`，同样禁止直接执行敏感动作。演示污染值由测试控制端导入，报告明确标注来源。
5. 任务集合只能取子集，不能覆盖重建。同一任务只允许初次创建参数授权；新授权需求走精确动作审批或新建任务。每次收紧增加 `revision`，旧票据和旧审批作用域失效。
6. 原动作摘要算法保持不变。票据新增签名 `scope`：任务、主体、契约版本、动作摘要、来源摘要、是否一次性扩权。默认票据 TTL 30 秒，扩权批准有效期 60 秒，任务契约有效期 1 小时；票据和扩权均原子核销。审批不把工具永久加入基础集合。
7. 审计参数及 MCP 面板请求参数保存哈希；合成注册文档 ID 仍作为审计定位字段保留。正文不写审计；批准原始快照只在服务进程的可信审批上下文中保存。无原快照时要求重新发起。

### 正式接口示例

这是认证控制端的请求体，**不是 MCP 工具参数**：

```json
{
  "operation": "create",
  "task_id": "typhoon-task-001",
  "tools": ["database.query", "file.read"],
  "user_values": {
    "file.read": {"document_id": "emergency_plan"},
    "notification.submit": {"recipient": "duty_office", "template_id": "typhoon_notice"}
  }
}
```

通知参数有明确来源也不会赋予通知权限，仍需扩权审批。收紧请求示例：`{"operation":"tighten","task_id":"typhoon-task-001","tools":["database.query"]}`。

受控 MCP 操作者通过 `AGENTGUARD_MCP_TASK_ID` 绑定已创建任务。当前 stdio 适配器没有按 OpenClaw 每次 run 自动切换该配置；新任务需由可信控制端提供新的任务绑定。未配置时每次调用使用独立任务 ID，来源未知的敏感动作进入待审批。不能通过复用长期任务绕过过期与收紧检查。

## 页面与覆盖范围

- 现有待审批卡、任务风险详情、权限闸门面板显示来源标签、当前允许集合、扩权差异、版本和票据 TTL；`unknown/tool_untrusted` 红色提示。
- 工作台列出受管 MCP 配置工具与最近 100 条轨迹出现的工具；非受管名称醒目标红「未受 AgentGuard 闸门」。这是配置和观测范围，不是完整的宿主工具注册表证明。配置接入不等于该次执行已获准，执行以关联回执为准。
- 通知工具加入 MCP 工具清单、示例 `toolFilter`、演示安装脚本和轨迹关联映射。原 U7 轮次未修改现网 toolFilter；**2026-11-08 U7b 已补齐现网/生成侧/沙箱登记并重载验证**，详见 [U7B_NOTIFY_TOOLS_LIVE.md](U7B_NOTIFY_TOOLS_LIVE.md)。登记不等于业务授权。
- 维持 U4 边界：管理页面没有逐用户 OIDC 委托，执行类按钮仍禁用。页面可展示真实待办，不能用管理员身份批准业务动作。OIDC 审批 API 保留原始请求与不同审批人复核。

## 与研究工作的关系

| 参考 | 本轮吸收 | 没有声称实现 |
| --- | --- | --- |
| [ToolFence](https://arxiv.org/abs/2609.37196)、[PACE](https://arxiv.org/abs/2610.01349) | 工具名合法仍须校验敏感参数来源；每次调用校验授权范围 | 论文全量标签传播、证书体系或安全证明 |
| [Progent](https://arxiv.org/abs/2504.11703) | 任务级权限与运行中收紧；扩权显式审批 | 原论文策略生成器与实验结果复现 |
| [ToolGuards](https://aclanthology.org/2025.emnlp-industry.41/)、[官方代码](https://github.com/IBM/tool_guard) | 调用前确定性守卫；保留现有 Rego，增加小型 Python 校验 | 自动策略编译器或论文指标 |
| [GoPlus AgentGuard](https://github.com/GoPlusSecurity/agentguard) | 吸收调用前校验的集成思路；本项目新增检查失败关闭 | 替换整仓、全工具托管或新增 OpenClaw 原生审批桥 |

**不做完整 CaMeL Dual-LLM 解释器、全控制流/数据流隔离，也不宣称达到这些论文的完整安全保证。** 本轮是受管工具上的可验证工程补强。自然语言用户意图尚不能直接成为可信参数授权。

## 复跑与成功判据

在仓库根目录执行（需要现有 Python 虚拟环境、OPA 与 Wasmtime；浏览器演示另需本机固定版本 OpenClaw 中的 Playwright 和 Edge）：

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_gov_document.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_boundary.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_param_provenance.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_task_privilege_contract.py
node scripts/demo_behavior_constraint.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Verify-ZhengAn.ps1
```

每条退出码必须为 0。演示启动临时 loopback HTTP 服务，通过真实 MCP JSON-RPC 调用实际 OPA、签票、核销和隔离账本，然后使用正式插件 handler 渲染实际审批记录；浏览器限制为本机同源。它**不是 OpenClaw 模型端到端会话**，报告 `host_session=false`、身份 `loopback_static_dev-not-production-OIDC`、数据 `synthetic`。

输出 `local-validation/behavior-constraint/<timestamp>/`：
- `report.json`：六个场景、读写次数、面板断言、服务退出码、现网配置哈希未变结果。
- `mcp-report.json`：实际 MCP 链路结果；`panel-snapshot.json`：实际后端视图数据。
- `pending-provenance-contract.png`：真实面板待批来源与任务契约截图。
- `state/enforcement_audit.jsonl`：参数哈希与审批审计；不得当作生产轨迹。

OPA 启动失败、依赖缺失、身份缺失、页面无来源字段或读写次数不符合预期时，脚本非零退出，不跳过或伪造通过。Windows 受限测试进程若不能运行 OPA/打开系统临时 SQLite，请从普通本机终端复跑，不降低策略。

最新本轮实测路径与结果见 [升级验收记录](UPGRADE_ROUND_VALIDATION.md)。
