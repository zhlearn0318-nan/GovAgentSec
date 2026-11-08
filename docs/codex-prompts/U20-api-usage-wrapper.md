# Codex 提示词 U20：自建 API 包装层采逐步 token（先设计后实现）

## 0. 角色与目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2**。不 push；轨迹内容不外发外部 API（会话模型本身可走 DeepSeek，但轨迹 JSONL / 提示词正文 / 工具返回不得另发外域）。

**目标**：在**不改 OpenClaw 内核、不 patch `node_modules/openclaw`** 的前提下，用**自建本地 HTTP 包装层（usage wrapper）**截获每次 chat/completions（及如有则 responses）上游回包中的真实 `usage`，写入过程台账，使轨迹图「模型返回」节点能显示**逐步** `token {input}/{output}`（`token_scope: 'per_call'`）。

**背景（已核实，勿重复 U19 假结论）**：

- U19（方案 B）已完成：**有条件 PASS**。公开钩子 `model_call_ended` 仍无 per-call usage；UI 诚实标缺失原因；运行汇总仍在 `model.output`。
- 设计见 `docs/U19_PER_CALL_TOKEN_USAGE.md`；采集/展示见 `modules/govagentsec-trace/usage.mjs`（`normalizeUsage` / `perCallUsage` / `tokenPresentation`）与 `register.mjs`。
- 会话路由：`config/model-routing.json` → `session_llm.provider=deepseek`，`base_url=https://api.deepseek.com`，`api=openai-completions`，密钥环境变量名 `DEEPSEEK_API_KEY`。安全评审仍走本地 Ollama（`security_review_llm`），`external_review_enabled=false`（见 U8/U17）。
- 现网 `%USERPROFILE%\.openclaw\openclaw.json`：`models.providers.deepseek.baseUrl` 指向 DeepSeek；`api: openai-completions`；`apiKey` 为 env SecretRef（`DEEPSEEK_API_KEY`）。另有 `gov-session` provider，当前也直连 DeepSeek。**只记结构，禁止把密钥抄进文档/证据/git**。
- 仓库内**尚无**专用 LLM usage wrapper（勿把 aegis venv 里的 litellm 依赖目录当成已实现包装层）。

**非目标**：不接组织 OIDC；不重做双沙箱；不升级宿主；不重做 U19 UI 缺失文案（应复用并扩展 `token_scope`）；不为逐步 token 改护栏/闸门/ACL 语义。

---

## 1. 硬约束

1. 不升级 OpenClaw（全程断言 `2026.7.1-2`）。
2. **不 patch** `%APPDATA%\npm\node_modules\openclaw` 或任何 OpenClaw 安装目录源码。
3. **禁止伪造 usage**：无上游字段则保持缺失；禁止均摊汇总、禁止用估算值填逐步。
4. 密钥不进 git、不进证据正文；完整含密钥的 `openclaw.json` 不提交。
5. 改现网 `openclaw.json`（例如把 `baseUrl` 指到 wrapper）前：**必须**按 U18 思路备份 + 记 SHA-256（复用 `scripts/backup_openclaw_config.mjs` 等已有能力；若缺则对齐 U18 接口补最小脚本）。结束或回滚后哈希可对账。
6. 包装层默认**可关**；关闭后 OpenClaw 应能恢复直连上游，轨迹逐步可退回 U19「钩子未暴露」诚实态。
7. **展示 fail-open、安全 fail-closed**：usage 采集失败不得阻断会话或削弱护栏/闸门；也不得因包装层故障伪造 0。
8. 不 push；轨迹不外发外部 API（包装层只转发到已配置的上游会话 API，不把轨迹店另发）。
9. 不平行造第二套轨迹存储；必须挂接现有 `govagentsec-trace`（`TraceStore` 哈希链 JSONL）。

---

## 2. 必读（阶段 A 编码前必须读完并写入设计引用）

