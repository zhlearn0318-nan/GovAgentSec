# OIDC 演示与补齐选项（U4 缺口）

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

**当前默认：仅演示；组织未接。** 本文比较表为历史方案背景，不代表现行缺口；U13 已补演示逐用户委托与撤销，原 HTTP 管理入口仍拒绝无委托执行。现行强制口径和组织 runbook 以 [U12](U12_ORG_OIDC_OR_DEMO_BOUNDARY.md) 为准，委托见 [U13](U13_PER_USER_EXECUTION_DELEGATE.md)。

**2026-11-08 当前状态：B3 已在 U4b 落地，U10 已扩展审计角色和任务目录 ACL。** 下文 A/B/C 保留方案比较背景；现行操作以 [OIDC_USAGE.md](OIDC_USAGE.md) 为准。真实组织身份仍未接。U10 验收见 [U10_IDENTITY_TASK_ACL_VALIDATION.md](U10_IDENTITY_TASK_ACL_VALIDATION.md)。

> 背景：`docs/U1-U9-ACCEPTANCE-REPORT.md` 综合结论为「需补强」；U4 判为 **PARTIAL**。  
> 硬事实：身份边界守卫与徽章已落地并通过测试；**组织 OIDC 未接**；管理页 **无逐用户 OIDC 委托**，故执行/审批在 UI 层仍禁用。  
> 约束：OpenClaw 锁定 **2026.7.1-2**；本文默认只谈方案与提示词，不直接改产品代码。

## 现状摘要（盘点结论）

| 项 | 现状 |
| --- | --- |
| 产品守卫 | `modules/govagentsec-ui/identity-status.mjs`：未配置 / 演示非生产 / OIDC 就绪 / 未就绪四态徽章；`requireBusinessDelegation()` 固定抛错；徽章路径上 `executionEnabled` 恒为 false |
| 服务默认 | `ServiceConfig.oidc_enabled=False`、`allow_development_identity=False`；无 OIDC 时 invoke/审批 fail-closed（`S006_BUSINESS_IDENTITY_DISABLED`） |
| 校验内核 | `modules/agentguard-group2/identity/oidc.py` 已有完整 `OidcVerifier`：discovery/JWKS、签名、iss/aud/exp、scope/resource、角色/部门/密级/MFA → OPA subject；`identity_source=oidc_verified_jwt` |
| 服务接线 | `service/app.py` `_build_verifier()` 在 `oidc_enabled` 时构造 verifier，且 **硬编码 `require_https=True, reject_redirects=True`** |
| 配置探针 | `scripts/check_identity.py`：查 `AGENTGUARD_OIDC_*`、MCP `oidc` 模式与令牌注入通道；只报缺口，不把「填了字段」当成已验证 |
| 本机 Keycloak 半成品 | `identity/keycloak/agentguard-realm.json`（realm=`agentguard`，client=`agentguard`，用户 office-test / finance-test / approver-test）；`identity/run_keycloak_e2e.py` 已能对 HTTP Keycloak 做 JWT 真签验与不可伪造主体 |
| 验收口径 | U4 单测与 live UI 守卫 **PASS**；缺口是「生产组织身份 + 逐用户委托」未交付。报告 P1：取得 issuer/audience/角色映射约 1–3 人日，**另需等待组织 IdP** |
| OpenClaw | 仓库内集成文档要求 MCP 推荐 `AGENTGUARD_MCP_IDENTITY_MODE=oidc` + 令牌文件；`loopback_static_dev` 仅本机；**不建议/不依赖升级** OpenClaw |

验收报告原文要点：

- 「U4 生产身份与 U7 现网新增工具接入仍为 PARTIAL」
- 「无组织 OIDC 不宣称生产身份完成」
- 「可以按合成数据、非生产身份、候选未发布的口径演示核心链路」

---

## A. 真接组织 OIDC（生产向）

### 前置条件

1. **IdP**：单位 Azure AD / 国产 IAM / Keycloak 联邦 / 自建 OpenID Provider；必须提供 **HTTPS** issuer（产品路径强制 HTTPS、拒重定向）。
2. **应用注册**：`client_id`（建议 `agentguard` 或单位约定名）、如需 confidential 则 `client_secret` 或证书；**redirect URI** 若走浏览器登录；资源服务器 audience。
3. **Scopes / Claims**：至少 `openid`；令牌须带：
   - 标准：`sub`、`iss`、`aud`、`exp`、`iat`
   - 业务：`department`、`clearance`（0–3）、角色（`realm_access.roles` 或 `resource_access.<client>.roles`，审批人含 `business_approver`）
   - MFA：`amr` 含 `mfa`/`otp` 或 `mfa=true`（默认 `oidc_require_mfa=True`）
4. **环境变量**（见 `docs/DELIVERY_ACCEPTANCE.md`）：
   - `AGENTGUARD_OIDC_ENABLED=true`
   - `AGENTGUARD_OIDC_ISSUER=https://…`
   - `AGENTGUARD_OIDC_AUDIENCE=…`
   - MCP：`AGENTGUARD_MCP_IDENTITY_MODE=oidc` + 每用户短期 token 安全注入（文件/委托），**禁止**用网关管理员 token 冒充业务身份
