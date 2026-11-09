# U12 组织 OIDC 与仅演示边界设计

> 文档状态（2026-11-10）：技术参考：接口/算法和原始证据按本文件的范围解释；阶段页面与账号说明不作为当前使用步骤。当前行为见[系统基准](CURRENT_SYSTEM.md)。

**当前默认：仅演示；组织未接。** 本包 B 为主交付，不以演示 JWT 或填齐配置宣称组织接入。

| 路径 | 前置 / 接线 | 验收与限制 |
| --- | --- | --- |
| A 组织 HTTPS IdP | 单位 issuer、audience、client、角色/部门/密级/MFA 映射，两个独立经办/审批账号；安全注入短期访问 token → 原 OidcVerifier → AgentGuardService → U10/U11 | 配置检查后还需真实验签、角色、双人不可自批、到期/撤销联调；等待单位网络/账号/声明配置，不在本包承诺联通 |
| B 非生产演示 | U4b 进程内 RS256/JWKS，既有 realm 用户；U13 逐用户 Bearer 委托与撤销 | 默认关闭；开启后仍显示演示身份源（非生产）；MFA 为合成声明，不是真人 SSO |

## 配置位与 A runbook

已核对 service/config.py 的 AGENTGUARD_ 前缀字段映射、MCP config.py：

| 键 | 要求 |
| --- | --- |
| AGENTGUARD_OIDC_ENABLED | true（组织接入时显式启用） |
| AGENTGUARD_OIDC_ISSUER | 单位 HTTPS issuer；不接受演示域代表组织 |
| AGENTGUARD_OIDC_AUDIENCE | 单位资源 audience |
| AGENTGUARD_OIDC_REQUIRE_MFA | true |
| AGENTGUARD_ALLOW_DEVELOPMENT_IDENTITY | 生产 false |
| AGENTGUARD_MCP_IDENTITY_MODE | oidc；loopback_static_dev 仅演示 |
| AGENTGUARD_MCP_TOKEN_FILE / AGENTGUARD_MCP_BEARER_TOKEN | 当前用户短期 token，私有文件或秘密注入；禁止用网关 token |
| govagentsec.demoIdentity.enable / disable | U4b 运行时演示开关，不写组织 OIDC 配置 |

单位侧 checklist：HTTPS discovery/JWKS 可达且无重定向；audience/client 匹配；sub、department、clearance、realm_access.roles 或 resource_access.agentguard.roles、amr 含 MFA；审批人 business_approver 与经办不同。先用本机私有环境注入上述配置，再运行 check_identity，随后由单位账号分别试验允许/越权/自批/过期/撤销；通过前不能标组织已验证。client_secret/refresh token 不进仓库；浏览器授权码或设备码客户端联调仍待单位 IdP。

## 强制文案与检查

| 位置 | 句子 |
| --- | --- |
| 演示徽章 | 演示身份源（非生产） |
| 防护设置 | 组织 OIDC 未接；网关登录不代替业务身份 |
| 交付说明 | 当前默认仅演示，组织身份接入尚未验收 |
| 评委讲稿 | 同源校验内核已运行，演示选人不等于生产 SSO |

check_identity 仅报 prerequisites，verified 永远 false；演示 issuer 即使字段齐全也不能 configured=true。UI identityStatus 优先识别 demo_identity/identity_source，再判断组织就绪；新增合成状态矩阵断言不能误标组织已启用。真实页面开/关截图复用本轮重新执行的 U4b 验收。

U13 负责持有/撤销当前用户委托；U10/U11 管任务范围；本包不再造登录/Verifier/角色或 U9 沙箱。非目标：真实短信、单位授权码客户端和生产密钥联调。

## 阶段 A 自检

- [x] 文档路径正确。
- [x] A/B 两路径写清，本包交付 B 和 A runbook。
- [x] 配置位来自真实服务与 MCP 代码。
- [x] UI、文档、回执诚实文案与检测写清。
- [x] 复用 U4b/U10，委托引用 U13。

## 30 秒口径

当前是非生产演示身份源，组织 OIDC 尚未接入。演示 JWT 使用与生产同源的校验路径，但选人和 MFA 声明不等于真人 SSO。每位用户以自己的有效委托提交动作，角色、任务范围和双人审批继续生效。真实组织接入需要单位提供 HTTPS IdP、声明映射和双账号完成联调。

## 本轮结果与命令

PASS；`node scripts/verify_oidc_demo_boundary.mjs` 退出 0，含 `python scripts/check_identity.py`、`python scripts/check_oidc_demo_boundary.py`、徽章矩阵、`node scripts/verify_demo_identity.mjs`、`node scripts/verify_identity_task_acl.mjs`。证据 `local-validation/u12-oidc-boundary/2026-11-08T07-34-47-317Z/` 含命令日志、wording-scan.json 和开/关两张实际页面截图；未改 openclaw.json。A 仅 runbook，未进行单位 IdP 联调。