1. `config/model-routing.json`、`scripts/check_model_routing.py`、`scripts/prepare_model_routing.mjs`、`scripts/apply_model_routing.mjs`、`docs/U17_U8_LIVE_ACTIVATION_BOUNDARY.md`（及 U8 相关文档若存在）。
2. 现网（只读、脱敏）：`%USERPROFILE%\.openclaw\openclaw.json` 中 `models.providers.*.baseUrl` / `api` / `apiKey` 形态；**不要**把真实 token 写入设计或证据。
3. `modules/govagentsec-trace/register.mjs`、`store.mjs`、`usage.mjs`、`view-model.mjs`、`view.mjs`。
4. `docs/U19_PER_CALL_TOKEN_USAGE.md` 与 `docs/codex-prompts/U19-per-call-token-usage.md`。
5. U18 备份/恢复：`docs/U18_OPENCLAW_CONFIG_RECOVERY_DRILL.md` 与相关 `scripts/backup_openclaw_config.mjs` / `restore_*.mjs`（以仓库实有文件名为准）。
6. 排查是否已有本地代理/mock LLM：**结论应写入设计**（当前预期：无专用 wrapper；session_smoke 等是路由模拟，不是 per-call usage 代理）。

### 已核实事实（设计必须正面回应）

| 事实 | 含义 |
| --- | --- |
| 公开钩子无 per-call usage（U19） | 逐步数必须来自**包装层截获的上游 HTTP 回包**，不能指望 `model_call_ended`。 |
| `TraceStore.append` 为**只追加哈希链** | **禁止改写**已落盘的 `model.ended` 行。回灌只能：追加新事件类型，或 sidecar 在读时 join；设计必须选侵入最小且不破坏 `verifyChain` 的一种。 |
| `register.mjs` 现有 HTTP 路由 | 仅静态下发 `view.mjs` / `view-model.mjs` / `usage.mjs`；**尚无**公开的 usage ingest HTTP API。Gateway methods 有 `list/detail/...`，无现成「外部补 usage」。 |
| `OBSERVERS` Symbol | 用于 Group1 等防护观察写入，不是 LLM usage 通道；勿滥用成隐藏全局总线 unless 设计论证最小侵入。 |
| DeepSeek `openai-completions` | 非流式 JSON 通常含 `usage`；流式需确认是否 `stream_options.include_usage` 或末包 usage（DeepSeek compat 已标 `supportsUsageInStreaming: true`）。包装层必须同时处理流式/非流式。 |
| 关联难题 | 包装层看见的是 HTTP，插件看见的是 `runId`/`callId`。必须设计 **call 关联**（见阶段 A），不能假设「只有一个并发调用」。 |

---

## 3. 阶段 A — 短设计（先写文档，自检全勾再编码）

写出：

**`docs/U20_API_USAGE_WRAPPER.md`**

必须包含：

### 3.1 架构

```
OpenClaw (openai-completions provider)
    → http://127.0.0.1:<port>/...   （本地 usage wrapper）
        → https://api.deepseek.com/...  （或配置的上游；密钥仍用现有 env/SecretRef 透传）
```

- 如何改 `models.providers.deepseek.baseUrl`（及若演示用的 `gov-session`）指向 wrapper；路径前缀是否需兼容 `/v1/chat/completions`。
- 请求/响应**透传**规则：除必要的关联头/日志外不改业务语义；超时、错误码原样回传。
- 从 JSON（及 SSE）抽取 `usage` → 规范化为与 U19 一致的 `{ input, output, total?, cacheRead?, cacheWrite? }`（注意 OpenAI 字段常为 `prompt_tokens`/`completion_tokens`，需映射到 `input`/`output`）。

### 3.2 回灌轨迹（必须先查仓库再选型）

要求 Codex **先查**现有 ingest 面（`TraceStore.append`、gateway methods、`registerHttpRoute`、插件内 observer），然后在设计里**只选一种**侵入最小方案并写清理由，例如候选：

