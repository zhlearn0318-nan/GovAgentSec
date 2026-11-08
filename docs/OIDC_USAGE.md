# OIDC 与任务权限使用说明

**当前默认：仅演示；组织未接。** 强制口径与组织接线清单见 [U12](U12_ORG_OIDC_OR_DEMO_BOUNDARY.md)，按人开/关与撤销见 [U13](U13_PER_USER_EXECUTION_DELEGATE.md)。

**当前已实现 U4b / U10 演示闭环；真实组织 OIDC 未接。** OpenClaw 固定 2026.7.1-2。网关登录只授权打开控制台，不代表取得业务执行或审批权限。

## 本机演示

入口：工作台 / 待审批 / 防护设置 →「演示身份源」。默认关闭。

1. 开启演示身份源，选择 `office-test`，点击「建立演示会话」。徽章始终为「演示身份源（非生产）」。
2. 在「任务最小权限」选择目录 A，创建只读任务。任务只列出 `emergency_plan`，工具为 `file.read`。
3. 点击「尝试读取目录 B（未授权演示）」，得到 `P014_RESOURCE_OUTSIDE_TASK`，底层读取不执行。点击该回执上的「申请一次性扩权」。
4. 切换 `approver-test` 建立会话，在同一审批队列确认；原任务原动作只执行一次。不能自批，不能用网关 token 或请求体角色替代审批人身份。
5. 切换 `auditor-test` 查看脱敏过程台账；最后关闭演示源，恢复执行/审批禁用。

| 用户 | 已验证角色 | 用途 |
| --- | --- | --- |
| office-test | office_user | 经办：绑定任务、范围内读文档、申请越权审批 |
| finance-test | finance_operator | 原 U4b 隔离测试付款 |
| approver-test | business_approver | 审批他人原动作；不自动取得经办权限 |
| auditor-test | audit_reader | 只读台账，不发起、不执行、不审批 |

所有文档、身份和业务动作均为合成演示数据。目录 A/B 是 registry 的逻辑 URI 树，不代表任意主机目录接入。基础范围只能收紧；审批只赋予原动作的一次授权，不扩大基础权限。

## 身份与票据边界

U4b 使用进程内 RS256/JWKS，复用 Keycloak realm 用户声明及 `OidcVerifier`。校验签名、issuer、audience、有效期、角色、部门、密级、MFA 声明、scope 与客户端绑定。演示 issuer 不对外联网；不改变生产 HTTPS/拒重定向要求。演示选人由网关管理员操作，不等于真人认证；MFA 为合成声明。

Bearer 仅保存在当前页面内存及私有 stdio，300 秒有效；刷新/切页会丢失当前页面身份，重新选人即可。演示源最多启用 15 分钟，关闭销毁内存密钥；不会写入组织 OIDC 配置。

U10 扩展 U7 `TaskPolicies`，复用 OPA → 任务权限 → 审批凭证 → HMAC 票据 → 隔离适配器 → 审计。任务默认 1 小时有效；扩权授权 60 秒、执行票据 30 秒且单次，绑定 task、主体、动作、revision 与 scope digest。收紧范围使旧授权失效；D004/D005 等硬拒绝不能用扩权审批覆盖。

回执与台账记录来源 `demo_idp_verified_jwt`、task_id、scope digest、审批与执行结果，不记录正文、Bearer、私钥或秘密票据。轨迹评审仍仅本地，本包不发起模型会话。

## 验收与证据

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts/verify_identity_task_acl.mjs
```

前置：固定版本网关在本机 18789 运行，加载本仓库 runtime-security / govagentsec UI 插件；AgentGuard venv、OPA、Wasmtime 和 Edge 可用。插件新增 RPC 后需重启网关；不需要更改网关配置。失败返回非零并保留日志。

报告与截图输出 `local-validation/identity-task-acl/<timestamp>/`。本轮结果见 [U10_IDENTITY_TASK_ACL_VALIDATION.md](U10_IDENTITY_TASK_ACL_VALIDATION.md)，设计与边界见 [IDENTITY_TASK_ACL_DESIGN.md](IDENTITY_TASK_ACL_DESIGN.md)。测试结束会关闭本轮演示源，并比较网关配置哈希。

## 后续接入真实组织

组织需提供 HTTPS issuer、audience、应用 client、角色/部门/密级/MFA 映射与独立经办/审批测试账号。服务配置沿用：

| 配置 | 要求 |
| --- | --- |
| AGENTGUARD_OIDC_ENABLED | true，显式启用 |
| AGENTGUARD_OIDC_ISSUER | 单位 HTTPS issuer，禁止演示域冒充 |
| AGENTGUARD_OIDC_AUDIENCE | 单位分配的资源 audience |
| AGENTGUARD_OIDC_REQUIRE_MFA | 默认 true |
| AGENTGUARD_ALLOW_DEVELOPMENT_IDENTITY | 生产 false |
| AGENTGUARD_MCP_IDENTITY_MODE | oidc |
| AGENTGUARD_MCP_TOKEN_FILE / BEARER_TOKEN | 当前用户短期令牌的安全注入；不是网关管理员 token |

`python scripts/check_identity.py` 只报告配置缺口，不把填了字段或演示源开启当作组织身份已验证。演示逐用户委托/撤销见 U13，聊天自动 scope 见 U11；真实组织浏览器授权码与单位 MFA 仍需联调，不能据演示通过将生产身份判为完成。

Aegis 管能力准入，U9 管会话执行隔离，U10 管受管动作的任务权限；三者互不替代。Keycloak 独立 HTTP E2E 不是本轮进程内 JWKS 路径的验收。
