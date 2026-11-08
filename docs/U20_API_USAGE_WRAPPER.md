# U20：本机 HTTP 用量包装层

## 阶段 A：设计及源码核验

固定 OpenClaw **2026.7.1-2**，日常和评委机默认 **关闭**。本包不改宿主安装目录、不改防护/审批/ACL、不升级、不 push；会话仍可调用原 DeepSeek，评审和轨迹归纳仍仅本地。

已完整阅读：`config/model-routing.json`、`scripts/check_model_routing.py`、`prepare_model_routing.mjs`、`apply_model_routing.mjs`、`docs/U17_U8_LIVE_ACTIVATION_BOUNDARY.md`、`docs/U18_OPENCLAW_CONFIG_RECOVERY_DRILL.md`、`scripts/lib/config-recovery.mjs` 及 backup/restore 入口；trace 的 register/store/usage/view-model/view；U19 设计与任务文档。现网只读取 provider 结构：deepseek、gov-session 均为 `https://api.deepseek.com`、openai-completions、DEEPSEEK_API_KEY 的 env SecretRef；未抄录凭据。仓库未发现专用 usage wrapper；现有 session_smoke/mock 只验证路由。

### 架构与接线

```text
OpenClaw deepseek / gov-session（原 API Key 仍由 SecretRef 提供）
  → http://127.0.0.1:18792/<provider>/chat/completions
  → 原 provider.baseUrl + /chat/completions
  ← 原 JSON / SSE 字节流
Trace 插件 model_call_ended(ctx.trace)
  → wrapper /usage/<traceId>/<spanId>（本机独立随机凭据）
  → TraceStore.append(model.usage)
  → 视图按明确父事件合并到 model.ended；原事件与哈希不变
```

实现放 `modules/govagentsec-usage-wrapper/`。固定 127.0.0.1 监听；允许 `/chat/completions` 和 `/v1/chat/completions`，不支持其它 API（包括当前未使用的 responses）。上游只能是配置时固定的 HTTPS 地址，测试允许显式 loopback HTTP；不从请求参数取上游，不跟随重定向。

请求正文逐字节透传，不增加 system prompt、不改 stream_options 或工具参数。只转发业务必要头（Authorization、Content-Type、Accept）；W3C 关联头在本机终止，不向上游转发。响应状态、业务头和原始字节流透传；不缓冲整段 SSE 后才回复。记录端不保存正文、API key、Cookie、响应 ID 或错误堆栈。超时返回 504，连接故障 502；上游 4xx/5xx 原样转发；已经开始响应后断流就中断连接，不补造完成包。

### 唯一回灌方案 A：追加注解事件

现有 TraceStore 只追加；现有 RPC 没有 usage ingest，HTTP 路由仅静态资源。选插件主动拉取 wrapper 的短期**内存**用量记录，再由已有 store 追加 `model.usage`。不新增独立落盘台账、不让独立进程并发直接写同一 JSONL，不使用 OBSERVERS 全局防护总线。

插件配置 `usageWrapper:{enabled:false,endpoint,credentialFile,providers}`。凭据是随机本机控制令牌，仅留用户私有运行目录；不使用或公开 DeepSeek API key 作为用量读取凭据。只允许 loopback endpoint，禁止重定向；获取失败仅追加缺失原因，不改变模型运行返回或防护结果。默认关时不发请求。

`model.usage` 包含原 `model_call_id`、`parent_event_id=model.ended.event_id`、关联键、规范化 usage、来源 `loopback-http-wrapper`、scope。追加失败通过既有 capture-health 暴露。重复 hook 不重复注解。视图只接受同 trace、同 call、同关联键、唯一父事件的注解，不改原事件；离线导出和时间线复用同一 join。

### 并发关联：公开 ctx.trace 与 HTTP traceparent 精确匹配

额外核实本机只读源码：

- `dist/hook-types-DQ9eTy2x.d.ts:389`：公开 `PluginHookAgentContext.trace?: DiagnosticTraceContext`。
- `dist/attempt.model-diagnostic-events-CfZQM0hs.js`：`wrapStreamFnWithDiagnosticModelCallEvents` 为每次调用生成 child trace；`modelCallHookContext` 给插件同一 trace；`withDiagnosticTraceparentHeader` 给 HTTP 同一 traceparent。
- `dist/diagnostic-events-JZsXee1S.js:97`：W3C `00-<traceId32>-<spanId16>-<flags>`；按 traceId+spanId 关联，不依赖时间或模型名。这里读取代码核实，但实现不导入宿主私有 API、不订阅诊断总线。
- `upstreamRequestIdHash` 只在部分错误路径填充，不能用来假定成功调用关联。

wrapper 从传入 traceparent 提取 trace/span，插件从公开 ctx.trace 提取；两侧格式和非零约束一致。多 run、多 call 并行按键隔离。缺失或无效键不回灌；同 span 出现多个 HTTP 尝试（如 SDK 重试）标 ambiguous，不擅自把任意一次或总和作为该 call 用量。用量记录 TTL 为 5 分钟、最多 1000 条；ID-only 去重集合最多 100000 个，防止过期后的重试被误当首次请求；集合满后新键停止采集并说明原因（会话照常），重启可清空。过期/重启/丢失都显示不可得，不弱匹配兜底。

