# U17 会话与评审现网边界设计

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

| 路径 | 配置 / 调用者 | 出域 | 验收 |
| --- | --- | --- | --- |
| 会话/规划/工具循环 | config/model-routing.json session_llm → OpenClaw models.providers、agents.defaults.model | 会话上下文可送配置的 API；敏感任务另选本地 | python scripts/check_model_routing.py；本包不做云账号测试 |
| Q/S 评审/演进 | security_review_llm → OllamaLocalJudge；旧 trajectory-governance 固定模型 | 否；external_review_enabled=false，回环地址、禁重定向、禁云模型 | 同检查脚本的本地边界与 Python 生成测试 |

状态：prepare 生成合并片段（prepared-not-applied）→ 审阅片段、U18 备份、向网关进程注入 DEEPSEEK_API_KEY 环境变量 → 显式 apply（configured-restart-required）→ 重启后检查实际默认值。不得整文件覆盖配置；旧会话/agent 覆盖不会自动清除。源码存在配置不代表现网启用，更不代表云账号连通通过。

激活 runbook（本包默认不执行）：`node scripts/prepare_model_routing.mjs` → 审阅 `local-validation/model-routing/openclaw-model-patch.json` → `node scripts/backup_openclaw_config.mjs` → `node scripts/apply_model_routing.mjs --config "$env:USERPROFILE/.openclaw/openclaw.json"`。固定版本前提必须满足；密钥只在环境/SecretRef，不能进入仓库。应用前后保存哈希，新建空白会话检查实际模型。

## 评委 FAQ

1. 全本地吗？不是。会话可走 API，安全评审在本地。
2. 轨迹会进 DeepSeek 吗？评审/演进调用不会；云会话本身会接收其消息与工具上下文，不能把敏感会话冒充零出域。
3. 断网能演吗？本地启发式可运行；Ollama 需本机服务/权重就绪，失败显示降级来源，不保证云会话可用。
4. API Key 在哪？环境变量/用户私有凭据引用，不在仓库或证据中。
5. 换会话模型会旁路护栏吗？不会自动改变原保护 hook、身份/任务 ACL 或发布闸；仍分别验收。
6. 配置 API 就证明可用吗？不。session_smoke 是本机模拟接口，真实账户/额度连通另验，本包不收费试调。

UI 维持防护设置“模型分工”两行：**会话模型（可 API）**、**安全评审（默认本地，轨迹不出域）**，读真实状态；禁止写“全面云端化”。U16 专测演进稳定性，本包只固化双轨边界。

## 阶段 A 自检

- [x] 双轨表明确，不把会话上下文与评审轨迹混称。
- [x] 激活步骤含 U18 备份、环境凭据、合并片段限制。
- [x] FAQ 与诚实口径齐全。
- [x] 引用现有真实配置、调用者、检查脚本。

## 验收

`node scripts/verify_u8_activation_boundary.mjs` 内含 `python scripts/check_model_routing.py`，归档 session_smoke、本地评审防外发、实际默认模型和配置前后哈希，不执行 apply。

结果：PASS，exit 0；现网默认 deepseek/deepseek-flash，配置哈希不变。本机模拟 session_smoke 不代表云账号连通。证据 `local-validation/u17-u8-activation-boundary/2026-11-08T07-13-16-791Z/report.json`。
