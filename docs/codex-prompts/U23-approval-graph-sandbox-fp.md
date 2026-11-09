# Codex 提示词 U23：审批进图/同屏关联 + Docker 默认稳演示 + 输入防护误报（先设计后开发）

## 0. 角色与目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2**。不 push；轨迹内容不外发；密钥/Bearer 不进 git、不进证据正文。

**你自行完成阶段 A 设计细化，再按本提示词做阶段 B 开发与验收。** 本包承接 U22 交付剩余边界与 U21 演示阻碍，不是再写一轮空文档。

**总目标（发布会稳定性三件套）**：

```text
1) 审批闭环可见：原生审批尽量进入轨迹/调用图；
   若不能完整进图，则同屏强关联（任务详情相邻/深链定位），
   禁止「一张图已含完整审批闭环」假话术。
2) 沙箱演示稳：默认留在 Docker；srt 可切但必须有冷启动/耗时用户可懂提示；
   禁止默默切 srt、禁止把慢等待一律归咎于模型。
3) 输入防护误报降：演示主路径正常政务材料少误杀；
   真注入/越权合成仍可拦；边界诚实写入 ACCEPTANCE_BOUNDARIES，不进业务首页工程话术。
```

**必须正面回应**：

| 来源 | 问题 | U23 必须怎么改善 |
| --- | --- | --- |
| U22 剩余 #2 / U21 T09 | 原生审批在身份台账，调用图无审批节点；U22 采用分屏降级 | **优先**把关键审批事件追加进 `govagentsec-trace` 哈希链并进图/时间线；若宿主限制无法可靠进图，保留/强化同屏关联并**明确文案**，禁止时间排序伪因果 |
| U22 剩余 #3 / U21 T02 | srt 冷启动可拖垮现场（曾有 >300s 级读）；Docker 较快 | 演示默认 **Docker**；srt 切换入口保留但强制提示「冷启动/首次可能很慢」；勿默默改 backend |
| U21 T03 / B03 | 正常政企/台风等材料被政治敏感等分类误报停机 | 降低**演示主路径误杀**：补正常材料对照 + 真攻击对照；可调规则/阈值/白名单**仅限可论证的误分类**，禁止为绿证关掉真注入防护 |
| U12 边界 | 真组织 OIDC | **非目标**；只可留 runbook 指针到 U12/ACCEPTANCE_BOUNDARIES |

**产品名**：政安纵深 / GovAgentSec。复用 U22 登录→绑任务→审批→重试主路径，不推倒 IA。

---

## 1. 硬约束（写死）

1. 不升级 OpenClaw（全程断言 `2026.7.1-2`）；**不 patch** `node_modules/openclaw` 或宿主内核。
2. 不 push；轨迹 JSONL / 公文原文 / Bearer / 密钥不外发、不进证据正文。
3. **fail-closed**：无有效业务 Bearer → 不可执行/不可审批；服务端拒绝；禁止只改前端变绿。
4. **复用** U4b / U10 / U11 / U13 / U22 身份与任务 ACL、登录与审批主路径。**禁止**平行造第二套审批台账或假审批节点。
5. 轨迹是**哈希追加链**：禁止改写已落盘历史事件冒充审批节点；新增须追加真实事件（或可信注解）并保持链校验。
6. **禁止伪造**：禁止时间排序画因果边冒充审批进图；禁止伪造 usage/审批；截图须本机真实 UI；验收失败如实记。
7. 改 `%USERPROFILE%\.openclaw\openclaw.json`（含 `agents.defaults.sandbox.backend`）前：**必须**按 U18 备份 + 记 SHA-256；结束可回滚对账。完整含密钥配置不进 git。
8. **演示默认 Docker**：不得在未提示情况下把默认切到 srt；若用户/脚本切 srt，UI 与文档须有冷启动/耗时提示。
9. **不重做 U9** 双引擎内核；不宣称新的 OS 隔离能力验收。Aegis 准入沙箱 ≠ U9 会话 Docker/srt（勿混名）。
10. **U20 usage wrapper 默认保持关闭**（本包不依赖逐步 token）。
11. **不接真组织 OIDC**（只可指针到 `docs/U12_ORG_OIDC_OR_DEMO_BOUNDARY.md` / ACCEPTANCE_BOUNDARIES）。
12. 输入防护调参：**禁止**为演示关闭整条输入链或把真注入改成 always-allow；须保留至少一组合成攻击仍 BLOCK + 停止回执。
13. 业务 UI 不写验收工程话术（`Uxx`/`PASS`/`本轮验收`）；边界进 `docs/ACCEPTANCE_BOUNDARIES.md`。

