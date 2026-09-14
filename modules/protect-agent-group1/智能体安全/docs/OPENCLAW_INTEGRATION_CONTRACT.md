# OpenClaw × Protect Agent 接入契约

## 信任边界

- OpenClaw 用户消息、工具参数、工具结果和模型输出均是不可信数据。
- OpenClaw 插件运行在 Gateway 进程内，只负责 hook 编排和安全决策映射。
- Protect Agent 以本机常驻 Python sidecar 运行，监听 `127.0.0.1`，保持 PIGuard、Qwen3Guard 和 TrustRAG 热加载。
- 插件与 sidecar 使用 bearer token；配置只保存 token 文件路径，不保存 token。
- OpenClaw session key 在插件侧做 SHA-256 派生，sidecar 不接收原始 session key。
- 插件和 sidecar 不记录提示词、工具参数、工具结果、模型回答或认证令牌。

## HTTP 契约

### `GET /healthz`

仅返回进程存活状态，不返回配置、模型路径或密钥。

### `GET /readyz`

要求 Bearer Token 鉴权，仅在真实 Guard 和 TrustRAG 完成加载后返回 ready。

### `POST /v1/screen`

请求体：

```json
{
  "version": "1",
  "kind": "input",
  "text": "bounded untrusted content",
  "conversationId": "sha256-derived-id",
  "toolName": null,
  "query": null
}
```

约束：

- `kind` 只能为 `input`、`tool_call`、`tool_result`、`output`。
- `text` 去除首尾空白后必须为 1–16000 字符。
- `conversationId` 可省略；存在时必须为 1–128 个可打印字符。
- `toolName` 和 `query` 仅在对应 hook 中使用，并分别受长度限制。
- 拒绝未知字段、无效 JSON、超限 body、错误 Content-Type 和未授权请求。

响应体：

```json
{
  "version": "1",
  "decision": "ALLOW",
  "policyAction": "ALLOW",
  "riskLevel": "LOW",
  "riskScore": 0.04,
  "categories": [],
  "detectorsAvailable": true,
  "reasonCode": "RISK_LOW",
  "retained": true
}
```

`decision` 语义：

- `ALLOW`：继续当前 OpenClaw 阶段。
- `REVIEW`：工具调用要求人工批准；输入和输出因为没有安全改写通道而阻断。
- `BLOCK`：阻断输入/工具，或取消输出发送。

## Hook 映射

| OpenClaw hook | Protect kind | 执行方式 |
|---|---|---|
| `before_agent_run` | `input` | 非 ALLOW 时阻断，原始输入不进入模型历史 |
| `before_tool_call` | `tool_call` | BLOCK 阻断；REVIEW 或高影响工具要求批准 |
| `after_tool_call` | `tool_result` | 使用 TrustRAG 与 Guard 观察结果并更新会话风险；该 Hook 不能撤销已完成的工具调用 |
| `message_sending` | `output` | 非 ALLOW 时取消外发 |
| `agent_end` / `session_end` | — | 清理仅存在内存中的临时运行上下文 |

## 故障策略

- 输入和工具策略 hook 超时、网络失败、401、非 2xx、响应 schema 错误：阻断。
- 输出检查失败：取消发送。
- 工具结果观察失败：记录不含内容的安全告警；下一次受保护动作仍需重新检查。
- sidecar 启动失败时插件服务启动失败，OpenClaw `/readyz` 不应报告就绪。

## 资源边界

- 请求 body 上限：64 KiB。
- 单段待检文本上限：16000 字符。
- 插件递归序列化限制深度、数组/对象项数和字符串长度。
- sidecar 模型推理使用互斥锁，避免同一 GPU 上并发推理破坏状态或耗尽显存。
- HTTP 客户端和 OpenClaw policy hook 均设置有界超时。
