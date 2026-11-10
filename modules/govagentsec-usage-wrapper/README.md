# 本机 API 用量包装层（U20）

默认关闭。仅监听 `127.0.0.1`，把 deepseek / gov-session 的 openai-completions 会话请求转发到各自原上游。安全评审仍在 Ollama，不经过此服务。

包装层不改请求正文，流式响应边收边转发；只在内存保留用量和关联键。固定宿主公开 `ctx.trace` 与 HTTP `traceparent` 精确对应，插件拉取计数后追加 `model.usage`，不改历史事件。图与时间线把注解显示到模型返回节点，详情分别保留原事件与注解。

## 启用与关闭

仓库根目录 PowerShell：

```powershell
# 显式启用现网：先 U18 私有备份，再启动/检查服务，最后修改两个 provider 的 baseUrl
node scripts/usage_wrapper.mjs enable
# 原方式重载/重启 OpenClaw，使配置与插件生效

# 先双哈希检查并恢复原配置字节，再停服务；随后重载/重启 OpenClaw
node scripts/usage_wrapper.mjs disable
```

默认端口 `18792`。可选 `--port PORT`、`--config FILE`、`--state-dir DIR`；关闭时必须使用启用时同一 state-dir。完整配置备份在用户私有 `.openclaw/backups`，控制凭据与启停记录在 `.openclaw/usage-wrapper`，不进仓库。不要编辑控制凭据。

如果配置被其它操作改过，disable 返回 `TARGET_CHANGED` 并保持服务，避免覆盖新配置；按私有 `state.json` 的备份与当前文件人工合并。不要盲目重复覆盖。wrapper 进程故障时不自动旁路，会话明确报错；可执行 disable 恢复直连。采集解析/拉取失败只影响用量显示，不改变 AgentGuard、输入防护或审批。

## 验收与边界

```powershell
node --test modules/govagentsec-usage-wrapper/test/*.mjs
node --test modules/govagentsec-trace/test/*.mjs
node scripts/verify_u20_api_usage_wrapper.mjs
python scripts/check_model_routing.py
```

一键验收使用隔离配置、真实 OpenClaw 2026.7.1-2 和本机**合成 HTTP 上游**，不验证云账号或计费。完成后自动关闭并恢复原字节，核对现网配置和审批文件未变。结果位于 `local-validation/u20-api-usage-wrapper/<timestamp>/`，包括图、时间线和哈希。

只支持 `/chat/completions` 与 `/v1/chat/completions`；不支持 Responses API、非 loopback 监听、跨域重定向或其它 provider 自动接管。上游请求总时限默认 120 秒，超时 504、连接错误 502；上游 4xx/5xx 原样透传。SSE/JSON 采集上限 1 MiB（SSE 按帧）；超限仍转发响应，用量显示缺失。无字段不估算；重复 span 的 SDK 重试不擅自汇总。计数缓存 5 分钟/1000 条，去重 ID 集合 100000 个；满后采集提示容量限制，重启可清空。详情见 [MODEL_ROUTING](../../docs/MODEL_ROUTING.md)。