---

## 2. 必读（阶段 A 编码前必须读完并写入设计引用）

1. `docs/U22_LOGIN_TASK_BIND_APPROVAL.md` 与 `local-validation/u22-login-approval-path/2026-11-08T11-46-08-529Z/DELIVERY.md`、`report.json`（剩余风险：审批未进图、srt 延迟、误报→U23）
2. `docs/JUDGE_USER_FULL_CRITIQUE.md`（T02/T03/T09、B03、镜头红线）
3. `docs/ACCEPTANCE_BOUNDARIES.md`、`docs/PRODUCT_UX_LOGIN_AND_DEMO_FLOW.md`
4. 轨迹：`modules/govagentsec-trace/register.mjs`、`view-model.mjs`、`view.mjs`、`store.mjs`；`docs/TRACE_CALL_GRAPH_VALIDATION.md`、`docs/TRACE_IMPLEMENTATION_PLAN.md`
5. 身份审批台账：AgentGuard / identity 相关 `chat_acl`、审批请求/票据、`identity-audit.jsonl`（以仓库实有路径为准，设计写死）
6. UI：`modules/govagentsec-ui/workspace.mjs`、`task-context.mjs`、`shell.mjs`、审批回执相邻展示相关代码（U22 落地处）
7. 会话沙箱：`docs/SESSION_SANDBOX_DEMO.md`、`docs/SESSION_SANDBOX_PLAN.md`、`modules/session-sandbox/`、`scripts/setup_session_sandbox.mjs`、`scripts/test_session_sandbox_*.mjs`；U18 备份/恢复脚本
8. 输入防护：`modules/protect-agent-group1/智能体安全/`（尤其 `tasks/false-positive-optimization-plan.md`、插件 `guard-events.mjs` / `result-gate.mjs` / `register.mjs`）、`scripts/test_protection_*.mjs`、`docs/demo/03-PROTECT-AGENT.md`
9. U9 / U18 提示词与设计（切 backend 的既有口径）
10. 评委镜头：`docs/U15_JUDGE_DEMO_REEL_SCRIPT.md`（对齐，不强制新拍长视频）

---

## 3. 阶段 A — 设计（先写文档，自检全勾再编码）

写出：

**`docs/U23_APPROVAL_GRAPH_SANDBOX_FP.md`**

必须包含：

### 3.1 目标切片与非目标

- 本包三切片：审批→轨迹图（或同屏强关联）、Docker 默认 + srt 提示、输入误报调参与回归
- 非目标：真 OIDC、重做 U9、打开 U20、放松 ACL/TTL、自动续跑、patch 内核、宣称「完美隔离」或「一张图假闭环」

### 3.2 审批事件进轨迹/调用图（对治 T09）

先只读摸清：

- 原生审批落点（identity-audit / RPC / UI 状态）
- `govagentsec-trace` 现有事件类型（含既有 `approval.observed` 若存在）与哈希链追加 API
- U22 为何选「相邻降级」；本包如何在**不改历史 JSONL**前提下升级

然后**唯一选定**一种主方案写死（可带明确降级条件）：

- **优先 A**：在批准/拒绝/申请的可信服务端路径追加 trace 事件（类型、关联 `session_key`/`run_id`/`request_id`/`toolCallId` 若有、角色去敏、结果），view-model 进图与时间线；链校验 PASS
- **可接受 B**：若无法从服务端可靠注入，则「同屏强关联」：任务详情固定并排「审批回执卡 + 调用图」，深链 `request_id` 定位，文案「审批回执与调用图同屏核对；原生审批事件未写入哈希链」；**禁止**前端伪造节点
- **禁止 C**：把无关 MCP 回执或时间邻近事件标成审批闭环

须写清：谁写事件、失败时 UI 文案、评委怎么讲。