- **A. 追加注解事件**：wrapper 写 sidecar 或调本仓库新增的 **loopback-only** ingest（插件 `registerHttpRoute` 或 gateway method），`append` 一条如 `model.usage` / `model.usage.observed`，带 `model_call_id`（或可验证关联键）；`view-model`/`tokenPresentation` 合并展示到对应「模型返回」节点。  
- **B. 读时 sidecar join**：wrapper 只写 `%LOCAL%` 或 `dataDir` 下 sidecar（按 request-id / 时间窗索引）；图渲染时 join；**仍须**说明与哈希链、离线 SVG、评委复现的关系。  
- **C. 其它更小侵入**：若发现已有可复用入口，论证后采用。

**禁止**：改历史 JSONL 行、破坏 `prev_hash`、用汇总 usage 填逐步。

### 3.3 多并发与关联

写明：

- 关联键候选：上游/OpenClaw 已有 request id、响应 `id`、自定义回传头、时间窗+model 弱匹配（弱匹配只能演示兜底并标 `token_scope` 风险）。
- 目标：稳定关联到 `model_call_id` 或 `model.ended` 的 parent；关联失败 → **不展示假数**，可记 `token_missing_reason`（如 `usage_wrapper_unassociated`）。
- 并发：多 run / 多 call 同时进行不得串单。

### 3.4 流式 / 非流式

- 非流式：读最终 JSON `usage`。  
- 流式：透传 SSE；在末包或官方 usage 事件提取；未出现则缺失。  
- 不得缓冲整段再伪造 usage。

### 3.5 与 U19 `token_scope` 对齐

复用并扩展枚举语义（保持向后兼容）：

- `per_call`：包装层成功关联的逐步用量  
- `run_aggregate`：现有 `model.output`  
- `unavailable` + `token_missing_reason`：钩子无 / 包装层关 / 未关联 / 上游无字段  

UI 文案走 `tokenPresentation`；有逐步数时显示「单次调用」。

### 3.6 开关、默认策略、回滚

- **配置开关**（建议独立小配置或插件 config，如 `usageWrapper.enabled`）：默认 **关**（演示需逐步 token 时再开），设计里写死「演示默认关或开」的明确策略与一句评委话术。  
- 开启步骤：U18 备份 → 改 baseUrl → 启动 wrapper → 健康检查 → 重载/重启网关（按现网实际）→ 跑验收。  
- 关闭/回滚：恢复 baseUrl 备份、停 wrapper、哈希对账。  
- wrapper 只监听 **loopback**（`127.0.0.1`），禁止默认 `0.0.0.0` 对外。

### 3.7 风险（设计必须写）

至少覆盖：额外一跳延迟；API Key 经过本机进程内存/日志（日志必须脱敏）；wrapper 挂了导致会话失败时的降级（fail 会话错误 vs 自动旁路——选定并说明安全含义）；断网/上游 4xx/5xx；与 U8 双轨（评审仍本地、不过 wrapper）一致性。

### 3.8 阶段 A 自检（全部勾选后再进入阶段 B）

- [ ] 架构图与 baseUrl 接线步骤已写，密钥不落文档  
- [ ] 回灌方案唯一选定，且论证不破坏哈希链  
- [ ] 并发关联策略与失败时「不造假」已写  
- [ ] 流式/非流式抽取规则已写  
- [ ] 与 U19 `token_scope` / `tokenPresentation` 对齐  
- [ ] 默认开关策略、U18 备份回滚、loopback-only 已写  
- [ ] 风险与非目标已写  
- [ ] 验收命令清单已写（供阶段 B 原样执行）

---

## 4. 阶段 B — 实现切片（自检通过后）

### 切片 1：wrapper 服务

- 建议落点：`modules/govagentsec-usage-wrapper/` 或 `scripts/usage-wrapper/`（设计定名，保持可单测）。  
- Node 或 Python 均可，但须：loopback 监听、路径兼容 openai-completions、流式透传、usage 抽取、脱敏日志、健康检查 endpoint、可一键启停。  
- 单测：用**录制/夹具**响应（含 usage / 无 usage / 流式末包），不强制每次打真实 DeepSeek（可另加可选 live 开关）。

### 切片 2：配置接线

