# OpenClaw 轨迹 Hook 核验

核验对象：本机 npm 安装的 **2026.7.1-2**。安装目录 `%APPDATA%/npm/node_modules/openclaw`。此安装已有 GovAgentSec 返回前防护补丁，不能称为未修改的上游原版。本轮不升级宿主。

## 源码证据

以下路径相对安装目录 `dist/`。代码中的真实分发点与类型声明一起核对，未依赖在线版本文档。

| Hook | 载荷 / 上下文 | 真实分发及边界 |
|---|---|---|
| `before_agent_run` | event.prompt；runId 从 ctx.runId 取，不假设 event 有 runId | `hook-types-DQ9eTy2x.d.ts:1071`；`hook-runner-global-BmIrGlLG.js` 的 runBeforeAgentRun。只读观察器返回 undefined |
| `model_call_started` | runId、callId、provider、model；可选 sessionKey/sessionId/api/transport/contextTokenBudget | `hook-types…:435`；`attempt.model-diagnostic-events-CfZQM0hs.js:4699,4716,4898` |
| `model_call_ended` | 以上字段 + durationMs、outcome；可选 errorCategory、failureKind、timeToFirstByteMs、字节量 | `hook-types…:449`；`attempt.model-diagnostic-events…:4706,4736,4756`。**无 usage**，不得给单次模型调用虚填 token |
| `before_tool_call` | toolName、params；可选 event/ctx.runId、toolCallId、toolKind、toolInputKind | `hook-types…:718`；`agent-tools.before-tool-call-C95DXQXZ.js:1703`。工具执行前；可能被其他安全 hook 阻断 |
| `after_tool_call` | toolName、params；可选 runId、toolCallId、result、error、durationMs | `hook-types…:738`；`selection-JInn13lc.js:2300`。观察结果，不是拦截返回值的接口；缺席时显示缺失 |
| `llm_output` | runId、sessionId、provider、model、assistantTexts；可选 harnessId、resolvedRef、usage | `hook-types…:459`；embedded `selection…:14669` 使用 attemptUsage；CLI/native 也通过 lifecycle helpers 分发。usage: input/output/cacheRead/cacheWrite/total，字段可能缺失 |
| `agent_end` | 可选 runId；messages、success；可选 error、durationMs | `hook-types…:498`；embedded `selection…:14591`。**没有 skillsUsed**。agent_end 早于末尾 llm_output，不能在此立即封账 |
| `session_start/end` | sessionId、可选 sessionKey；end 有 reason/messageCount/durationMs 等 | `hook-types…:771–795`。没有 runId。仅关联已观察到的同一 session 运行，不根据时间猜 runId |

### embedded 与 MCP 覆盖

- `model_call_*` 的生产调用点位于 embedded 流包装和 embedded compaction；CLI/native `run-attempt` 不保证发出它们。没有该事件不等于模型没有运行，UI 显示“逐次模型事件缺失”。
- embedded MCP 工具走统一 before 包装及 tool_execution_end → after 分发；不能据此泛化为所有 MCP 路径都有 before+after。
- CLI loopback MCP endpoint 在 `mcp-http-BUQahgob.js:260` 显式调用 before；该 endpoint 没有直接的 after 分发。native 工具 after 依赖 `native-hook-relay-XOwljREM.js` 的 post_tool_use 路径；没有 relay 回报的调用必须标记不完整。
- `skill.used` 是 diagnostic 事件，不是 `api.on` 注册的上述 typed hook。`agent-tools.before-tool-call…:1096` 根据技能文件读取识别，受诊断开关限制。插件当前以成功读取 `SKILL.md` 作为文件读取证据，标注 `execution_confirmed:false`；不把工具名猜成 Skill。

### 注册、关联与计量

`definePluginEntry({id:'govagentsec-trace', register(api){…}})`，再用 `api.on(name, handler, {priority:110})`。非内置插件读取对话须显式 `plugins.entries.govagentsec-trace.hooks.allowConversationAccess=true`，否则 registry 跳过注册（`registry-B8eQDFB4.js:4226–4241`）。这不是 `allowPromptInjection`，插件不申请修改 prompt 的能力。

