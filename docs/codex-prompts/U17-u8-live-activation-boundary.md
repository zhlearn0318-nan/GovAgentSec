# Codex 提示词 U17：U8 现网激活边界（会话 API vs 本地评审）

## 0. 角色与目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2**。不 push；轨迹不外发。

**缺口（项 6）**：防评委把「会话走先进 API」与「轨迹/评审本地」混成一句。需要**书面边界 + UI/检查可指认 + 现网激活状态说明**，对齐已有 `docs/MODEL_ROUTING.md`、`config/model-routing.json`、`scripts/check_model_routing.py`、`scripts/prepare_model_routing.mjs`、`scripts/apply_model_routing.mjs`。

本包以**边界固化与验收**为主；不强制改会话供应商。若现网已 apply DeepSeek，须如实记录并强调评审仍本地。

---

## 1. 硬约束

1. 会话可 API；**轨迹 Q/S 评审与自演进门控默认本地**；轨迹原文禁止 POST 外部 base URL。
2. `external_review_enabled`（或等价）默认 false；不得把对照开关做成默认发布闸路径。
3. 仓库不提交 API Key；仅 `api_key_env` / SecretRef。
4. `prepare_model_routing.mjs` 产出的是**合并片段**，禁止拿它整文件覆盖 `openclaw.json`。
5. 改现网配置前备份+哈希（可复用 U18 流程）；本包若只改文档/检查可不碰现网。
6. 不升级 OpenClaw；不 push。

---

## 2. 阶段 A — 设计

写出：

**`docs/U17_U8_LIVE_ACTIVATION_BOUNDARY.md`**

必须包含：

1. **双轨表**（与 MODEL_ROUTING 一致，按仓库实名）：

| 路径 | 配置键 / 调用者 | 允许出域？ | 验收命令 |
| --- | --- | --- | --- |
| 会话/规划/工具 | session_llm → OpenClaw models | 会话上下文可出域（敏感任务另选本地） | check_model_routing + 可选真实连通（合成字符串） |
| 轨迹评审/自演进 | security_review_llm / OllamaLocalJudge | **否** | 同脚本防外发项 |

2. **现网激活状态机**：prepared-not-applied → applied（有备份）→ 运行中；如何读实际默认模型；旧会话覆盖提示。
3. **评委 FAQ（至少 5 问）**：例「是不是全本地？」「轨迹会不会进 DeepSeek？」「断网能否演示评审？」「API Key 在哪？」「换模型会不会旁路护栏？」
4. **UI 文案**：防护设置「模型分工」两行必须可区分；禁止「已全面云端化」类表述。
5. **与 U16 关系**：U16 专测演进稳定性；本包专澄会话 vs 评审边界。

### 阶段 A 自检

- [ ] 双轨表无混称
- [ ] 现网激活步骤含备份警告
- [ ] FAQ 与诚实口径齐全
- [ ] 引用真实脚本/配置路径

---

## 3. 阶段 B — 交付切片

### 切片 1：文档与 FAQ 落地

- 更新 `docs/MODEL_ROUTING.md` 增加「现网激活边界 / 评委 FAQ」或保持本包设计为权威并在 MODEL_ROUTING 顶部链到 U17 文档。
- 更新 `DELIVERY_ACCEPTANCE.md` 验收项：会话 API 可达 ≠ 评审可出域。

### 切片 2：检查与证据

- 跑通并归档：

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
python scripts\check_model_routing.py
# 可选 UI：
# node scripts\test_model_controls_live.mjs
```

- 报告必须显式字段（已有则核对）：`session_smoke`、评审 local-only、现网哈希是否被本包改动（期望未改或已备份）。

### 切片 3：激活 runbook（只文档，默认不执行 apply）

- 写清：`prepare_model_routing.mjs` → 人工审片段 → `apply_model_routing.mjs --config %USERPROFILE%\.openclaw\openclaw.json` 的前提（环境变量、版本锁、备份）。
- **默认本包不 apply**；若用户已激活，只记录状态与哈希。

证据：`local-validation/u17-u8-activation-boundary/<ISO-UTC>/`

---

## 4. 非目标

- 不强制切换云账号或实测计费额度（可标「未替代真实云账号验证」）。
- 不开放默认外部轨迹评审。
- 不重做护栏/闸门。

---

## 5. 完成后中文简短交付说明

边界文档路径、检查是否绿、现网是否被改、评委一句话：「会话可走先进 API，轨迹评审在本地、不出域。」