- 文档化 + 脚本：`enable` / `disable` wrapper（改 baseUrl、启停进程）。  
- enable 前调用 U18 备份并写 `sha256_before`；disable/restore 后写 `sha256_after`。  
- **不要**把 `DEEPSEEK_API_KEY` 写入仓库配置文件；透传 Authorization 即可。  
- 默认保持关闭；若验收需要开启，证据里记录开启↔关闭闭环。

### 切片 3：轨迹写入与 UI

- 按阶段 A 选定方案实现回灌；扩展 `usage.mjs` / `view-model.mjs` 使逐步节点显示 `token in/out（单次调用）`。  
- 关联失败或 wrapper 关闭：保持 U19 诚实缺失，不回归成空白崩溃。  
- 离线 `render_real_call_graph.mjs` / 在线图共用展示逻辑。

### 切片 4：Ensure / Verify / 证据

证据目录：

`local-validation/u20-api-usage-wrapper/<ISO-UTC>/`

至少包含：

- `design-ref.md` → `docs/U20_API_USAGE_WRAPPER.md`  
- `openclaw-version.txt`（`2026.7.1-2`）  
- `wrapper-architecture.json`（port、上游 host 脱敏、开关默认值、回灌方案名）  
- `hash-before.txt` / `hash-after-enable.txt` / `hash-after-restore.txt`（或等价）  
- 单测与 verify 日志  
- **至少 1 张**真实或录制回放图证：单步节点可见 `token in/out`（夹具可证显示；若跑 live，注明一次真实会话）  
- `rollback.md`：关闭 wrapper + 恢复 baseUrl 步骤  
- `DELIVERY.md` 中文短交付说明  

建议脚本名（可按仓库风格微调，但需在设计与交付中写死）：

- `scripts/verify_u20_api_usage_wrapper.mjs`  
- （可选）`scripts/enable_usage_wrapper.mjs` / `disable_usage_wrapper.mjs`

### 切片 5：演示策略

交付中明确一句：

- 日常/评委机默认 **关** 或 **开**（二选一写死）；  
- 开启时演示话术：「会话请求经本机用量包装层转发到原上游，逐步 token 来自上游回包，不是估算；关闭后恢复直连，逐步回到钩子限制说明。」

---

## 5. 验收清单（必须全跑）

在仓库根目录（PowerShell）：

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
openclaw --version
# 应为 2026.7.1-2

# 设计已存在
# docs/U20_API_USAGE_WRAPPER.md

# 包装层单测 + 轨迹相关回归
node --test modules/govagentsec-trace/test/*.mjs
# 加上 wrapper 自身测试（路径以设计为准）

# 专用验收（须覆盖：开启→逐步可见→关闭回滚→哈希）
node scripts/verify_u20_api_usage_wrapper.mjs

# 路由边界不回归（评审仍本地）
python scripts/check_model_routing.py
```

**PASS 标准**：

1. 至少一次（live 或录制回放）图上单步显示真实/夹具 `token in/out`，且 `token_scope` 为 `per_call`（或设计等价且文案为单次调用）。  
2. 上游夹具无 usage 时不造假。  
3. 关掉 wrapper 并恢复 baseUrl 后可回退；配置哈希对账清楚。  
4. 未升级 OpenClaw、未 patch 内核、未 push、密钥未进 git。  
5. 证据目录齐全；`check_model_routing.py` 不因本包把评审轨改出域。

---

## 6. 交付格式（完成后中文简短说明）

1. 阶段 A 设计路径与自检结果  
2. 选定的回灌方案（A/B/C）与一句话理由  
3. 改动文件列表  
4. 默认开关策略与回滚命令  
5. 证据目录路径  
6. 验收命令与 exit code  
7. 剩余限制（例如：仅覆盖经 wrapper 的 openai-completions 会话；Ollama 本地评审不经 wrapper；弱关联场景等）

禁止：升级 OpenClaw、patch `node_modules/openclaw`、push、提交密钥、伪造 token、破坏轨迹哈希链、默认绑定非 loopback。