trace_id 保留 runId；request_id/task_id 不改写。Group1 用已有运行上下文的只读订阅。AgentGuard 仅在 MCP wrapper server/tool 匹配且 control_request_id 与本地请求记录一致时标记关联已核实；缺少请求记录不伪造 task_id。审批的“观察到”与“已执行”分开。

- 模型名：model_call_* 或 llm_output 的 provider/model。
- 错误：model_call_ended 的分类、after_tool_call.error / result.isError、agent_end.error；原错误正文只保留哈希。
- 耗时：model_call_ended.durationMs、after_tool_call.durationMs、agent_end.durationMs。无字段不按观察时间冒充执行耗时。
- token：累加同 runId 的 llm_output **attempt 汇总**；逐次模型节点显示未知，不分摊总 token。任一输出缺少某项计数时该项为缺失。

## 可运行最小探针

```powershell
node scripts/probe_trace_hooks.mjs
```

可显式传安装目录和输出目录。探针断言版本，读取真实类型/分发源码并保存 SHA-256，再通过**已安装的真实 hook dispatcher**分发七种合成载荷，记录字段名与关联字段存在性。输出：`local-validation/trace-hook-probe/verification.json`。它不会请求模型、执行工具或保存对话内容。

这个探针验证注册/分发与字段契约；合成载荷不能证明一次生产模型运行。MCP、embedded 覆盖结论来自上述实际源码路径。`modules/govagentsec-trace/test/core.test.mjs` 补充异常隔离、只读返回、ID 保留和存储故障测试。运行中的新插件会直接采集真实业务 hook，不通过外部模型制造演示轨迹。

## 真实 Agent 路径冒烟

新增 `scripts/smoke_real_trace.ps1`，通过真实 Control UI `chat.send` 请求本地模型调用 AgentGuard MCP 的 `read_gov_document`。前置条件、事件/参数哈希/受控回执/JSONL 核对和复跑命令见 [真实短链冒烟](TRACE_LIVE_SMOKE.md)。本机本轮运行退出码 1：网关与采集插件可连接，但 MCP 停用、身份未就绪、本地模型未配置，因此没有提交模型任务，不能作为真实全链通过证据。

执行接口另核对固定安装源码：`schema-BuOFpc7K.js:3269` 的 ChatSendParamsSchema 支持 sessionKey、agentId、message、thinking、deliver、timeoutMs、idempotencyKey；`chat-pg-BxhF6.js:2566` 使用 idempotencyKey 作为 clientRunId；`session-utils-DD3pe_2A.js:478` 从运行中配置加载会话。`model-fallback-BPQMpbqN.js:1221–1234` 除显式 fallback 外可追加全局主模型，故冒烟同时要求全局主模型和 Agent 主模型本地化。异常时调用该版本 `chat.abort`（sessionKey、runId），不注入结束事件。

## 文件格式与断链检测

每行 UTF-8 JSON：schema_version、event_id、sequence（从 1 开始）、timestamp（ISO 毫秒）、event_type、trace_id、parent_event_id、prev_hash、event_hash，另有 session / request / task / call ID 和 payload。

固定算法 `SHA-256(canonical(event 除 event_hash 外的全部字段))`。canonical：对象键按 JavaScript 字符串排序，数组保留顺序，标量用 JSON.stringify，无空白，缺失/undefined 正规化为 null。首个 prev_hash 是 64 个 0。文件名为 `SHA-256(canonical(runId)).jsonl`，不改变事件内的 trace_id。parent_event_id 仅引用已记录的明确调用配对，不用“最近 LLM”冒充因果关系。

JSONL 只追加；独立 `.head.json` 原子更新记录条数和尾 hash，发现尾部截断。检查畸形 JSON、序号缺失、事件 ID 重复、trace 不一致、parent 缺失、hash 与锚点不一致。不能抵抗同时重写整条链和锚点的本机管理员，未宣称数字签名或不可抵赖性。

```powershell
node modules/govagentsec-trace/cli.mjs verify DATA_DIR TRACE_ID
```

默认仅保存经过脱敏后的内容哈希；summary 模式也只保存类型/数量，不能启用 raw。口令、密钥、Cookie、JWT、身份证号等脱敏。采集失败写 capture-health.jsonl，磁盘完全不可写时 RPC 仍报告内存故障；重启后缺少闭合事件也会显示中断。无法持久化的末尾事件数量不能事后精确恢复。
