# 真实 OpenClaw 短链采集冒烟

> 文档状态（2026-11-10）：技术参考：接口/算法和原始证据按本文件的范围解释；阶段页面与账号说明不作为当前使用步骤。当前行为见[系统基准](CURRENT_SYSTEM.md)。

本脚本连接本机 **OpenClaw 2026.7.1-2**，通过已登录 Control UI 的真实 `chat.send` 发起新会话，由模型调用 AgentGuard MCP。它不直接调用 MCP 代替 Agent、不向 hook 注入载荷、不生成或导入合成 JSONL。业务文档仍是明确标注的合成公开数据。

## 前置条件

1. 本机 OpenClaw 网关已启动；安装目录为 `%APPDATA%/npm/node_modules/openclaw`。使用现有 token 登录和随宿主安装的 Playwright、Microsoft Edge，无需新增依赖。
2. `govagentsec-trace` 已启用，`hooks.allowConversationAccess=true`；`contentMode` 为 `hash` 或 `summary`。`govagentsec.trace.health` 返回 available。配置修改后需重启网关；脚本核对监听进程启动时间晚于配置修改时间，避免使用仍在内存中的旧外部模型配置。
3. AgentGuard `/readyz` 为 ready，**identity 必须同时 required=true、healthy=true**。只有 OPA/signer/ticket_state 健康不能证明身份已就绪。服务使用现有 OIDC 接入和合适的文档读取主体；本脚本不启用静态开发身份、不签发假身份。
4. `mcp.servers.agentguard-notices.enabled=true`，`toolFilter.include` 含 `read_gov_document`，exclude 不排除此工具。保留原工具限制。现有 stdio MCP 使用 OIDC 模式，通过 `AGENTGUARD_MCP_TOKEN_FILE` 或 `AGENTGUARD_MCP_BEARER_TOKEN` 提供有效访问令牌。
5. MCP 的 `AGENTGUARD_MCP_STATUS_STORE_FILE` 与 `agentguard-runtime-security.config.statusPath` 一致，保证工具回执能与本地受控请求记录关联。AgentGuard 使用带受控文档工具的当前代码和隔离合成数据适配器。
6. 选中 Agent 的主模型、全局主模型及所有 fallback 都必须明确配置为回环地址的本地模型，且列在 `models.providers.<provider>.models` 中。例如本机已有的 `ollama/qwen3:8b`；**仅在 Ollama 下载模型不等于 OpenClaw 已接入它**。不能继续使用 DeepSeek 主模型或外部 fallback。此固定宿主在部分路径会将全局主模型追加为 fallback，故只覆盖 Agent 主模型不够。

脚本不更改宿主配置、不重启共享服务；连接已启动的现有服务。需要先按现有部署流程完成以上条件。模型和 MCP 应允许当前 Agent 调用；推荐用已准入的专用演示 Agent，仅开放所需工具。`-AgentId` 指定该 Agent，否则使用 main。


## 本机演示身份（无单位 OIDC 时）

没有单位 HTTPS OIDC 时，可用 AgentGuard MCP 已有的 `loopback_static_dev` 本机演示身份跑通真实短链冒烟。**这不是生产 OIDC**，报告与 README 必须标注。

最小配置（`~/.openclaw/openclaw.json` → `mcp.servers.agentguard-notices.env`）：

```json
{
  "AGENTGUARD_MCP_BASE_URL": "http://127.0.0.1:8080",
  "AGENTGUARD_MCP_IDENTITY_MODE": "loopback_static_dev",
  "AGENTGUARD_MCP_DEV_SUBJECT_FILE": "<repo>/modules/agentguard-group2/integrations/openclaw_mcp/dev-subject.example.json",
  "AGENTGUARD_MCP_STATUS_STORE_FILE": "<repo>/modules/agentguard-group2/live-runtime/mcp-control-statuses.json"
}
```

