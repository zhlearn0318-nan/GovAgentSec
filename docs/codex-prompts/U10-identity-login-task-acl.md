# Codex 提示词 U10：业务身份登录 + 任务级最小权限 / 审批

## 0. 角色与总目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2（禁止升级）**。默认不 git push、不外发轨迹到外部 API、不提交真实组织密钥/用户 token。

你要**先设计、后开发**两层能力，服务揭榜演示「政安纵深-权限闸门」：

| 层 | 名称 | 评委应看到什么 |
| --- | --- | --- |
| **L1** | 业务身份 | 登录/选身份 → 展示员工身份（经办/处长/审计）→ 默认角色权限生效；网关登录 ≠ 业务身份 |
| **L2** | 任务 ACL | 某次任务/工具调用只允许与任务相关的文件与工具；无关路径不可见/不可读；权限不够进入审批，通过后才放行（短期 ticket） |

**强制工作顺序**：先完成 **阶段 A 设计文档** 并自检通过，再进入 **阶段 B 实现**。禁止一上来大改代码。

---

## 1. 必读材料（动手前全部读完）

- `docs/OIDC_USAGE.md`
- `docs/OIDC_DEMO_OPTIONS.md`（本包身份源优先 **B3 + 复用 OidcVerifier / Keycloak 半成品**）
- `docs/codex-prompts/U4b-oidc-demo-identity.md`（**优先扩展/落地 U4b，禁止平行造第二套身份**）
- `docs/codex-prompts/U7-behavior-constraint-sota.md`（任务级 privilege contract / provenance / 受管工具面，L2 必须接线）
- `docs/U1-U9-ACCEPTANCE-REPORT.md` 中 **U4 PARTIAL / U7 PARTIAL** 缺口口径
- 现有实现（按实文件接线，勿臆造路径）：
  - `modules/agentguard-group2/identity/oidc.py`（`OidcVerifier`）
  - `modules/agentguard-group2/identity/approver.py`
  - `modules/agentguard-group2/identity/keycloak/` + `run_keycloak_e2e.py`
  - AgentGuard invoke / OPA / tickets / 人工确认 / 禁自批
  - `modules/govagentsec-ui/identity-status.mjs`
  - Protect tool-surface、session-sandbox（U9）；**Aegis 准入沙箱 ≠ 会话沙箱**，文案勿混
  - 已有测试风格：`scripts/test_identity_boundary.py`、`scripts/check_identity.py`、`scripts/test_task_privilege_contract.py`、`scripts/test_param_provenance.py`、`node scripts/test_identity_live.mjs`

---

## 2. 硬约束

1. **不升级 OpenClaw**；不 push；轨迹安全评审默认本地，**轨迹原文不外发**外部 API。
2. **UI 诚实**：演示身份源必须标 **「演示身份源（非生产）」**；**禁止**在演示模式下显示「组织身份已启用 / 组织 OIDC 已启用」，除非真接单位 HTTPS IdP。
3. **默认关闭**危险能力（演示身份源、执行放行）；未开则 fail-closed（与现有 U4 `executionEnabled=false` / `S006_BUSINESS_IDENTITY_DISABLED` 一致）。
4. **复用现有**：OidcVerifier、AgentGuard/OPA/tickets、人工确认、tool-surface、任务 privilege contract、Aegis 准入、session-sandbox。优先扩展 U4b + U7 契约，**不要**平行造第二套身份或第二套闸门。
5. **网关登录 ≠ 业务身份**：UI/文档/回执三处文案必须区分；禁止用网关管理员 token 冒充业务审批。
6. 令牌/角色必须经同一信任边界（`OidcVerifier` 或共享 `subject_from_claims`）；**禁止**请求体自报角色生效。
7. 禁自批：经办不可批自己的单（`D105_SELF_APPROVAL` 或等价原因码）。
8. 不接真实单位 IdP 密钥（可留 `AGENTGUARD_OIDC_*` 配置位与注释）；不重做 U9 沙箱引擎；不自绘假监控大屏；不用假 UI。

---

## 3. 阶段 A — 设计（先写文档，再动大代码）

在仓库写出：

**`docs/IDENTITY_TASK_ACL_DESIGN.md`**

设计文档必须包含（缺一不可）：

