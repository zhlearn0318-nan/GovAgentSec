# Codex 提示词 U22：独立登录页 + 当前任务绑定 + 审批主路径 + 清理 UI 工程话术（先设计后开发）

## 0. 角色与目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2**。不 push；轨迹内容不外发；密钥/Bearer 不进 git、不进证据正文。

**你自行完成阶段 A 设计细化，再按本提示词做阶段 B 开发与验收。** 本包是 U21 批判的首个产品实现包，不是又一轮只写文档。

**总目标（发布会主路径打通）**：

```text
单独登录页（演示身份源）
  → 顶栏身份徽章（演示·非生产）
  → 当前任务一键绑定（勿手填 session key）
  → 聊天下指令 → 越权 DENY
  → 同主路径待审批（申请人/审批人切换不断任务上下文）
  → 禁自批；批准后单次放行 / 原会话重试
  → 回原上下文继续；任务详情可见结果与过程
```

同时：**清理产品 UI 上的验收/工程边界话术**（`Uxx PASS`、`PARTIAL`、`本轮验收`、长协议自检清单等）。边界说明只保留在 `docs/ACCEPTANCE_BOUNDARIES.md`（及专项报告），业务界面只用「可用 / 未启用 / 需审批 / 已阻断 / 演示（非生产）」等用户态文案。

**必须正面回应 U21 Top 演示阻碍（至少改善 T01 / T04 / T09 对应呈现）**：

| U21 | 阻碍 | U22 必须怎么改善 |
| --- | --- | --- |
| T01 / B01 | 无独立业务登录；手填 session key 绑聊天 | 独立登录壳 + 当前会话明确绑定，零手填内部 key |
| T04 / B02 | 审批后回原聊天重试割裂、跨页角色切换丢上下文 | 待审批 ↔ 原任务可跟点；授权与执行分态；不强制只靠独立身份台账硬切 |
| T09 | 原生审批在身份台账，未进调用图完整闭环 | **尽量**把关键节点打进轨迹/调用图；若宿主限制进不了图，设计诚实降级 + UI **不说**「一张图已含完整审批闭环」 |
| T02（顺带） | 磁盘现为 srt，冷启动拖垮现场 | 默认会话沙箱**建议**切回 Docker 稳定性；改配置须 U18 备份哈希/可回滚；勿默默留 srt；冷启动用用户可懂文案 |
| T08 / B07 | 首屏验收/工程话术 | 业务 UI 剥离；边界进 ACCEPTANCE_BOUNDARIES |

**产品名**：政安纵深 / GovAgentSec。主导航按办事目标（工作台 / 能力接入 / 待审批 / 任务轨迹），四层名称用于能力说明，不另开技术模块首页。

---

## 1. 硬约束（写死）

1. 不升级 OpenClaw（全程断言 `2026.7.1-2`）；**不 patch** `node_modules/openclaw` 或宿主内核。
2. 不 push；轨迹 JSONL / 公文原文 / Bearer / 密钥不外发、不进证据正文。
3. **fail-closed**：无有效业务 Bearer → 不可执行/不可审批；服务端拒绝；禁止只改前端按钮变绿。
4. **复用** U4b / U10 / U11 / U13 身份与任务 ACL 内核（`demoIdentity` enable/status/login/revoke/disable/bind_session、逐用户委托、任务 scope、禁自批、一次性票据）。**禁止**平行造第二套角色/签发器/JWT/localStorage 持久 Bearer。
5. 网关管理员 token **不得**当业务执行/审批身份。
6. UI 诚实：演示身份源 ≠ 组织 OIDC 已接；禁止「组织登录已启用」假徽章或可点假 SSO；`admission_passed` ≠ 已安装；srt ≠ 完美隔离。
7. **验收边界不进产品文案**：业务 UI 不得出现 `Uxx`、`PASS/FAIL/PARTIAL`、`本轮验收`、工程 checklist 抢首屏。发现即改到文档或管理员折叠区。
8. 禁止伪造：截图须本机真实 UI；验收失败如实记；禁止用旧 `passed:false` 冒充绿证；禁止为顺畅演示放松 ACL、绕过审批、延长票据 TTL、自动续权或自动发布。
9. 改现网 `%USERPROFILE%\.openclaw\openclaw.json`（含会话沙箱 backend）前：**必须**按 U18 备份 + 记 SHA-256；结束可回滚对账。完整含密钥配置不进 git。
10. **U20 usage wrapper 默认不要强行打开**（保持关；本包不依赖逐步 token）。
11. **不重做 U9 双引擎实现**；仅允许按演示稳定性建议切换默认 backend（Docker）并写清回滚，不做新隔离内核。
12. **不接真组织 OIDC**（保留「组织未接入」入口说明即可；真接另包）。