约束：
- 只能连回环 AgentGuard；`DEV_SUBJECT_FILE` 必须是本机可读的演示主体 JSON（含 id/department/roles/clearance/mfa）。
- AgentGuard 服务需以 `AGENTGUARD_ALLOW_DEVELOPMENT_IDENTITY=true` 且 `AGENTGUARD_OIDC_ENABLED=false` 启动，否则会返回 `S006_BUSINESS_IDENTITY_DISABLED`。这只用于本机演示，生产必须关闭该开关并启用 OIDC。
- AgentGuard `/readyz` 中 `identity.required=false`（OIDC 未启用）时，冒烟走 `DEMO_IDENTITY_ACCEPTED`，故意不把 `AGENTGUARD_VERIFIED_IDENTITY` 记为通过。
- 生产环境必须改回 `IDENTITY_MODE=oidc`，配置真实令牌，并要求 `identity.required=true` 且 healthy。
- 改配置后必须重启 OpenClaw 网关，再跑 `scripts/smoke_real_trace.ps1`。

## 运行

在仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke_real_trace.ps1 -TimeoutSeconds 180
# 已有专用本地 Agent 时：
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke_real_trace.ps1 -AgentId trace-smoke -TimeoutSeconds 300
```

使用全新随机 session key 和 runId，仅请求一次：

```json
{"tool":"agentguard-notices__read_gov_document","arguments":{"document_id":"emergency_plan"}}
```

`emergency_plan` 是现有注册表的 public 公开台风通知，不是任意路径。短提示与工具结果只进入配置好的本地模型；不读取旧会话、轨迹或把它们交给模型。宿主自身仍会保存正常的本地会话记录；本脚本的报告和证据副本不保存正文或凭据。

每次均输出 `local-validation/trace-live-smoke/<UTC时间戳>-<随机后缀>/report.json` 和 README。退出码 **0 才是通过**，1 为前置阻塞或执行/校验失败。前置失败不提交 Agent 请求；运行超时会请求 `chat.abort`，取消请求失败也明确写入报告。

## 成功判据

- `source=real-openclaw`、`synthetic=false`、`agent_run_submitted=true`、`gateway_acknowledged=true`、`passed=true`，不是仅看 source 字符串。
- 新生成的同一 trace_id、session_key 内，有 `run.started`、模型事件、一次目标 `tool.started`、配对 `tool.ended` 和成功 `run.ended`。时间须晚于本次提交，禁止拿旧轨迹补齐。
- `tool.started.params.sha256` 等于 `contentEvidence({document_id:'emergency_plan'})`，input_fields 含 document_id；无需保存参数或文档正文。
- MCP 结果为 `executed_isolated`，不是只调用到工具名。request_id/task_id 与本地新请求记录一致，回执来自 `isolated_synthetic_document`、public、同一 document_id、无副作用。
- 有 usage 字段时必须为非负数并记录其实际值。缺失项保持 null，标注 `fields_unavailable` 和核验边界；不补零、不分摊 run 汇总到单次模型事件。详见 `TRACE_HOOK_VERIFICATION.md`。
- 原 JSONL 及锚点经 TraceStore 和 `cli.mjs verify` 检查，哈希链 valid，且没有新增采集故障。

`agent_end` 可早于 `llm_output`，脚本等待输出事件和短暂文件稳定期后核对。超时保留已观察到的事件种类和完整性状态，不假定已正常结束。

成功或完整但校验失败的运行，在确认内容字段已哈希化后，复制原 JSONL 与 `.head.json` 到报告目录的 `evidence/traces`；不修改原始链。复核命令：

```powershell
node modules/govagentsec-trace/cli.mjs verify "local-validation/trace-live-smoke/<本次目录>/evidence" "<report.trace_id>"
```

## 常见失败

| 检查/代码 | 处理 |
|---|---|
| FIXED_HOST_VERSION | 使用固定 2026.7.1-2，不通过升级解决 |
| TRACE_LIVE_HEALTH | 启动网关；确认 token、插件启用和对话读取授权；Edge 可启动 |
| GATEWAY_RESTARTED_AFTER_CONFIG | 配置变更后重启网关；若 gateway_process_probe.available=false，检查读取监听进程信息的权限 |
| AGENTGUARD_MCP_ENABLED / DOCUMENT_TOOL_FILTER | 完成 MCP 接入准入并检查启用状态、工具名单，然后重启网关 |
| AGENTGUARD_READYZ | 恢复服务及 OPA、签名和票据依赖 |
| AGENTGUARD_VERIFIED_IDENTITY / OIDC_CREDENTIAL_* | 生产：接好 OIDC、identity 必需、配置 MCP 令牌。无单位 OIDC 的演示：改用 loopback_static_dev + DEV_SUBJECT_FILE（见上方），报告须标注非生产 OIDC |
| LOCAL_MODEL_ONLY | 在 OpenClaw 配置本地 provider 和模型；所有主模型/fallback 均不得指向外部 API |
| CAPTURE_TIMEOUT / NORMAL_RUN_END | 检查本地模型是否运行、是否支持工具调用、资源是否足够；查看本地会话，报告不落错误正文 |
| ONE_DOCUMENT_CALL / MCP_EXECUTION_COMPLETED | 模型没有调用目标工具、重试多次、工具被过滤/拒绝或未真正执行；不能算通过 |
| AGENTGUARD_RECEIPT_JOIN | statusPath 与 MCP 状态文件不一致、回执缺失或请求未成功执行 |
| HASH_CHAIN_VALID / CLI_VERIFY / CAPTURE_WITHOUT_LOSS | 检查采集故障和原 JSONL；不得通过重建/补写链来“修复”验收 |

## 本次实测：未通过端到端验收

2026-11-06 21:27（北京时间），实际执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke_real_trace.ps1 -TimeoutSeconds 90
```