1. **架构图**（可用 mermaid）：L1 身份源 → Verifier → subject → UI 徽章；L2 任务 scope → 执行前校验 → DENY/审批 → ticket → 放行；与过程台账的审计点。
2. **L1 / L2 数据流**：claims 字段、会话 Bearer 持有方式、任务 id、允许路径树、允许工具集、审批单、短期 ticket TTL。
3. **与现有模块接线表**：文件/模块 → 职责 → 本包改动（复用 / 扩展 / 新建）。明确：身份走 U4b；任务 ACL 扩展 U7 `test_task_privilege_contract` 一类契约，而非另起炉灶。
4. **UI 草图（文字）**：演示身份源入口、身份徽章、任务绑目录/工具、越权提示、审批待办、处长批准、台账入口。标明「演示身份源（非生产）」。
5. **角色与权限矩阵**（至少）：

| 角色 | 演示用户建议 | 可发起 | 可审批他人 | 可自批 | 默认可碰文件/工具 |
| --- | --- | --- | --- | --- | --- |
| 经办 | office-demo / office-test | 是 | 否 | **否** | 任务 scope 内 |
| 处长 | approver-demo / approver-test（含 `business_approver`） | 视策略 | 是 | 否（批自己的也不行） | 任务 scope + 审批权 |
| 审计 | 可新增 auditor-demo 或复用只读角色 | 否/只读 | 否 | 否 | 只读台账/证据 |

6. **任务 scope 模型**：创建/绑定任务时声明 `task_id`、允许路径前缀/文件树、允许工具集合；运行中只可单调收紧；扩权必须显式审批；执行前校验，越权 **DENY** 并记台账（原因码中文可展示）。
7. **失败与审计点**：无身份、身份不足、越权读文件、自批、伪造 body 角色、演示源关闭后回禁用；审计字段含 `identity_source`（演示标记）、task_id、scope digest、审批回执。
8. **演示脚本（3–5 步）**：经办登录 → 开任务仅绑目录 A → 试图读目录 B 被拒 → 申请审批 → 处长登录批准 → 短期放行 → 台账可查。
9. **工作量切片**（与阶段 B 对齐）与风险（HTTPS/演示 issuer、Windows、误标「组织已启用」等）。

### 阶段 A 自检清单（全部勾选后再进入 B）

- [ ] 设计文档路径正确且已入库（工作区文件）
- [ ] L1 明确复用/扩展 U4b，无第二套身份
- [ ] L2 明确复用/扩展 U7 任务契约 + AgentGuard 票据，无第二套闸门
- [ ] UI 诚实口径写死；网关登录 ≠ 业务身份
- [ ] 演示脚本可在无单位 IdP 环境下讲完
- [ ] 非目标写清（真 IdP、重做 U9、假大屏）

---

## 4. 阶段 B — 实现（按切片；可按仓库现状微调，但验收标准不变）

### 切片 1：演示身份源 UI + 会话身份徽章

- 落地/扩展 U4b：本机可启停演示 issuer（Keycloak realm 或进程内 RS256 JWKS，二选一写清）。
- UI：「演示身份源」选经办/处长/审计 → 建立会话 Bearer；徽章仅「演示身份源（非生产）」。
- 默认关；开启写审计；关闭立即回 U4 禁用态。
- **验收**：未开 → 执行/审批不可用；开启选人后徽章正确；`test_identity_boundary` 不回退。

### 切片 2：claims/角色 → AgentGuard 策略映射

- 经 Verifier 的 subject 驱动 OPA/闸门；禁自批；无身份或身份不足 → `executionEnabled=false` / 服务端 fail-closed。
- 伪造 body 角色 → 401/403；网关管理员 token 不得当业务身份。
- **验收**：经办可发起需审批动作；处长可 resolve；自批拒绝；边界单测绿。

### 切片 3：任务 scope（最小权限 / 无关文件不可见）

- 创建或绑定任务时声明允许文件树与工具集；执行前校验路径与工具。
- 任务外路径：**不可列举为可用 / 读取 DENY**（至少读路径硬拦；列表层尽力隐藏或明确标不可用）。
- 越权 DENY + 台账原因码；契约运行中只可收紧。
- **验收**：绑目录 A 后读 B 稳定失败；`test_task_privilege_contract`（扩展或并列脚本）绿。

### 切片 4：审批流 + 短期 ticket

- 权限不够 → 生成待办；处长审批通过后签发**短期** ticket（TTL、digest 绑定原请求/scope）。
- 经办不可批自己的单；ticket 过期/重放失败。
- **验收**：完整演示路径可手工或脚本跑通；审批与票据测试绿。