### 3.3 Docker 默认与 srt 冷启动提示（对治 T02）

- 读当前磁盘 `agents.defaults.sandbox.backend`；U22 已切 Docker 则**保持**；若被改回 srt，设计恢复 Docker 的 U18 步骤
- UI/防护设置：显示当前引擎；切到 srt 前确认框：「首次/冷启动可能数十秒至数分钟，可能超过业务委托期限」
- 运行中若探测到引擎未就绪/超时：用户可懂文案（「执行环境准备中…」），禁止只丢 errno；讲稿禁止把 srt 等待说成模型慢
- 不把「默认 Docker」写成新隔离能力验收

### 3.4 输入防护误报（对治 T03/B03）

- 复盘 U14/U21 提及的误报样本（政企合成说明、台风/Word 等正常材料）与真注入样本
- 调参原则：缩小**误分类面**（阈值/类别阈值/演示白名单/规则例外），**不得**关闭整链或让已知注入 PASS
- 回归矩阵至少：
  - N≥3 正常演示主路径材料 → 不应停机（或可配置为 warn-only 且 UI 诚实）
  - N≥2 合成注入/越权提示 → 仍 BLOCK + 有停止回执（工具未继续）
- 边界写入 `ACCEPTANCE_BOUNDARIES.md`：不保证全类别零误报；流式前置阻断边界如实
- 参考既有 `false-positive-optimization-plan.md`，能复用则复用，勿另起冲突策略

### 3.5 与四层映射（评委口径）

| 用户说法 | 本包触点 |
| --- | --- |
| 风险识别 | 输入防护误报调参 + 真攻击仍拦 |
| 行为约束 | 审批可见性（图或同屏）；ACL 不放松 |
| 组件准入 | 不混 Aegis；本包不改准入内核 |
| 评测审计 | 轨迹图/链展示审批关联；Docker/srt 诚实 |

### 3.6 风险

至少写：假审批节点、哈希链断裂、误报调参导致真注入漏过、默默切 srt、超时仍不提示、OIDC 话术回潮、与 U22 分屏文案冲突未更新。

### 3.7 验收命令清单

供阶段 B 原样执行（见 §5）；设计里写死脚本名。

### 阶段 A 自检（全部勾选后再进入阶段 B）

- [ ] `docs/U23_APPROVAL_GRAPH_SANDBOX_FP.md` 已入库并引用 U22 DELIVERY / U21 Top / 真实模块路径
- [ ] 审批进图方案 A 或同屏强关联 B **唯一选定**；禁止假闭环话术已写
- [ ] Docker 默认策略 + srt 提示 + U18 备份回滚已写
- [ ] 误报调参原则 + 正常/攻击回归矩阵已写；不关整链
- [ ] 非目标含真 OIDC；仅 runbook 指针
- [ ] 风险与验收命令已写死
- [ ] 不 patch 内核、不推倒 U22 IA、U20 默认关

---

## 4. 阶段 B — 实现切片（自检通过后）

### 切片 1：审批事件进轨迹图 / 同屏关联

- 按 §3.2 实现 A 或强化 B
- 若 A：申请/批准/拒绝至少一类关键节点可见于图或时间线；事件可点开看关联 ID；`store`/链校验通过
- 若 B：同屏布局稳定；文案与 ACCEPTANCE_BOUNDARIES 一致；UI **不得**出现「完整审批已在调用图闭环」
- 更新 U22 任务详情若仍写「仅分屏」——与最终方案对齐
- 回归：U22 主路径登录→绑定→越权→审批→重试仍 PASS；禁自批仍成立

### 切片 2：Docker 默认与 srt 提示

- 确认/恢复演示默认 `backend=docker`（若需改配置：U18 备份→改→哈希→重载说明→rollback.md）
- 设置/工作台展示当前引擎；切 srt 确认框 + 冷启动文案
- 可选：探测未就绪时禁用高风险镜头按钮或给出「请等待环境就绪」
- 证据记录前后哈希与 `sandbox-backend.json`

### 切片 3：输入误报调参 + 回归