退出码 **1**。报告：`local-validation/trace-live-smoke/2026-11-06T13-27-14-241Z-5b35a45c/report.json`。

```json
{
  "source": "real-openclaw",
  "status": "blocked",
  "passed": false,
  "gateway_connected": true,
  "agent_run_submitted": false,
  "trace_id": null,
  "agentguard": {"ready": true, "oidc_required": false},
  "blockers": [
    "AGENTGUARD_MCP_ENABLED", "DOCUMENT_TOOL_FILTER",
    "OIDC_CREDENTIAL_CONFIGURED", "LOCAL_MODEL_ONLY",
    "OIDC_CREDENTIAL_READABLE", "AGENTGUARD_VERIFIED_IDENTITY"
  ]
}
```

已验证真实网关登录、采集插件健康、固定版本和 AgentGuard readyz。当前 MCP 仍禁用、未开放文档工具、未配置 OIDC 令牌，服务身份未启用；OpenClaw 默认仍为外部 DeepSeek。Ollama 已有 qwen3:8b，但尚未接入 OpenClaw。未改身份或模型配置来掩盖阻塞，也没有提交会导致工具结果外发的会话。

**因此本次没有真实 trace_id，没有可声称通过的真实哈希链，成功路径尚待环境就绪后复跑。** 完成前置条件后直接使用上方同一命令，冷启动本地模型较慢时将超时改为 300 秒。

可选 D004 段未实施：运行中的服务没有按请求暴露底层 read_count，无法在不修改模块的范围内证明底层读取次数未增加。报告显式为 not_run；已有受控文档单元测试不能代替这一实时证据。

自动化核对测试：

```powershell
node --test scripts/test_trace_live_check.mjs modules/govagentsec-trace/test/*.test.mjs
```

实测 **28/28 通过**：19 项新核对器测试 + 9 项原轨迹模块回归。测试中的内存/临时 JSONL 仅验证核对器，不进入真实冒烟报告。

本次仅增加 scripts 下的冒烟入口、执行器、核对器与测试，并更新文档。没有修改 govagentsec-trace、AgentGuard 模块或用户宿主配置，没有 git push。


## 已知限制（本机演示）

- 本地模型偶发在成功调用 `read_gov_document` 后仍调用 `sessions_yield`；若 Group1 对后续工具返回做 fail-closed（`CHECK_UNAVAILABLE`），宿主可能把 `run.ended.success` 标为 false。冒烟在目标 MCP 文档调用已 `executed_isolated` 时仍视为主路径结束，报告会保留该现象。
