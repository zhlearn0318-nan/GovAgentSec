# Codex 提示词 U4b：演示身份源（Demo IdP，非组织 OIDC）

## 角色与仓库
`F:\揭榜挂帅\GovAgentSec`，OpenClaw **锁定 2026.7.1-2（禁止升级）**。默认不 git push、不提交真实组织密钥/用户 token。

先读：
- `docs/OIDC_DEMO_OPTIONS.md`（本包选 **B3 + 复用已有 OidcVerifier/Keycloak 半成品**）
- `docs/DELIVERY_ACCEPTANCE.md`「安全边界与身份接入」「UI 身份徽章」
- `modules/agentguard-group2/identity/oidc.py`
- `modules/govagentsec-ui/identity-status.mjs`
- `docs/U1-U9-ACCEPTANCE-REPORT.md` 中 U4 PARTIAL 口径

## 背景
U4 守卫已完成：无组织 OIDC 时执行/审批禁用，徽章正确。缺口是**无法演示**「身份 → 角色 → 权限闸门 → 人工确认」闭环。  
本包做 **演示身份源**，不是接真实单位 IdP。

## 目标（必须全部满足）

1. **演示身份源**
   - 提供本机可启停的演示 issuer（优先复用 `identity/keycloak/agentguard-realm.json` + 一键脚本；或进程内 RS256 演示 JWKS，二选一写清）。
   - 固定演示用户至少 3 个，claims 完整（sub、department、clearance、roles、MFA/amr）：
     - 经办：`office-demo`（或现有 office-test）→ 业务发起、**无** `business_approver`
     - 财务/高风险操作者：`finance-demo`（或 finance-test）
     - 处长审批：`approver-demo`（或 approver-test）→ 含 `business_approver`
   - 令牌必须经过现有 `OidcVerifier`（或共享 `subject_from_claims` 的同一信任边界），**禁止**请求体自报角色生效。

2. **UI（诚实标注）**
   - 新增显式入口：「演示身份源」选择上述用户并建立会话 Bearer。
   - 徽章/文案只能是 **「演示身份源（非生产）」** 一类；**禁止**在演示模式下显示「组织身份已启用」。
   - 默认关闭；开启必须写审计；关闭后立即回到 U4 禁用态（执行/审批不可用）。
   - 演示开启后：经办可发起需审批动作；处长可批；经办自批仍拒绝；伪造 body 角色仍失败。

3. **与闸门联动**
   - 走 `invoke` / `resolve_approval_authenticated`（或 MCP `invoke_verified` 等价路径）。
   - 保留禁自批、digest 绑定原请求、网关管理员 token 不得当业务身份。

4. **HTTPS / 配置诚实**
   - 若沿用服务端 `_build_verifier` 的 `require_https=True`：演示 issuer 用本机 HTTPS（如 mkcert）或文档记载的显式演示例外（默认关、审计、UI 标红）。
   - `scripts/check_identity.py` 或并列检查脚本须能区分「演示身份源」与「组织 OIDC」，**不得**把演示判成生产已配置。

5. **文档**
   - 更新 `docs/DELIVERY_ACCEPTANCE.md`：演示身份源用法、关闭方法、诚实口径。
   - 在 `docs/OIDC_DEMO_OPTIONS.md` 或 `UPGRADE_ROUND_VALIDATION.md` 记本包结果。
   - 讲稿一句：「组织 OIDC 未接；当前为演示身份源，校验路径与生产同源。」

## 明确不做
- 不接真实组织 issuer/client_secret。
- 不升级 OpenClaw。
- 不把 `loopback_static_dev` 包装成生产。
- 不在默认配置开启演示身份源。

## 验收清单（做完必须跑）

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'

# 1) 原有边界不得回退
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_boundary.py

# 2) 演示身份源专项（你需新增或扩展；断言如下）
# - 默认关闭：执行/审批仍禁用
# - 开启演示：选经办可 pending_approval；选处长可 resolve；自批 D105；篡改角色 401/403
# - 徽章文案含「演示」且不含「组织身份已启用」
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_boundary.py
# 若新增：scripts/test_demo_identity.py 或扩展同文件

# 3) UI live（扩展现有脚本或新增）
node scripts/test_identity_live.mjs

# 4) 若使用 Keycloak 路径
# 按你添加的一键脚本启动演示 IdP 后：
.\modules\agentguard-group2\.venv\Scripts\python.exe modules\agentguard-group2\identity\run_keycloak_e2e.py
```

产出证据到 `local-validation/identity-demo/<timestamp>/`：日志、关键截图（徽章、选人、经办发起、处长审批、关闭后禁用）、JSON 报告。  
恢复：退出后网关/配置与演示前一致（或提供明确 restore 步骤并执行）。

## 完成定义
- 评委可在本机无组织 IdP 情况下看完身份闸门故事。
- UI/回执/文档三处诚实标注「演示」。
- 原有 U4 默认禁用测试仍 PASS。
- 未宣称组织 OIDC 已完成。