5. **验收**：真实用户与审批人分账号验签名/iss/aud/角色/MFA/不可自批；`python scripts/check_identity.py` 仅作缺口清单。

### 与现有闸门的对接点

```
组织 IdP 发 JWT
  → OidcVerifier.verify_token / subject_from_claims
  → AgentGuardService.invoke / resolve_approval_authenticated
  → OPA 权限闸门 + 人工确认（business_approver，禁自批）
  → 审计回执（identity_source=oidc_verified_jwt）
```

MCP 侧：`integrations/.../auth.py` 已复用同一 `OidcVerifier`，经 `invoke_verified` 传入已验证 subject。

**仍缺的产品面**：管理 UI **逐用户 OIDC 委托**（当前 `identity-status.mjs` 明确「尚无逐用户 OIDC 委托」）。即便服务端 OIDC 就绪，工作台执行/审批按钮仍不会仅因徽章变绿而放开——必须补「登录/选人 → 持有该用户 Bearer → 再调 evaluate/approve」的委托链。

### 工作量与风险（诚实）

| 项 | 估计 |
| --- | --- |
| 有现成 IdP 与测试账号时，接线 + 声明映射 + 双人验收 | 约 1–3 人日（与总验收报告一致） |
| 等待单位开 client、声明定制、MFA、网络放行 | **不可控**，常按周计 |
| UI 逐用户委托（浏览器登录或设备码 + token 注入） | 额外约 2–5 人日 |
| 风险 | 密钥入库、回调被拦、Windows 本机无公网 HTTPS、声明缺 MFA/部门导致全拒绝、误把网关登录当业务身份 |

### 是否适合揭榜演示时间线

**不适合作为「下周可演」的主路径。**  
依赖单位 IdP 与合规审批；即使服务端一天内可通，UI 委托与双人 MFA 账号仍可能卡住。真接应标为「交付/试点里程碑」，演示故事用 B 方案。

---

## B. 演示级模拟（优先）

原则：**可以演示「身份 → 角色 → 闸门 → 人工确认」闭环；绝不能口头或 UI 伪装成「已接真实组织 IdP」。**  
徽章/文案必须出现「演示身份源」或「本机演示 IdP」，验收口径继续写「非生产身份」。

### B1. 配置 / 文档级（最浅）

| 维度 | 内容 |
| --- | --- |
| 做什么 | 维持现状守卫；准备演示账号表（处长/经办/审计角色说明）；状态条继续「未配置组织身份」或「演示身份（非生产）」；讲稿写清「OIDC 校验内核已就绪，组织 IdP 待接」 |
| 评委能看到 | 红/黄徽章、执行禁用、`check_identity.py` 缺口列表、DELIVERY 配置表 |
| 诚实边界 | **不能**演示「经办发起 → 处长 OIDC 审批通过」的放行路径；只能演示拒止与边界 |
| 实现要点 | 几乎零开发；更新讲稿与账号表即可 |
| 工作量 | 0.5 人日 |
| 评价 | 已基本具备；**不够**讲清权限闸门「人」的一端 |

### B2. 本地 Mock IdP（Keycloak / mock-oauth2-server）

| 维度 | 内容 |
| --- | --- |
| 做什么 | 起本机 Keycloak（已有 `agentguard-realm.json`）或 mock-oauth2-server；用**同一** `OidcVerifier` 验真 JWT；跑通 `run_keycloak_e2e.py` 级检查；可选给 UI 提供「取演示 token」运维脚本 |
| 评委能看到 | 真实 JWKS 签名校验；伪造主体被拒；审批人 token 才能批；报告里曾有 Keycloak 26.x E2E 叙述可复现 |
| 诚实边界 | 必须标明「本机开发域 / 演示 IdP」；**不是**单位目录；无真实 MFA 硬件时须说明测试域放宽或模拟 amr |
| 实现要点 | ① Docker/便携 Keycloak + realm 导入 ② **HTTPS**：产品 `_build_verifier` 强制 HTTPS——需 mkcert/本地证书反代，或显式「仅演示」开关允许 HTTP issuer（默认关、写审计、UI 标红） ③ MCP/测试用 token 文件注入 ④ UI 委托仍缺则执行按钮仍可能禁用——需与 B3 或最小「粘贴 Bearer」运维页配合 |
| 工作量 | 2–4 人日（含 HTTPS 与脚本）；若再做 UI 登录则 +2–3 人日 |
| 评价 | 技术可信度高；与现有半成品最贴；Windows 上 Docker+证书有摩擦 |

### B3. 产品内 Demo Identity Provider（推荐主路径）