- 按设计调 Protect/输入链配置或规则（路径写进 DELIVERY）
- 跑正常材料 vs 攻击材料对照；保存停止回执/放行证据
- 更新 `docs/ACCEPTANCE_BOUNDARIES.md` 仅补充本包边界（勿夸大）
- **不要**把误报样本删掉装成从未发生；失败对照留在证据目录

### 切片 4：Ensure / Verify / 证据

证据目录：

`local-validation/u23-approval-graph-sandbox-fp/<ISO-UTC>/`

至少包含：

- `design-ref.md` → `docs/U23_APPROVAL_GRAPH_SANDBOX_FP.md`
- `openclaw-version.txt`（`2026.7.1-2`）
- 审批图或同屏关联真实截图；Docker/srt 提示截图；误报对照（正常放行 + 攻击阻断）截图或日志
- 若改沙箱：`hash-before.txt` / `hash-after.txt` / `sandbox-backend.json` / `rollback.md`
- 若进图：含审批事件的 trace 片段（去敏）+ 链校验日志
- `fp-matrix.md`：正常/攻击用例与结果
- `report.json`（或等价）与 `DELIVERY.md` 中文短交付

建议脚本（名称可按仓库风格微调，但须在设计与交付写死）：

- `scripts/verify_u23_approval_graph_sandbox_fp.mjs`
- 回归至少：`verify_u22_login_approval_path.mjs`、`verify_judge_chat_acl.mjs`、既有 `test_protection_*.mjs` / sandbox 探针（以实有为准）

---

## 5. 验收清单（必须全跑）

在仓库根目录（PowerShell）：

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
openclaw --version
# 应为 2026.7.1-2

# 设计已存在
# docs/U23_APPROVAL_GRAPH_SANDBOX_FP.md

# 回归（按仓库实有）
node scripts/verify_u22_login_approval_path.mjs
node scripts/verify_judge_chat_acl.mjs
node scripts/verify_demo_identity.mjs

# 本包专项
node scripts/verify_u23_approval_graph_sandbox_fp.mjs
```

**PASS 标准（写死）**：

1. **T09**：方案 A 下图/时间线可见真实审批关联事件且链校验过；或方案 B 同屏强关联 + 诚实文案，且产品 UI 无假闭环话术。
2. **T02**：演示默认 backend 为 Docker（证据与磁盘一致）；srt 可切但有冷启动/耗时提示；无默默切 srt。
3. **T03/B03**：fp-matrix 中正常主路径材料不再被误杀停机（或 warn-only 且诚实）；至少 2 个合成攻击仍 BLOCK 且有停止回执。
4. U22 主路径与禁自批不回归；未放松 TTL/ACL。
5. 未升级 OpenClaw、未 patch 内核、未 push、U20 保持关、未接真 OIDC。
6. 若改 `openclaw.json`：有备份、哈希对账、回滚说明。
7. 证据目录齐全；真实截图；`DELIVERY.md` 含剩余风险；ACCEPTANCE_BOUNDARIES 已更新边界（若有变）。

**PARTIAL 允许**：浏览器截图工具不稳时人工补关键镜头并标明；不得用旧图冒充本轮。进图若仅部分事件类型可桥接，须在报告列明覆盖表，未覆盖者走同屏文案。

---

## 6. 非目标（本包不做）

1. 真组织 OIDC / 单位 IdP（仅 runbook 指针）
2. 重做 U9 或新隔离内核验收
3. 默认打开 U20
4. 为演示关闭输入防护整链或放宽任务 ACL/审批 TTL
5. patch OpenClaw 内核以「硬塞」钩子
6. 生产发布 / 自动安装候选 / 真实外发通知
7. 推倒 U22 登录/绑定 IA 重做

---

## 7. 交付格式（完成后中文简短说明）

1. 阶段 A 设计路径与自检结果  
2. 审批方案选 A 还是 B，及评委一句讲法  
3. Docker/srt 状态、是否改配置及哈希  
4. 误报矩阵摘要（正常 vs 攻击）  
5. 证据目录路径  
6. 验收命令与 exit code  
7. **剩余风险**（未覆盖的审批事件类型、srt 仍可用时的超时、误报残留类别、OIDC 未接等）

禁止：升级 OpenClaw、patch 内核、push、伪造审批节点/截图、默默切 srt、为绿证关掉真注入防护、把验收边界写回产品首页。
