# Codex 提示词 U14：评委路径回归 — 聊天越权→审批→单次放行

## 0. 角色与目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2**。不 push；轨迹不外发。

**缺口（项 3）**：U11 将任务 ACL 扩到聊天自动 scope + 原生工具后，易误伤演示。需要**固定一条评委可重复走的路径**并留下**新时间戳证据**：

> 聊天任务自动带最小 scope → 越权读/用 → DENY（底层读次数不增）→ 另一审批人批准 → **单次**放行 → 重放拒绝；自批拒绝。

本包以**验收/固化脚本 + 演示路径设计**为主；若 U11 未 PASS，先阻塞并写明。允许先写「评委路径设计」再补 `verify` 脚本。

**依赖**：U11（全量 ACL）必须已绿；建议 U13（逐用户委托）已完成，以便处长/经办切换可演示。若 U13 未完，可用 U10 演示选人，但须在报告注明委托边界。

---

## 1. 硬约束

1. 不升级；不 push；轨迹不外发。
2. 复用 U10/U11 内核（scope digest、单调收紧、一次性 ticket、禁自批、provenance）；禁止第二套策略。
3. 默认不改产品行为，除非回归失败必须修——修时最小改动并回归 U10/U11。
4. 证据必须新时间戳；**禁止**复用旧 `passed:false` 或过期截图充当本包绿证。
5. UI 诚实：演示身份源标注不变；不宣称组织 OIDC 已接。
6. 审计脱敏：无 Bearer/HMAC/正文入库证据包。

---

## 2. 阶段 A — 设计

写出：

**`docs/U14_JUDGE_CHAT_ACL_REGRESSION.md`**

必须包含：

1. **评委 5 分钟路径**（逐步：点哪里、期望回执/原因码、截哪几张图）。
2. **前置**：网关版本、演示源、U7b 通知工具是否在列表、U11 verify 命令。
3. **断言表**（至少）：

| ID | 意图 |
| --- | --- |
| chat-scope | 聊天/会话路径产生 task_id + scope_digest |
| deny-out-of-scope | 越权 DENY，read_count 不增加 |
| approve-once | 另一人批准后同动作仅成功一次 |
| replay-reject | 重放/二次核销拒绝 |
| self-approve-deny | 自批拒绝 |
| honest-badge | 徽章含「演示」且不含「组织身份已启用」 |

4. **失败时排查顺序**：scope 未绑 → 委托缺失 → 工具未受管 → 沙箱桥 → 配置被改。
5. **与手工面板路径差异**：面板调试入口可保留，但评委主路径必须是聊天链路（U11 目标）。

### 阶段 A 自检

- [ ] 评委路径可在无单位 IdP 下走完
- [ ] 断言表与 U10/U11 同级严格
- [ ] 写明依赖 U11（及可选 U13）
- [ ] 证据目录命名与禁止旧绿证规则已写

---

## 3. 阶段 B — 实现 / 固化

### 切片 1：固化 verify 脚本

- 扩展 `scripts/verify_identity_task_acl_full.mjs` **或** 新建 `scripts/verify_judge_chat_acl.mjs`。
- 一键跑完断言表；失败非零退出；写出 JSON 报告。

### 切片 2：真实 UI 证据

- 关键步骤真实截图（聊天越权回执、审批队列、单次放行、重放失败、徽章）。
- 可选短屏录制检查清单（若仓库已有录制驱动可复用 `F:\揭榜挂帅\评委演示素材\录制素材\` 下既有 driver；**不强制**新增长视频）。

### 切片 3：回归门禁挂钩（可选加分）

- 在文档中写明：正式演示前必跑本包脚本 + `node scripts/verify_identity_task_acl.mjs`。
- 不强制改 `Verify-ZhengAn.ps1`；若改，须说明新增项且不得削弱原 15 项。

证据目录：`local-validation/u14-judge-chat-acl/<ISO-UTC>/`  
另建议同步副本要点到 `F:\揭榜挂帅\评委演示素材\验收与证据\u14-judge-chat-acl-<stamp>\`（只拷绿证与截图，不含秘密）。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
# 前置
node scripts\check_notify_tools_live.mjs
node scripts\verify_identity_task_acl.mjs
# 若存在 U11 full：
# node scripts\verify_identity_task_acl_full.mjs
# 本包：
node scripts\verify_judge_chat_acl.mjs
```

---

## 4. 非目标

- 不接组织 OIDC；不重做双沙箱；不扩展到一切未受管旁路并宣称「全覆盖」。
- 不使用历史失败 JSON 打扮成通过。

---

## 5. 完成后中文简短交付说明

评委路径摘要、脚本名、证据目录、是否修了产品代码、U10/U11 是否仍绿、演示一句。