---

## 2. 必读（阶段 A 编码前必须读完并写入设计引用）

1. `docs/JUDGE_USER_FULL_CRITIQUE.md`（Top10、P0 backlog B01/B02/B05/B06/B07、演示阻碍）
2. `docs/PRODUCT_UX_LOGIN_AND_DEMO_FLOW.md`（登录 IA、主路径、与 U4b/U10/U13 衔接——**本包实现基线，细化可实现切片，勿推倒重来**）
3. `docs/ACCEPTANCE_BOUNDARIES.md`（边界只留这里；UI 剥离对照表）
4. `docs/codex-prompts/U21-judge-user-full-critique.md`
5. 身份与 ACL：`docs/OIDC_USAGE.md`、`docs/U12_ORG_OIDC_OR_DEMO_BOUNDARY.md`、`docs/IDENTITY_TASK_ACL_DESIGN.md`、`docs/U10_IDENTITY_TASK_ACL_VALIDATION.md`、`docs/U11_TASK_ACL_FULL_VALIDATION.md`、`docs/U13_PER_USER_EXECUTION_DELEGATE.md`、`docs/U14_JUDGE_CHAT_ACL_REGRESSION.md`
6. UI 实装（先读再改）：`modules/govagentsec-ui/shell.mjs`、`workspace.mjs`、`demo-identity.mjs`、`identity-status.mjs`、`compact-page.mjs`、`access.mjs`、`client.js`、`design.mjs` / `design.css`
7. 闸门/身份后端（只复用）：AgentGuard / identity 相关 `demo_provider`、`chat_acl`、`task_policy`、gateway RPC（以仓库实有路径为准，设计里写死）
8. 配置恢复：`docs/U18_OPENCLAW_CONFIG_RECOVERY_DRILL.md` 与 `scripts/backup_openclaw_config.mjs` 等
9. 会话沙箱：`docs/SESSION_SANDBOX_DEMO.md`（若存在）、U9 相关脚本；当前磁盘多为 `backend=srt`——设计须写清是否切 Docker 及话术
10. 评委路径：`docs/U15_JUDGE_DEMO_REEL_SCRIPT.md`（对齐 5–8 分钟镜头，不强制新拍长视频）

---

## 3. 阶段 A — 设计（先写文档，自检全勾再编码）

写出或更新：

**`docs/U22_LOGIN_TASK_BIND_APPROVAL.md`**

可基于 `PRODUCT_UX_LOGIN_AND_DEMO_FLOW.md` **细化可实现切片**，不要另起冲突 IA。必须包含：

### 3.1 目标切片与非目标

- 本包交付边界（登录 / 绑定 / 审批主路径 / 文案清理 / 可选 Docker 默认）
- 明确非目标：真组织 OIDC、重做 U9、打开 U20、放松 ACL、自动续跑若无既有精确接口

### 3.2 信息架构与嵌入方式

- 独立登录页（或等价首屏壳）线框：网关连接 vs 演示身份登录两层；组织区「未接入」
- 与 OpenClaw 宿主聊天页的嵌入/深链方式（现有 `/plugin?plugin=protect-agent&id=govagentsec&section=...` 兼容策略）
- 登录成功落地工作台；顶栏：当前任务 · 身份徽章 · 退出
- 侧栏目标导航；旧 `section=` 兼容，不造第二套轨迹库

### 3.3 身份与委托生命周期（复用）

- 复用哪些 RPC/方法（enable/status/login/revoke/disable/bind_session 等，据实填写）
- U13 逐用户委托如何在登录壳与工作台常驻；多标签页经办/处长隔离
- 刷新 / 退出 / 全局 disable / 到期语义（服务端为准；禁止静默续权；禁止 localStorage 存 Bearer）

### 3.4 当前任务绑定

- 如何读取宿主**当前选中 session key**（禁止「最近活跃猜测」）
- 「以当前身份开始任务」确认摘要（材料只读范围、数据处理位置）→ `bind_session` + 既有 before_agent_run / 任务 ACL
- 切换聊天不得把旧 scope 授给新会话

### 3.5 审批主路径（对治 T04）

