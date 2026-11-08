# U19：逐次模型用量采集与展示

## 阶段 A 设计

选定 **P0 + P1（仅改进 UI）**：兼容保存公开钩子运行时实际提供的计数；没有计数时显示原因。运行汇总继续留在 `model.output`，不监听最后调用回填，不修改历史 JSONL，不接入私有诊断总线。

### 固定宿主核验

本机安装根目录：`C:/Users/23684/AppData/Roaming/npm/node_modules/openclaw/`。以下均只读核验：

| 来源 | 本机证据 | 结论 |
| --- | --- | --- |
| `model_call_ended` | `dist/hook-types-DQ9eTy2x.d.ts:449`，以及 `docs/plugins/hooks.md:415` | 公开字段含耗时、结果、字节数、TTFB、请求 ID 哈希，没有 usage |
| `model.call.completed` | `dist/attempt.model-diagnostic-events-CfZQM0hs.js:4723` | 内部诊断附带 `modelCallUsageField(state)`；紧随其后的 `dispatchModelCallEndedHook` 未传该字段 |
| `llm_output` | 同一类型文件 `PluginHookLlmOutputEvent`；`docs/plugins/hooks.md:192` | 完成 attempt 后的用量，保持运行/轮次汇总，不当作单次调用 |
| `reply_payload_sending.usageState` | 同一类型文件 `PluginHookReplyUsageState` | usage 是轮次汇总，lastUsage 仅最后调用；不能推广到每次调用，回放路径也可能缺失 |
| OpenTelemetry | 宿主独立诊断导出链路 | 不属于现有插件公开钩子；本次不接入、不修改 |

版本要求仍为 **2026.7.1-2**。内部有用量不等于公开钩子有用量，也不能用 contextTokenBudget（上下文上限）冒充消耗。

### 字段映射与显示

| 钩子 / 事件 | 保存字段 | 范围与文案 |
| --- | --- | --- |
| `model_call_started` → `model.started` | `usage:null`，`token_missing_reason:model_call_not_finished` | unavailable；`token 未提供（调用开始时无用量）` |
| `model_call_ended` → `model.ended` | 优先 e.usage，其次对象形态 e.tokens；仅保留 input/output/total/cacheRead/cacheWrite | 有有效计数为 per_call；`token 12/8（单次调用）` |
| ended 没有用量 | `usage:null`，`token_missing_reason:openclaw_model_call_ended_no_usage` | unavailable；`token 未提供（宿主钩子未暴露）` |
| ended 有字段但无有效计数 | `usage:null`，`token_missing_reason:invalid_usage` | unavailable；`token 未提供（用量字段无效）` |
| `llm_output` → `model.output` | 保持现有 usage | run_aggregate；`运行汇总 token 300/80` |

计数只接受非负安全整数；真实 0 保留，字符串、负数、非整数、NaN、Infinity 不转换为 0。部分有效字段保留，缺失方向显示“缺失”，不计算或拆分 total。未知键不落盘。`last_call_of_turn` 保留为展示范围，不在本次生成。

旧轨迹没有 scope/reason 时，根据事件类型说明：ended 为“宿主钩子未暴露”，started 为“调用开始时无用量”，output 为“运行汇总”。不把汇总复制到前面的调用。在线图、时间线和离线 SVG 共用 `nodePresentation`；运行指标仍只统计 output，防止双计数。

### 阶段 A 自检（编码前完成）

- [x] 写明固定版本 ended 无 usage 的类型、派发与文档证据路径。
- [x] 唯一策略 P0 + P1 仅 UI；不做 lastUsage 回填。
- [x] 禁止伪造、均摊汇总、读私有总线及 patch OpenClaw。
- [x] 定义旧轨迹兼容、部分缺失、真实零值与 UI 文案。
- [x] 演示话术如下。

### 演示话术

“每个模型返回节点显示宿主实际提供的单次用量；这里的缺失表示固定版本公开钩子没有暴露该字段。最终输出节点保留运行汇总，不会把汇总重复算到每一步。有逐次数字的合成夹具只验证显示能力，不是本机真实调用已拿到逐次用量的证明。”

## 验收命令

在仓库根目录执行：

```powershell
openclaw --version
node --test modules/govagentsec-trace/test/*.mjs
node scripts/verify_u19_token_usage.mjs
# 输入现有真实轨迹目录与 trace_id；只读历史 JSONL，输出离线图证
node scripts/render_real_call_graph.mjs <evidence目录> <trace_id> <输出目录>
# 网页图、时间线、离线导出一致性（本地 HTTP 测试页面，不发送模型请求）
node scripts/test_real_call_graph.mjs <evidence目录> <trace_id> --output=<输出目录>
```

证据写入 `local-validation/u19-per-call-token/<ISO-UTC>/`。真实图核对：模型开始/返回有明确缺失原因；最终输出仍显示运行汇总；节点和边非空、哈希链有效。单测另验证带逐次 usage 的 synthetic fixture、旧形态、零值和部分缺失。

## 验收边界

固定版本公开钩子仍无逐次用量时，结论只能为 **有条件 PASS**：兼容采集与诚实展示完成，真实逐次计数仍受宿主限制。未升级、不 push、不外发轨迹、不修改网关配置或安全策略。

## 本次验证（2026-11-08）

- 35 项轨迹单测通过；合成夹具覆盖单次计数、旧事件、部分缺失、非法值、真实零值以及汇总不双计数。
- 历史真实轨迹 `88e59d61-8fb5-4d3e-943f-1131bc477352`：22 节点、25 边，哈希链有效，汇总输入 4100 / 输出 106；实际逐次 usage 未提供。
- Edge 网页图、时间线、空态、延迟加载、窄视口及离线 PNG/SVG 一致性共 12 项检查通过。此次复用了历史真实 JSONL，没有新发起模型会话。
- 原配置重载网关后，现网页面联验通过全部 13 项检查。原始轨迹 20 节点 / 23 边，演示副本多两条任务/评分注解；原始事件哈希一致。网关健康 HTTP 200，配置 SHA256 未改变。
- 证据与完整复跑命令：[DELIVERY.md](../local-validation/u19-per-call-token/2026-11-08T09-11-44-813Z/DELIVERY.md)。
