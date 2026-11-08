# Codex 提示词 U8：会话主模型走 API + 安全评审默认本地

## 角色与仓库
`F:\揭榜挂帅\GovAgentSec`，OpenClaw **2026.7.1-2**（禁止升级宿主）。默认不 git push。
产品叙事：在**接入先进大模型**条件下做 Agent 安全（政安纵深），不是用小本地模型替代先进模型。

## 背景与决策（已由用户确认）
1. **会话 / 规划 / 工具调用主路径**：接云端先进模型 API（优先 DeepSeek，可配置；勿写死单一供应商密钥进仓库）。
2. **安全评审 / 轨迹质量·安全打分 / 自演进门控**：默认**本地模型**（现有 Ollama Qwen 等），**轨迹与评分证据不得发往外部 API**（含 DeepSeek）。
3. 护栏—闸门—台账与模型供应商解耦：换强 API 不得旁路安全钩子。
4. 本地 Qwen 可保留为：评审兜底、断网演示、对照基线；**不再作为默认会话大脑**。

## 目标
### A. 配置分层（P0）
1. 在 OpenClaw / 工作区配置中明确两套端点，例如：
   - `session_llm`（或等价）：API，用于对话与工具循环
   - `security_review_llm`：本地，用于轨迹 Q/S 评审与自演进相关判定
2. 环境变量或本地 secrets 注入 API Key；**仓库只留占位与文档**，不提交真实 key。
3. UI/设置页（若已有模型配置入口）用中文标明：「会话模型（可 API）」「安全评审（默认本地，轨迹不出域）」。

### B. 调用路由（P0）
1. Agent 正常对话、规划、选工具 → 只走 `session_llm`。
2. 过程台账 / 经验自演进里凡读取轨迹正文或做安全·质量评审 → 只走 `security_review_llm`；代码路径上断言禁止把轨迹 POST 到外部 base URL。
3. 可选：提供「外部评审对照」开关，**默认关**；开启时须二次确认，且不得写入默认发布闸路径。

### C. 文档与演示话术（P0）
1. 新增或更新 `docs/MODEL_ROUTING.md`：说明为何会话用 API、评审用本地；与「先进模型条件下的 Agent 安全」叙事对齐。
2. 更新 `docs/DELIVERY_ACCEPTANCE.md` / 产品使用逻辑：验收项区分「会话 API 可达」与「评审本地且轨迹不出域」。
3. 更新 `UPGRADE_ROUND_VALIDATION.md` 记录本包。

### D. 验收脚本（P1）
1. `scripts/check_model_routing.py`（名称可自定）：
   - 读配置：session 指向 API host；review 指向 localhost/Ollama 类地址
   - 静态或运行时检查：自演进/轨迹评审模块未引用外部 chat completions（除非对照开关显式打开）
2. 冒烟：会话能走 API 回一句（可用 mock/录制，避免 CI 强依赖外网）；评审路径在关闭外网或阻断外部 DNS 时仍能对合成轨迹给出本地结果。

## 约束
- 不升级 OpenClaw；不削弱护栏/闸门 fail-closed。
- 不把轨迹、公文、prompt 原文发外部 API。
- 不在 git 提交 API Key；演示用本机 env / 用户本地配置。
- 默认不 git push。
- 不删本地模型能力，只改默认角色。

## 建议落点
- OpenClaw 模型/代理配置与工作区设置文案
- `modules/` 下自演进、轨迹评分、安全评审调用点
- `docs/MODEL_ROUTING.md` 与验收脚本

## 验收命令
```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
# 实现后以实际脚本名为准：
python scripts\check_model_routing.py
# 若有现有演进/轨迹测试，须在「评审=本地」配置下仍绿：
# 例：.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\...
```

## 完成定义
- 默认会话不再依赖 Qwen3-8B 作为主对话模型；API 配置文档与占位齐全
- 轨迹安全/质量评审默认本地且有防外发检查
- 中文文档讲清「先进 API + 本地评审」双轨；相关检查脚本可重复跑通