- 申请人申请 → 待审批队列 → 审批人独立上下文登录（不断任务定位）→ 禁自批 → 「批准本次重试」只签授权
- 经办任务卡：「已批准，需在有效期内重试」→ 原会话重试 → 执行回执
- **禁止**把合成面板「批准并执行一次」与原生「批准本次重试」混成含糊「确定」
- D004/D005/角色硬拒绝不显示可批入口
- 默认不新增自动续跑；若做一键精确重试，必须论证既有接口能绑定原动作参数，禁止自然语言拼接冒充

### 3.6 轨迹/调用图诚实策略（对治 T09）

先查仓库：原生聊天审批事件能否写入 `govagentsec-trace`。然后**只选一种**写进设计：

- **优先**：关键审批节点进入图/时间线（事件类型、关联 run/call、哈希链追加）
- **降级**：进不了图时，任务详情相邻展示身份台账审批卡 + 明确文案「审批回执与调用图分屏核对」；**禁止**前端时间排序伪造成因果闭环

### 3.7 UI 工程话术清理清单

对照 `ACCEPTANCE_BOUNDARIES.md` §文案表，列出将改的源码文件/字符串扫描规则（至少覆盖工作台、登录、待审批、身份卡、设置首屏）。必要风险提示（非生产、未启用、已阻断、数据处理位置）**保留**。

### 3.8 演示稳定性（顺带，T02）

- 读当前会话沙箱 backend；若为 srt：是否在本包将**默认**切回 Docker（推荐演示机稳定性）
- 切换步骤：U18 备份 → 改配置 → 重载/重建会话说明 → 哈希对账 → 回滚命令
- 冷启动/引擎未就绪：用户可懂文案（「执行环境准备中，约需 …」），禁止只丢底层 errno
- **不**把切引擎写成「已完成新的隔离能力验收」

### 3.9 风险

至少写：深链越权、自批、多页串身份、bind 错会话、文案过度剥离导致隐瞒风险、Docker 切换影响既有 srt 探针环境、审批进图失败却宣称闭环。

### 3.10 验收命令清单

供阶段 B 原样执行（见 §5）；设计里写死脚本名。

### 阶段 A 自检（全部勾选后再进入阶段 B）

- [ ] `docs/U22_LOGIN_TASK_BIND_APPROVAL.md` 已入库并引用 U21/PRODUCT_UX/真实模块路径
- [ ] 登录两层（网关 vs 演示身份）与「组织未接入」已写
- [ ] 当前会话绑定不手填 key、不猜测关联
- [ ] 审批主路径对治 T04；授权≠执行；禁自批
- [ ] T09 进图或诚实降级已唯一选定
- [ ] 文案清理对照 ACCEPTANCE_BOUNDARIES；验收词不进业务 UI
- [ ] 沙箱默认策略 + U18 备份回滚已写（若本包动配置）
- [ ] 复用 U4b/U10/U13，无第二套身份内核
- [ ] 非目标与风险已写
- [ ] 验收命令清单已写死

---

## 4. 阶段 B — 实现切片（自检通过后；可按仓库微调，但验收断言要写死）

### 切片 1：独立登录页 + 身份徽章

- 实现登录壳（新产品路由/section 或首屏替换，设计定名）：演示身份经办/处长（审批）/审计；管理员启源；进入工作台
- 顶栏常驻：角色 · 演示（非生产）· 剩余有效期（服务端状态）
- 无网关权限不能开源/选人；组织区不可点假登录
- 复用 U13 委托持有；退出走 revoke

### 切片 2：当前任务绑定进入主聊天/工作流

- 工作台「开始任务 / 以当前身份开始」：绑定当前宿主会话，减少设置页深层跳转与手填 `agent:main:...`
- 任务范围条：本任务允许读什么；越权需审批
- 绑定失败（无当前会话/无身份/范围无效）明确中文原因

### 切片 3：审批主路径

- 待审批：待我处理 / 我发起的；卡片信息按 PRODUCT_UX（谁、做什么、材料、越权点、有效期、批准效果）；技术 hash 折叠
- 申请人与审批人切换不断任务定位（深链只带定位 ID，权限仍服务端校验）
- 禁自批；通过后单次放行语义不变（TTL/票据不放宽）
- 按 §3.6 落实进图或诚实降级

### 切片 4：清理 UI 工程话术

- 扫描并清理业务首屏工程词；状态中文化
- 更新/核对 `docs/ACCEPTANCE_BOUNDARIES.md` 仅当边界变化（本包以剥离 UI 为主，不借机扩写夸大能力）

