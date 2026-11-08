# Codex 提示词 U19：轨迹图逐步 token（per-call usage）

## 0. 角色与目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2**。不 push；轨迹内容不外发外部 API。

**目标**：过程台账轨迹图中，单次「模型调用 / 模型返回」节点能显示 `token {input}/{output}`（有数时），不再无故一律「token 未提供」；运行级「最终输出与用量」汇总仍保留。

**非目标**：不升级 OpenClaw、不改安全策略语义、不伪造用量数字、不做第二套轨迹存储。

---

## 1. 硬约束

1. 不升级 OpenClaw（断言宿主仍为 `2026.7.1-2`）。
2. 不改护栏 / 闸门 / 审批 / ACL 语义；本包只动轨迹采集与展示。
3. **缺 usage 时允许显示缺失**（fail-open 展示）：禁止用 0 或估算值冒充真实 per-call。
4. 不 push；轨迹正文、提示词、工具返回不外发外部 API。
5. 兼容旧轨迹：历史事件无 `payload.usage` 时仍可打开图，文案说明缺失原因。
6. 不 patch OpenClaw 安装目录源码；只能改本仓库 `modules/govagentsec-trace/` 及配套脚本/测试/文档。

---

## 2. 必读（先读再写设计）

1. `modules/govagentsec-trace/view-model.mjs`  
   - `nodePresentation`：`model.*` 看 `n.payload.usage`，否则文案 **「token 未提供」**。
2. `modules/govagentsec-trace/register.mjs`  
   - `model_call_ended` → `model.ended`：**当前硬编码 `tokens: null`，且未写 `usage`**。  
   - `llm_output` → `model.output`：写 `usage: e.usage ?? null`，并标 `token_scope: 'run_aggregate'`。
3. `modules/govagentsec-trace/view.mjs` 图注：  
   - 「token 为运行汇总，单次调用未知时显示缺失。」
4. `modules/govagentsec-trace/fixtures.mjs`、`calibration-fixtures.mjs`、`test/*.mjs`  
5. `scripts/render_real_call_graph.mjs`（离线图证）  
6. 本机 OpenClaw **2026.7.1-2** 类型与文档（只读，勿改）：  
   - `%APPDATA%\npm\node_modules\openclaw\dist\hook-types-*.d.ts` 中 `PluginHookModelCallEndedEvent`  
   - `docs/plugins/hooks.md`（`model_call_started`/`model_call_ended` / `llm_output` / `reply_payload_sending.usageState`）  
   - 诊断侧 `model.call.completed` 与 `modelCallUsageField`（了解内核有数但钩子未透出）

### 已核实事实（设计必须写进文档，勿假装不知道）

在 OpenClaw **2026.7.1-2**：

| 来源 | 是否有 per-call usage | 说明 |
| --- | --- | --- |
| 插件钩子 `model_call_ended` | **否** | 类型字段含 `durationMs`/`outcome`/字节与 TTFB/`upstreamRequestIdHash` 等；**无 `usage`**。`dispatchModelCallEndedHook` 故意不附带 `modelCallUsageField`。官方 hooks 文档亦写明为 sanitized timing/outcome 元数据。 |
| 诊断事件 `model.call.completed` | **是（内部）** | 运行时 `observeModelCallUsage` → `modelCallUsageField(state)` 写入诊断；**未作为插件钩子字段暴露**。 |
| 插件钩子 `llm_output` | **运行/轮次汇总** | `usage` 为 attempt/turn 聚合；当前轨迹已记为 `token_scope: 'run_aggregate'`。 |
| `reply_payload_sending.usageState` | **部分** | `usage`=整轮聚合；`lastUsage`=**该轮最后一次**模型调用（非每一次）；且 durable/replay 路径可能缺失。 |
| OpenTelemetry `openclaw.model.call` | **有（导出路径）** | 文档称 provider 暴露 usage 时带 per-call token attributes；**不是**本插件现成钩子，勿为取数去改 OTel 出口或升级。 |

因此：若阶段 A 确认仍无法从**已公开插件钩子**稳定拿到「每一次」call 的 usage，必须在设计里写清限制，实现「能拿到就显示、拿不到给出明确缺失原因 + 演示话术」，**禁止假装有逐步数字**。

---

## 3. 阶段 A — 短设计

写出：

**`docs/U19_PER_CALL_TOKEN_USAGE.md`**

必须包含：

1. **事件源与字段映射表**  
   - 目标展示字段：`payload.usage = { input, output, total?, cacheRead?, cacheWrite? }`，并建议 `token_scope: 'per_call' | 'run_aggregate' | 'last_call_of_turn' | 'unavailable'`。  
   - 从哪些钩子读、写入哪个 `event_type`（优先 `model.ended`；`model.started` 一般无用量）。  
2. **OpenClaw 限制结论**（引用上表）：2026.7.1-2 插件 `model_call_ended` **无** usage。  
3. **可行策略（按优先级写死选型，勿平行三套）**  
   - **P0 兼容写入**：`model.ended` 若事件对象运行时意外带 `usage`/`tokens` 则规范化写入；去掉无意义的 `tokens: null` 硬编码或改为与 `usage` 一致。  
   - **P1 最佳努力补强（可选其一，设计里选定）**：  
     - 监听 `reply_payload_sending`，仅当能用 `runId`/`callId` 与已有 `model.ended` 安全关联时，把 `usageState.lastUsage` 标为 `token_scope: 'last_call_of_turn'` 回填到**该轮最后一次** `model.ended`（不得回填到更早的调用）；或  
     - 仅改进 UI：逐步节点区分「汇总可见 / 逐步不可用」文案，并把运行汇总继续挂在 `model.output`。  
   - **禁止**：读取 OpenClaw 私有诊断总线未公开 API、patch `node_modules/openclaw`、用汇总 usage 除以调用次数伪造逐步值。  