### 用量抽取

JSON 最终包读取 usage；SSE 增量按完整事件解析，读取末包 usage，不累加重复包。解析器有大小上限，超限只关闭采集，响应继续流式透传。映射：prompt_tokens→input、completion_tokens→output、total_tokens→total、prompt_cache_hit_tokens（或 prompt_tokens_details.cached_tokens）→cacheRead；cacheWrite 仅在显式 cache_creation_input_tokens 字段出现时写入，不能拿 cache miss 推算。只接受实际非负安全整数。无字段、畸形、冲突、截断分别记稳定原因，真实 0 保留。

[DeepSeek 官方 Chat Completions 文档](https://api-docs.deepseek.com/api/create-chat-completion/)说明 JSON usage 以及 SSE 末包统计。当前宿主已具 streaming usage compat；wrapper 不依赖每个 chunk 都有 usage，也不改变业务请求去强制获取。fixture 测试同时覆盖含/不含 usage 的末包，不能声称 fixture 数是云端实测。

范围沿用 U19：精确关联 `per_call`，现有输出 `run_aggregate`，关/失败/未关联 `unavailable` + 原因。汇总只统计 model.output，追加注解不重复算入。图上出现“用量采集”证据节点，模型返回节点显示同一用量并保留来源 event_id。

### 开关、备份、回滚和故障

`node scripts/usage_wrapper.mjs enable`：版本锁 → U18 backup + SHA → 创建私有凭据/配置 → 启动 wrapper → health → 仅修改 deepseek/gov-session baseUrl 和 trace usageWrapper 配置 → 记 after-enable SHA。默认端口 18792。配置其它项逐项保留；宿主重载/重启后生效。启动失败不改现网；并发改配置则拒绝覆盖。

`node scripts/usage_wrapper.mjs disable`：核对目标当前 SHA 和备份 SHA → U18 恢复原字节 → 停 wrapper → 核对 after-restore=before。配置存在外部更新时停止恢复，保留 wrapper 与私有现场供人工合并，不覆盖新配置。密钥和完整备份在 `%USERPROFILE%/.openclaw`，证据只有哈希和非敏感结构。

wrapper 进程故障采用**明确会话错误，不自动旁路**；操作员 disable 恢复直连。usage 解析/回灌失败是展示 fail-open；网关所有安全 hook、OPA、审批和 ACL 原路径不变（安全 fail-closed）。额外一跳和本机内存携带请求/Authorization 是明确代价；不日志打印。上游断网错误诚实返回；Ollama 评审不经过 wrapper。

默认验收走**隔离配置＋合成 HTTP fixture 回放**完成启用→可见→停用→原字节恢复；不为验收自动把现网用户请求送云端。可用 enable 命令显式启用现网；交付区分合成回放与真实云会话。验收调用实际 registerTrace 钩子路径，并补固定宿主真实 HTTP 链路探针验证 traceparent 关联可得。

### 阶段 A 自检（编码前）

- [x] 架构、baseUrl 与私有凭据路径明确。
- [x] 唯一方案 A，原 JSONL 不改写，既有 store 单进程追加。
- [x] trace/span 精确关联；并发、SDK 重试歧义和缺失均不猜测。
- [x] 流式/非流式抽取、上限、截断与错误规则明确。
- [x] U19 scope、标签和汇总保持兼容。
- [x] 默认关闭，loopback-only，U18 双哈希恢复。
- [x] 风险、故障降级、评审边界和非目标明确。
- [x] 以下命令为阶段 B 验收入口。

## 验收命令

```powershell
openclaw --version
node --test modules/govagentsec-usage-wrapper/test/*.mjs
node --test modules/govagentsec-trace/test/*.mjs
node scripts/verify_u20_api_usage_wrapper.mjs
python scripts/check_model_routing.py
```

证据目录 `local-validation/u20-api-usage-wrapper/<ISO-UTC>/`。图证、架构、日志、开关与恢复哈希、限制和真实宿主探针状态均写入报告。默认关的演示话术：“开启后会话经本机包装层转发到原上游，单次 token 来自回包；关闭恢复直连，逐步回到宿主钩子限制说明。”

## 阶段 B 结果（2026-11-08）

**PASS（真实宿主＋本机合成上游；不是 DeepSeek 云端实测）**。固定宿主 CLI 的公开 ctx.trace 和实际 HTTP traceparent 已端到端验证，未读取私有诊断 API。trace `899e51aa-4b92-4c7c-8c66-44b7082d4cc0` 追加注解后逐次 `12/8`、scope=per_call、哈希链有效；图、时间线、原始详情均通过浏览器断言，图注明合成上游。

wrapper 4 项测试、trace 37 项回归、专用 verify、模型路由检查均 exit 0。隔离配置启用后哈希改变，关闭后恢复到启用前原字节；现网配置与审批文件未变。源文件校验与 U19 记录一致，宿主未升级/未 patch。现网 wrapper 保持关闭，不切真实会话流量。

完整证据：[DELIVERY.md](../local-validation/u20-api-usage-wrapper/2026-11-08T10-20-01-667Z/DELIVERY.md)、[report.json](../local-validation/u20-api-usage-wrapper/2026-11-08T10-20-01-667Z/report.json)。