| 维度 | 内容 |
| --- | --- |
| 做什么 | 内置「演示身份源」：UI 明确下拉选择演示用户（如：经办 `office-demo` / 财务 `finance-demo` / 处长审批 `approver-demo`）；签发**仅本机有效**的演示 JWT 或等价已验证 subject；**强制走与真 OIDC 相同的 claims→角色→OPA→人工确认路径**（复用 `subject_from_claims` 或同一 verifier 配置指向演示 issuer） |
| 评委能看到 | 徽章「演示身份源（非生产）」；切换用户后权限变化（经办不可批、处长可批、禁自批）；越权/伪造 body 角色仍失败；全程审计带 `identity_source` 演示标记 |
| 诚实边界 | UI/回执/文档三处标注「演示」；默认关闭；开启写审计；**禁止**出现「组织身份已启用」绿态；禁止入库真实组织密钥 |
| 实现要点 | ① 演示 JWKS/issuer（可用本机 HTTPS 或进程内 RS256） ② 三用户固定 claims（部门/密级/角色/MFA） ③ UI：选择用户 → 会话持有演示 Bearer → 放开执行/审批控件（仅演示模式） ④ 关闭演示模式立即回到 U4 禁用态 ⑤ 扩展 `test_identity_boundary.py` + live 面板测试 |
| 工作量 | 3–5 人日（含 UI 委托最小集与测试） |
| 评价 | **最贴揭榜「可演示」**：不依赖单位 IdP，故事完整，诚实可审计 |

### B4. 半成品上的最小补齐路径

已有积木：`OidcVerifier`、`OidcApproverAuthenticator`、Keycloak realm、E2E、MCP auth、UI 徽章。

**最小可演路径（建议 = B2 证书化 + B3 UI 选人）：**

1. 脚本一键起 Keycloak（或内嵌演示 issuer）+ 导入 realm。  
2. 演示专用配置：`oidc_enabled=true`，issuer 指向演示源；UI 态机新增 `demo_idp`（**不要**映射成「组织身份已启用」）。  
3. 管理页「演示身份源」选人 → 取得 access_token → 按 MCP/API 既有 Bearer 路径调用 evaluate / approvals。  
4. 保留现网默认：未开演示则一切仍禁用。  
5. 文档与验收清单写死诚实口径。

---

## C. 建议（揭榜「可演示」）

**推荐：做 B3（产品内演示身份源），实现上尽量复用 B2/已有 Keycloak 与 `OidcVerifier`（即 B4 最小路径）。**

理由：

1. 真接组织 OIDC（A）受 IdP 与合规卡住，不适合作为演示主线。  
2. 仅 B1 无法演示「人」在闸门中的角色差异与人工确认。  
3. 校验与审批内核已经写好，缺的是**可切换的演示主体 + UI 委托**，不是从零写 OIDC。  
4. 诚实标注成本低，评委故事完整：拒止默认 → 演示身份源开启 → 经办/处长分权 → 关闭恢复禁用。

**不推荐**在演示中把徽章做成「组织身份已启用」除非真有单位 HTTPS IdP 与双人账号。

### 是否需要新 Codex 提示词

需要。建议新增 **U4b**（演示身份源），而不是立刻写「接真实组织」的 U4-oidc-org（可作后续交付包）。

- 提示词：`docs/codex-prompts/U4b-oidc-demo-identity.md`  
- 目标：可演示、诚实标注、不接真实组织密钥也可跑；与权限闸门/人工确认联动；含验收清单。

真接组织时再单独立项 `U4-oidc-org.md`（依赖单位 issuer 到位后执行）。

## D. U4b 实施：B3 进程内 RS256，复用既有校验与用户声明

本轮选择进程内 JWKS，未启动 Keycloak 容器，因此 `run_keycloak_e2e.py` 不属于本路径验收。已有 realm 的 `office-test / finance-test / approver-test` 声明被复用；密码占位符不会进入运行时。

演示控制面服务固定合成通知、测试付款，以及 U10 新增的受管合成文档任务，使用现有 `OidcVerifier`、`AgentGuardService.invoke`、`resolve_approval_authenticated` 和 OPA/一次性 HMAC/隔离适配器。签名密钥在激活时生成，关闭即失效；组织 `_build_verifier` 的 HTTPS 配置没有改变。U10 加入 auditor-test / audit_reader，审批沿用同一队列，不另建身份或闸门。

界面入口位于工作台、待审批、防护设置。开启、选人、双人确认、关闭的具体步骤与验证命令见 [DELIVERY_ACCEPTANCE.md](DELIVERY_ACCEPTANCE.md#演示身份源u4b非生产)。新增 `govagentsec.demoIdentity.status / enable / login / invoke / resolve / disable` RPC；状态只读，其余需要 `operator.admin`，执行业务还必须提交经本演示 issuer 验证的 Bearer。

**口径仍为：组织 OIDC 未接；当前为演示身份源，校验路径与生产同源。** 演示用户是管理员选择的合成身份，MFA 为模拟声明，不证明真人登录。U1–U9 总验收中“组织 OIDC 未接”的限制仍然成立，不据本包把 U4 生产身份改成 PASS。

2026-11-08 已跑通：一键验收 11 项命令全部 exit 0，包含真实 OpenClaw 选人、经办送审、处长确认、重放拒绝和关闭恢复。证据在 `local-validation/identity-demo/2026-11-08T05-39-58-553Z/`，详见 [U4B_IDENTITY_DEMO_VALIDATION.md](U4B_IDENTITY_DEMO_VALIDATION.md)。
