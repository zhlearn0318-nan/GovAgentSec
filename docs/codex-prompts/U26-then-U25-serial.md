# Codex 串跑提示词：先 U26 后 U25（双库主链路 → 四入口 IA）

## 0. 角色与目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2**。不 push；不 patch 宿主；轨迹不外发。

**你是 Codex / GPT6Astra-Ultra。按固定顺序一口气做完两包：先 U26，再 U25。** 每包都是「阶段 A 设计自检 → 阶段 B 实现验收」。**U26 未 PASS 不得开始 U25 编码**（U25 阶段 A 可预读，不可抢先改导航壳）。

```text
U26（先） 内部资料库 + 工具库 + 会话闸门 + 轨迹/沙箱/评测演进对齐
    ↓ PASS + 证据落地
U25（后） 五入口收四入口 + 唯一登录 + 演示账号 + 防护设置布局（含 U25b）
```

专项全文（本串跑是编排与冲突裁决；细节以专项为准）：

1. `docs/codex-prompts/U26-dual-library-runtime-gate.md`
2. `docs/codex-prompts/U25-four-entry-workspace-ia.md`
3. `docs/codex-prompts/U25b-protect-settings-layout.md`（与 U25 §2.5 冲突时以 U25b 为准）
4. UI：`docs/codex-prompts/govagentsec-ui-polish.md`（即 govagentsec-ui-polish；找不到 Bot skill 时以该文件为准，沿用青绿规范继续，勿停工）

开工前请 **通读上述 1–3 全文**，再按本文件顺序执行；不要只读本摘要。

---

## 1. 全局硬约束

1. OpenClaw 全程 `2026.7.1-2`；不升级；不 patch `node_modules/openclaw`。
2. 不 push；Bearer / 轨迹原文 / 密钥不进证据正文。
3. 不接真 OIDC；演示身份源；禁自批；批准≠执行；材料只提交 ID；未识别工具默认拒绝；U20 默认关。
4. 改配置前 U18；默认 Docker；切 srt 有确认。
5. 产品 UI 无验收话术。
6. 保留既有未提交改动；各包 changes.json 区分本包文件。

---

## 2. 执行顺序

### Phase 0 — 阅读

读产品逻辑、IDENTITY_TASK_ACL、U22/U23/U24 记录、openclaw-workspace、shell.mjs、documents.py、demo_provider.py、chat_acl.py，以及 U25/U25b/U26 提示词全文。

### Phase 1 — U26（必须先 PASS）

1. 写 `docs/U26_DUAL_LIBRARY_RUNTIME_GATE.md` → 阶段 A 自检通过。
2. 按 U26 全文做阶段 B：双库、三级×三账号矩阵、工具不在库/无权阻断、会话主路径、轨迹与评测入口（复用 U24，不改公式）。
3. 证据：`local-validation/u26-dual-library/<UTC>/`。
4. Gate：`report.json` 为 PASS（或用户接受的有条件 PASS 且不阻断 U25）后才进 Phase 2。

### Phase 2 — U25（含 U25b）

1. 写 `docs/U25_FOUR_ENTRY_WORKSPACE_IA.md` → 自检通过；**继承 U26 双库**：动态权限含资料库+工具库摘要与待审批；能力准入含工具库/复核/准入规则。
2. 四入口 + 唯一账密登录 + 四演示账号；旧深链兼容。
3. 防护设置按 U25b：安全总览（最上，取自原运行防护与审批记录内页）→ 实际防护状态 → 配置与维护；删除「输入防护策略」「运行防护与审批记录」；工具执行=绿色「演示身份」；回复检查=「已启用」。
4. 遵守 docs/codex-prompts/govagentsec-ui-polish.md（沿用青绿值班风；无 Bot skill 目录也不停工）。
5. 验收 U25§4+U25b，并回归 U26 矩阵/阻断不回退。
6. 证据：`local-validation/u25-four-entry-ia/<UTC>/`。

### Phase 3 — 总交付

`local-validation/u26-u25-serial/<UTC>/DELIVERY.md`（或两包 DELIVERY 互链）：顺序、证据路径、约 8 分钟演示路径、配置是否变更。

---

## 3. 冲突裁决

| 主题 | 以谁为准 |
| --- | --- |
| 资料密级、工具阻断、会话九步 | U26 |
| 四入口、唯一登录、演示账密 | U25 |
| 防护设置布局与芯片文案 | U25b |
| 字体/微动效/色板 | docs/codex-prompts/govagentsec-ui-polish.md |
| MCP 可信委托未贯通 | 不伪造桥；受管读文档演示；附录缺口 |

---

## 4. 开工一句

在仓库根目录执行本文件：严格 **U26 阶段A→B→PASS → U25 阶段A→B（含 U25b）→ 总交付**；禁止先改四入口再补双库。
