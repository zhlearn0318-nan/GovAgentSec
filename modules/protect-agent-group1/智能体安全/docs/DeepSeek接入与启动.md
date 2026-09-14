# DeepSeek 接入与启动

## 已接入的链路

```text
用户输入
  → 本地 PIGuard（提示注入检测）
  → 本地 Qwen3Guard（内容安全检测）
  → 可选 Retriever / 本地 TrustRAG
  → 风险关联分析与分级策略
  → DeepSeek V4（生成候选回答）
  → 本地 Qwen3Guard（输出复检）
  → 返回 JSON 响应
```

DeepSeek 使用官方 OpenAI 兼容 Chat Completions 接口。默认模型为
`deepseek-v4-flash`，也可将 `DEEPSEEK_MODEL` 设为 `deepseek-v4-pro`。
旧的 `deepseek-chat` / `deepseek-reasoner` 别名不再作为可选值。

## 一次性启动

在 PowerShell 中执行：

```powershell
Set-Location 'D:\桌面\Protect_agent\智能体安全'
$env:DEEPSEEK_API_KEY = '替换为你的 DeepSeek API Key'
& 'D:\软件\Qwen\.venv\Scripts\python.exe' -m app.main `
  '你好，请介绍当前防护链路' `
  --profile deepseek `
  --model-root 'D:\软件\Qwen\models' `
  --trustrag-module 'D:\软件\Qwen\third_party\TrustRAG\defend_module.py'
```

启用 RAG 安全链路：

```powershell
& 'D:\软件\Qwen\.venv\Scripts\python.exe' -m app.main `
  '检索并回答安全规范' `
  --profile deepseek `
  --rag `
  --model-root 'D:\软件\Qwen\models' `
  --trustrag-module 'D:\软件\Qwen\third_party\TrustRAG\defend_module.py'
```

当前默认 `InMemoryRetriever` 没有预装业务知识，因此 `--rag` 会贯通
TrustRAG 调用链路，但不会凭空检索外部知识库。接入真实向量库后才会获得业务 RAG 内容。

## 推荐的当前终端配置

同一个 PowerShell 窗口中先设置：

```powershell
$env:DEEPSEEK_API_KEY = '替换为你的 DeepSeek API Key'
$env:DEEPSEEK_MODEL = 'deepseek-v4-flash'
$env:DEEPSEEK_TIMEOUT_SECONDS = '120'
$env:DEEPSEEK_MAX_TOKENS = '2048'
$env:PROTECT_AGENT_MODEL_ROOT = 'D:\软件\Qwen\models'
$env:PROTECT_AGENT_TRUSTRAG_MODULE = 'D:\软件\Qwen\third_party\TrustRAG\defend_module.py'
```

之后启动命令可以缩短为：

```powershell
Set-Location 'D:\桌面\Protect_agent\智能体安全'
& 'D:\软件\Qwen\.venv\Scripts\python.exe' -m app.main '你的问题' --profile deepseek
```

环境变量只对当前 PowerShell 进程及其子进程生效。不要把真实 API Key 写入
源码、Markdown、测试报告或提交记录，也不要把密钥作为 CLI 参数传入。

## 返回与排错

- 退出码 `0`：安全检查和模型调用完成。
- 退出码 `2`：输入被隔离/阻断、配置错误、模型不可用或输出复检失败。
- 退出码 `3`：高风险工具操作需要人工确认。
- `INVALID_CONFIGURATION`：检查 `DEEPSEEK_API_KEY` 和两个本地模型路径。
- `ERROR` / `安全处理失败`：DeepSeek 超时、鉴权失败、响应格式异常，或某个本地模型加载失败。系统不会把远程响应体、堆栈或 API Key 回显给终端。

## 安全边界

- API 固定访问 `https://api.deepseek.com/v1/chat/completions`，拒绝 HTTP 重定向。
- 请求使用 JSON Output；响应必须符合唯一字段 `response_text` 的本地契约。
- 截断、内容过滤、空响应、畸形 JSON、超长响应全部失败关闭。
- RAG 文档与工具结果作为数据编码，不提升为 system 消息。
- DeepSeek 输出不能直接执行 Shell、SQL 或文件操作，最终文本仍经过本地输出 Guard。