4. **兼容旧轨迹**：无 `usage` → 显示明确原因（例如「token 未提供（OpenClaw 钩子未暴露逐步 usage）」），图注更新。  
5. **UI 文案**：有数 → `token {in}/{out}`；缺失 → 短原因；`model.output` 仍可显示运行汇总并标注「运行汇总」。  
6. **演示话术**（中文 2–4 句）：评委看到缺失时怎么解释；有数时怎么指着节点讲。  
7. **验收命令清单**（阶段 B 必须可跑）。

### 阶段 A 自检（全部勾选后再编码）

- [ ] 写明 2026.7.1-2 `model_call_ended` 无 usage 的证据路径  
- [ ] 选定唯一补强策略（P0-only 或 P0+P1 之一），无平行实现  
- [ ] 明确禁止伪造与禁止 patch OpenClaw  
- [ ] 旧轨迹兼容与 UI 文案已定义  
- [ ] 演示话术已写

---

## 4. 阶段 B — 实现

### 切片 1：采集（`register.mjs` 或等价）

- `model_call_ended` → `model.ended`：  
  - 规范化读取 `e.usage`（若存在）；不要再无条件写死 `tokens: null` 掩盖真相。  
  - 有 usage 时写入 `payload.usage`，并设 `token_scope: 'per_call'`（或设计文档选定的枚举值）。  
  - 无 usage 时：`usage: null`，可写 `token_missing_reason`（短稳定英文字符串，如 `openclaw_model_call_ended_no_usage`），供 UI 映射中文。  
- `llm_output` → `model.output`：保持运行汇总；确认 `token_scope: 'run_aggregate'` 仍在。  
- 若阶段 A 选了 `reply_payload_sending` 回填：实现要 **幂等、可关联才写、写失败不影响主采集**。

### 切片 2：展示（`view-model.mjs` / `view.mjs`）

- `nodePresentation`：  
  - 优先 `payload.usage` → `token {input}/{output}`。  
  - 否则用 `token_missing_reason` 映射的中文短句；默认可回退「token 未提供」。  
  - 对 `model.output`：可标注「运行汇总 token …」。  
- 更新图注：不要再说「token 一律为运行汇总」而不区分逐步/汇总。  
- `scripts/render_real_call_graph.mjs` 与在线图共用 `nodePresentation`，离线 SVG 应反映新文案。

### 切片 3：夹具与测试

- 更新/新增 fixture：至少一条 `model.ended` **带** per-call `usage`，断言 UI/view-model 不再显示无故「token 未提供」。  
- 至少一条 **无** usage 的旧形态，断言显示缺失原因且不抛错。  
- 现有 `test/core.test.mjs` 等回归仍须通过。  
- 至少一次真实或夹具图证：用 `render_real_call_graph.mjs` 或 trace 视图导出，截图/SVG 进证据目录。

### 切片 4：文档与证据

证据目录：

`local-validation/u19-per-call-token/<ISO-UTC>/`

至少包含：

- `design-ref.md`（指向 `docs/U19_PER_CALL_TOKEN_USAGE.md`）  
- `openclaw-version.txt`（应为 `2026.7.1-2`）  
- `hook-limitation.json`（记录：ended 类型有无 usage、采用的策略、是否拿到逐步数）  
- 测试日志 / `verify` 输出  
- 至少 1 张图证（SVG 或 PNG）：节点上可见逐步 token **或** 明确缺失原因（两者都算诚实 PASS；**用假数算 FAIL**）  
- `DELIVERY.md` 中文短交付说明

可选：更新 `modules/govagentsec-trace/README.md` 一句「逐步 token 与 OpenClaw 钩子限制」。

---

## 5. 验收清单（必须全跑）

在仓库根目录：

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
# 1) 版本锁
openclaw --version
# 2) 轨迹模块单测（按仓库现有方式；例如）
node --test modules/govagentsec-trace/test/*.mjs
# 3) 若有专用 verify 脚本则运行；否则用设计文档中的最小复现命令
# 4) 渲染夹具或真实轨迹图（路径写入证据）
# 5) 人工核对：model.output 汇总仍在；逐步节点有数或明确缺失原因
```

**PASS 标准**：

1. 有 `payload.usage` 的逐步节点显示 `token in/out`，不再无故「token 未提供」。  
2. 无 usage 时显示明确缺失原因（或保留「token 未提供」但设计/交付说明写清 OpenClaw 限制）。  
3. 运行汇总节点行为不回归。  
4. 未升级 OpenClaw、未 push、未外发轨迹。  
5. 证据目录齐全。

**若 OpenClaw 钩子根本不提供逐步 usage**：只要 P0 兼容 + 明确缺失原因 + 演示话术 + 证据中的 `hook-limitation.json` 诚实记录，即可判 **有条件 PASS**（展示层目标达成；数据源受宿主限制）。不得为强行有数而造假。

---

## 6. 交付格式（完成后中文简短说明）

1. 阶段 A 设计路径  
2. 改动文件列表  
3. OpenClaw 是否已有 per-call 插件钩子：**结论 + 证据**（类型字段/文档路径）  
4. 实际采用策略（P0 / P0+P1）  
5. 证据目录路径  
6. 验收命令与 exit code  
7. 剩余限制与评委话术  

禁止：升级 OpenClaw、push、提交密钥、伪造 token、patch `node_modules/openclaw`。