### 切片 5：演示阻碍缓解（配置类）

- 若设计决定默认 Docker：执行备份→切换→记录前后哈希与 `backend`；提供回滚；UI/文档一句「演示默认 Docker，srt 仍可手动切」
- 冷启动提示用户可懂文案
- **不要**默默留 srt 却在讲稿声称已按 Docker 预热

### 切片 6：Ensure / Verify / 证据

证据目录：

`local-validation/u22-login-approval-path/<ISO-UTC>/`

至少包含：

- `design-ref.md` → `docs/U22_LOGIN_TASK_BIND_APPROVAL.md`
- `openclaw-version.txt`（`2026.7.1-2`）
- 登录页 / 工作台徽章 / 任务绑定 / 待审批 /（若有）重试后结果 的**真实截图**
- 若改沙箱：`hash-before.txt` / `hash-after.txt` / `sandbox-backend.json` / `rollback.md`
- verify 日志与 `report.json`（或等价）
- `copy-scan.md`：业务 UI 工程话术扫描结果（应无违规首屏词，或列出已改项）
- `DELIVERY.md` 中文短交付

建议脚本（名称可按仓库风格微调，但须在设计与交付写死）：

- `scripts/verify_u22_login_approval_path.mjs`（或 `.ps1` 包装）
- 回归至少调用既有：`verify_demo_identity` / `verify_per_user_delegate` / `verify_identity_task_acl` / `verify_judge_chat_acl`（以实有为准）

---

## 5. 验收清单（必须全跑）

在仓库根目录（PowerShell）：

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
openclaw --version
# 应为 2026.7.1-2

# 设计已存在
# docs/U22_LOGIN_TASK_BIND_APPROVAL.md

# 身份/委托/任务 ACL 回归（按仓库实有脚本名）
node scripts/verify_demo_identity.mjs
node scripts/verify_per_user_delegate.mjs
node scripts/verify_identity_task_acl.mjs
node scripts/verify_judge_chat_acl.mjs

# 本包专项（须覆盖：登录→绑定→越权→审批→重试主路径；文案扫描；可选沙箱哈希）
node scripts/verify_u22_login_approval_path.mjs
```

**PASS 标准（写死）**：

1. **发布会关键镜头可走通**（合成隔离场景即可）：登录选经办 → 绑定当前任务 → 越权出现待审批 → 处长（另一主体）批准 → 原上下文单次重试/放行语义正确；禁自批仍成立。
2. **对照 U21：T01/T04 必须改善**（不再依赖手填内部 session key；审批↔原任务可跟点）。T09：进图成功或诚实降级文案达标，且 UI 不宣称假闭环。
3. 业务首屏无验收工程话术；「演示（非生产）」保留。
4. 未升级 OpenClaw、未 patch 内核、未 push、未打开 U20（除非用户另行要求且记录）、未放松 TTL/ACL。
5. 若改了 `openclaw.json`：有备份、哈希对账、回滚说明；默认策略与证据一致。
6. 证据目录齐全；真实截图；`DELIVERY.md` 含剩余风险。

**PARTIAL 允许**：浏览器自动化截图工具不稳定时，须人工截图补齐关键镜头，并在报告标明；不得用旧图冒充本轮。

---

## 6. 非目标（本包不做）

1. 真组织 OIDC / 单位 IdP 联调（U12 边界维持「未接入」）
2. 重做 U9 双引擎或宣称新的隔离能力验收
3. 默认打开 U20 usage wrapper
4. 护栏误报大修（U21 B03 → 另包 U23）
5. 跨台账审批↔trace 的完整可靠桥接若超本包（可降级；完整桥接可列 U24，但本包不得假装已完成）
6. 生产发布 / 候选自动安装 / 真实外发通知

---

## 7. 交付格式（完成后中文简短说明）

1. 阶段 A 设计路径与自检结果  
2. 实现切片摘要与改动文件列表  
3. 主路径是否跑通（登录→绑定→审批→重试）及对 U21 T01/T04/T09 的改善说明  
4. 文案清理结果；沙箱是否切换及哈希  
5. 证据目录路径  
6. 验收命令与 exit code  
7. **剩余风险**（冷启动、误报、进图降级、组织未接、多页委托等）

禁止：升级 OpenClaw、patch 内核、push、伪造截图/usage/审批节点、第二套身份内核、把验收边界写回产品首页、为演示放松安全语义。