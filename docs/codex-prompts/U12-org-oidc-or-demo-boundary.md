# Codex 提示词 U12：组织 OIDC 真接配置位 +「仅演示」对外口径

## 0. 角色与目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2（禁止升级）**。默认不 git push、不外发轨迹、不提交真实组织密钥/用户 token。

**本包要解决的缺口（U1–U11 之后项 1）**：组织 OIDC 尚未真接；演示身份源（U4b/U10）已可演「身份→闸门」。评委若问生产 SSO，需要：

- **路径 B（本包主交付，必须落地）**：「仅演示」书面边界 + UI/文档强制诚实文案 + 检查脚本不得把演示判成组织已接；
- **路径 A（设计 + 配置位/runbook，不强制本包联调通）**：单位 HTTPS IdP 接线清单与 `AGENTGUARD_OIDC_*` 配置位核对。

**禁止**平行造第二套身份内核：复用 U4b/U10 的 `OidcVerifier`、演示源、徽章与闸门；本包是**口径、边界、配置位与检查**，不是重做登录。

---

## 1. 硬约束

1. 不升级 OpenClaw；不 push；轨迹原文不外发外部 API。
2. UI/文档/回执三处诚实：演示模式只允许「演示身份源（非生产）」类文案；**禁止**出现「组织身份已启用 / 组织 OIDC 已启用」，除非路径 A 真接且检查通过。
3. fail-closed：默认演示源关闭；组织未配时执行/审批保持禁用（与 U4 一致）。
4. 复用：`modules/agentguard-group2/identity/oidc.py`、`scripts/check_identity.py`、`docs/OIDC_USAGE.md`、`docs/OIDC_DEMO_OPTIONS.md`、U4b/U10 演示源；**不要**新建第二套 JWT/角色系统。
5. 不把网关登录当成业务身份；不把 `loopback_static_dev` 包装成组织身份。
6. 真实 client_secret / 用户 refresh token **不得**写入仓库；密钥只留环境变量名与本机私有注入说明。

---

## 2. 阶段 A — 设计（先写文档，再改代码/文案）

写出：

**`docs/U12_ORG_OIDC_OR_DEMO_BOUNDARY.md`**

必须包含：

1. **二选一路径对照表**
   - **A 真接组织 IdP**：前置条件（HTTPS issuer、audience、client、角色/部门/密级/MFA 映射、独立经办与审批测试账号）；接线步骤；与现有 `AGENTGUARD_OIDC_*` 映射；验收命令；风险与不可控等待项。
   - **B 仅演示**：对外口径全文（讲稿/README/UI 强制句）；允许说什么 / 禁止说什么；与 U4b/U10 演示源关系；`check_identity.py` 如何区分「演示开」与「组织已验证」。
2. **配置位清单**（先查仓库再填真实键名，至少核对）：
   - `AGENTGUARD_OIDC_ENABLED` / `ISSUER` / `AUDIENCE` / `REQUIRE_MFA`
   - `AGENTGUARD_ALLOW_DEVELOPMENT_IDENTITY`（生产 false）
   - `AGENTGUARD_MCP_IDENTITY_MODE` / token 注入方式
   - 演示源开关（U4b/U10 已有字段，按实名引用）
3. **UI 强制文案表**：徽章、防护设置、交付说明、评委讲稿各一句；误标「组织已启用」的检测方式。
4. **与 U4b/U10/U13 边界**：本包不重做选人/签发；逐用户委托属 U13；本包只保证「未委托/未真接时不得谎称组织已接」。
5. **非目标**：本包不完成单位 IdP 联调通（可留 runbook）；不接真实短信；不重做 U9。

### 阶段 A 自检（全勾再进 B）

- [ ] 设计文档路径正确且入库
- [ ] A/B 两路径均写清；明确本包以 B 为主交付
- [ ] 配置位按仓库实名填写，无臆造键
- [ ] 强制诚实文案表已写
- [ ] 标明不重复造身份内核（扩展 U4b/U10）

---

## 3. 阶段 B — 实现 / 交付切片

### 切片 1：书面边界与文档

- 更新 `docs/OIDC_USAGE.md`、`docs/OIDC_DEMO_OPTIONS.md`、`docs/DELIVERY_ACCEPTANCE.md`：醒目写清「当前默认：仅演示；组织未接」。
- 在设计文档附 **评委 30 秒口径**（≤5 句）。

### 切片 2：UI / 检查强制诚实

- 审计 `modules/govagentsec-ui/identity-status.mjs` 及演示身份相关页：演示开启时徽章/状态不得含「组织身份已启用」。
- 扩展或并列检查：`python scripts/check_identity.py`（及若需 `scripts/check_oidc_demo_boundary.py`）断言：
  - 演示源开启 ≠ 组织 OIDC 已配置完成；
  - 组织键缺失时报告缺口；
  - 不得因演示 JWT 把生产状态判绿。

### 切片 3：路径 A 配置位与 runbook（不强制联调）

- 核对并文档化 `AGENTGUARD_OIDC_*` 占位；给出单位侧 checklist（issuer/audience/MFA/双人账号）。
- 可选：配置模板（无密钥）进 `docs/` 或本机忽略目录说明；**禁止**提交真实密钥。

### 切片 4：证据

证据目录：`local-validation/u12-oidc-boundary/<ISO-UTC>/`  
含：设计自检勾选、`check_identity` 输出、UI 徽章截图（演示开/关）、文案扫描结果 JSON、README。

建议命令（可按仓库实名微调，但语义必须覆盖）：

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
python scripts\check_identity.py
# 若新增边界脚本：
# python scripts\check_oidc_demo_boundary.py
node scripts\verify_demo_identity.mjs
# U10 回归不得因文案改动回退：
node scripts\verify_identity_task_acl.mjs
```

---

## 4. 非目标

- 不重做 U4b/U10 身份签发与任务 ACL。
- 不强制本包完成单位 IdP 真接通。
- 不做 U13 逐用户委托（可交叉引用）。
- 不升级 OpenClaw；不 push；不外发轨迹。

---

## 5. 完成后中文简短交付说明

写清：设计文档路径、改动文件列表、B 口径是否已落到 UI/文档/检查、A runbook 路径、证据目录、演示话术一句、是否改了 `openclaw.json`（期望否）。