### 切片 5：证据与 verify

- 新增/扩展自动化：身份边界、演示身份专项、任务 ACL、审批 ticket；UI live（扩展 `test_identity_live.mjs` 或新增）。
- 证据目录：`local-validation/identity-task-acl/<timestamp>/`（日志、JSON、关键截图：徽章、选人、越权 DENY、审批、放行、关闭后禁用）。
- 更新：`docs/DELIVERY_ACCEPTANCE.md`（用法与诚实口径）、`docs/OIDC_USAGE.md` / `OIDC_DEMO_OPTIONS.md` 状态（U4b/U10 已落地）、`docs/UPGRADE_ROUND_VALIDATION.md` 本包结果。
- 恢复：结束后网关/配置与演示前一致（或提供并执行 restore）。

---

## 5. 非目标（明确不做）

- 不接真实单位 IdP / client_secret（仅留配置位与文档）。
- 不重做 U9 Docker/srt 沙箱引擎与切换。
- 不自绘假监控大屏；不把 `loopback_static_dev` 包装成生产组织身份。
- 不把 U7 未进现网菜单的通知工具强行宣称「已全量上线」（若顺手接入 toolFilter 可记为加分，非本包门禁）。
- 不做完整 CaMeL Dual-LLM 重写。

---

## 6. 验收清单（做完必须跑；失败即未完成）

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'

# A) 原有身份边界不得回退
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_boundary.py

# B) 身份缺口探针（演示源不得被判成「组织已配置完成」）
python scripts\check_identity.py

# C) 任务契约 / provenance（扩展现有或并列新增；须绿）
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_task_privilege_contract.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_param_provenance.py

# D) 本包专项（你需新增或扩展；名称可自定但必须存在且断言如下）
# - 默认关闭：执行/审批仍禁用
# - 开启演示：经办绑目录 A；读 B → DENY；申请审批；处长批准 → 短期放行；自批拒绝；篡改角色失败
# - 徽章含「演示」且不含「组织身份已启用」
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_task_acl.py
# 若拆文件：test_demo_identity.py + test_task_file_acl.py 亦可，但都要在交付说明里列出

# E) UI live
node scripts\test_identity_live.mjs
# 若新增任务 ACL live：node scripts\test_task_acl_live.mjs

# F) 可选：Keycloak 路径
# .\modules\agentguard-group2\.venv\Scripts\python.exe modules\agentguard-group2\identity\run_keycloak_e2e.py
```

**端到端演示路径（必须可讲可证）**

1. 开启演示身份源 → 经办登录/选身份 → 徽章显示「演示身份源（非生产）」  
2. 开任务，仅绑定目录 A（及必要工具集）  
3. 试图读/用目录 B 或未授权工具 → **DENY**，台账可查  
4. 经办申请扩权/审批 → 处长登录批准 → 签发短期 ticket → 仅范围内放行  
5. 经办自批失败；关闭演示源 → 回到禁用；全程无「组织 OIDC 已启用」文案  

期望：相关命令 exit 0；证据在 `local-validation/identity-task-acl/<timestamp>/`；设计文档与实现一致。

---

## 7. 输出物（完成后必须交付）

1. 设计文档：`docs/IDENTITY_TASK_ACL_DESIGN.md`  
2. 改动文件列表（路径 + 一句职责）  
3. verify / 证据：`local-validation/identity-task-acl/<timestamp>/`（含报告 JSON 与关键截图）  
4. 文档更新：`DELIVERY_ACCEPTANCE.md`、OIDC 相关说明状态、本轮 `UPGRADE_ROUND_VALIDATION.md`  
5. **演示话术 ≤ 5 句**（须含：组织未接、当前演示身份源、校验与生产同源、任务最小权限、越权审批）  

---

## 8. 完成定义

- 评委在无组织 IdP 下能看完：**身份分权 + 任务最小权限 + 越权审批** 一条故事。  
- UI/回执/文档三处诚实标「演示」；未宣称组织 OIDC 已完成。  
- U4 默认禁用与相关回归仍 PASS；L2 越权 DENY 稳定可重复。  
- 未升级 OpenClaw、未 push、未外发轨迹、未入库真实密钥。  

**完成后用中文写简短交付说明**（含：设计文档路径、切片完成情况、验收命令结果、证据目录、演示话术、剩余风险）。