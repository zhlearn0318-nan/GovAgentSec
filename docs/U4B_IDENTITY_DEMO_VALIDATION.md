# U4b 演示身份源交付验证

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

**结论：演示闭环 PASS；组织 OIDC 仍未接入。** 2026-11-08 在 OpenClaw **2026.7.1-2** 真实工作区完成选人、送审、双人确认及关闭恢复。未升级、未 push、未接组织密钥，未调用外部模型。

## 使用与复现

打开已登录的 `http://127.0.0.1:18789`，进入**防护设置 → 演示身份源**。该入口也显示在工作台与待审批页，默认关闭。

选择 `office-test` 发起台风通知送审，再选择 `approver-test` 人工确认；`finance-test` 可发起 600 元测试付款。角色来自已验签 JWT，不能从请求体覆盖。所有业务记录均为合成数据，不发送消息或实际付款。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts/verify_demo_identity.mjs
```

本轮命令退出码 **0**；11 项命令全部 PASS。验收后演示身份源已关闭。

- [总报告及命令日志](../local-validation/identity-demo/2026-11-08T05-39-58-553Z/report.json)
- [真实工作区运行报告](../local-validation/identity-demo/2026-11-08T05-39-58-553Z/live-report.json)
- [本轮启停与身份审计](../local-validation/identity-demo/2026-11-08T05-39-58-553Z/identity-audit.jsonl)
- [经办送审截图](../local-validation/identity-demo/2026-11-08T05-39-58-553Z/03-office-pending.png)
- [处长确认后截图](../local-validation/identity-demo/2026-11-08T05-39-58-553Z/06-approved-once.png)
- [关闭恢复截图](../local-validation/identity-demo/2026-11-08T05-39-58-553Z/07-disabled-restored.png)

完整目录另有默认关闭、选人、财务送审、处长会话截图，共 7 张真实页面 PNG。

## 验证结果

| 检查 | 证据结果 |
|---|---|
| 默认关闭 | invoke / resolve 拒绝；普通工作区和原运行防护面板仍禁用业务执行 |
| 经办送审 | notification.submit → pending_approval；通知与付款计数均为 0 |
| 自批 | D105_SELF_APPROVAL，HTTP 403，副作用计数仍为 0 |
| 非审批角色 | 财务替经办审批返回 A403_APPROVER_ROLE_REQUIRED，副作用仍为 0 |
| 伪造角色 / resource | DEMO_UNTRUSTED_FIELD，HTTP 403；直接服务层也拒绝签名角色以外的权限 |
| 网关管理员令牌冒充用户 | I008_TOKEN_INVALID，HTTP 401 |
| 合法双人确认 | 台风通知、测试付款分别只执行 1 次；external_delivery=false |
| 重放 | A409_ALREADY_RESOLVED，HTTP 409，status=blocked，executed=false，计数仍为各 1 |
| 摘要篡改 | resource / data_level / parameters 变化无法找到已验证待批快照；读取与执行不发生 |
| 签名、声明、故障边界 | 错签名/算法、issuer、audience、过期、角色、部门、密级、MFA、scope/client、OPA 故障均拒绝 |
| 并发重复审批 | 4 个并发请求仅 1 次实际执行 |
| 关闭与重开 | 清除待批请求，旧 Bearer 失效；关闭后刷新保持关闭 |
| 不出域 | 演示 metadata/JWKS 在进程内；禁用 urllib 网络访问仍能验签及完成 readiness；UI 测试仅允许本机网关来源 |
| 诚实标注 | UI、回执、审计含“演示身份源（非生产）”；production_oidc=false；没有将演示 issuer 判成组织配置完成 |

回归：原身份边界 9 项、演示专项 9 项、管理页权限 10 项、轨迹治理 46 项、受控文档 10 项、任务契约 10 项、参数来源 10 项均通过；另外通过真实进程 RPC、工作区 UI、原身份 live 和演示 live 检查。

## 接口与变更范围

| 文件 / 模块 | 改动 |
|---|---|
| `identity/demo_provider.py` | 复用 Keycloak 固定用户、进程内 RS256 JWKS、继承 OidcVerifier 验签/声明边界，隔离演示服务和启停审计 |
| `service/app.py` | 仅调整已验证审批中的错误优先级：本人请求先报 D105，再检查审批角色；原摘要绑定与执行链不变 |
| `openclaw_runtime_security_plugin/demo-identity.mjs`、`index.js` | 私有 stdio 子进程及 6 个受权限控制的 RPC；默认不启动子进程 |
| `govagentsec-ui/demo-identity.mjs`、`workspace.mjs`、`identity-status.mjs` | 演示入口、内存 Bearer、选人和人工确认、非生产徽章；原生产执行限制不变 |
| `trajectory-governance/register.mjs` | 注册一个前端静态模块路径 |
| `scripts/check_identity.py` | 单列演示身份说明，演示 issuer 不计组织配置完成 |
| `test_demo_identity.py`、`test_demo_identity_rpc.mjs`、`test_demo_identity_live.mjs`、`verify_demo_identity.mjs` | 后端、安全边界、真实页面验证与一键证据输出 |
| `test_panel_access.mjs`、`test_workspace_ia.mjs` | 非生产徽章回归及新增前端模块夹具映射 |

RPC 前缀 `govagentsec.demoIdentity.`：

| 方法 | 参数 | 作用域 |
|---|---|---|
| status | 可选 bearer | operator.read |
| enable / disable | 无 | operator.admin |
| login | user（3 个固定用户之一） | operator.admin |
| invoke | scenario（notice/payment）、bearer | operator.admin + 经演示 issuer 验证的业务 Bearer |
| resolve | request_id、resolution（approve/reject/interrupt）、bearer | operator.admin + 业务 Bearer；审批角色、禁自批、原请求绑定仍由服务检查 |

状态和回执不包含真实路径、原始动作、票据或摘要。login 仅向当前已认证管理会话返回短期演示 Bearer，不写浏览器持久存储。业务请求只构造两种固定合成动作。

## 恢复与限制

本轮只为加载代码重启现有网关，启动参数仍为 `gateway --port 18789`。网关配置前后 SHA-256 均为：

`0b6a24718f17312c9ab5aaa1d9f344b0508dbfc70ff8784681266875acbe3374`

`demo_disabled_after_run=true`、`config_unchanged=true`。没有启用生产 OIDC、没有更改 MCP 身份或业务策略，没有自动安装 Skill。

选择 B3 进程内 JWKS，未启动 Keycloak HTTP 服务；`run_keycloak_e2e.py` 因路径不适用而未执行，不计作通过。生产 HTTPS 和拒重定向配置保持原状。

固定用户由管理员选择，MFA/amr 是合成声明；这证明验签、角色与审批链路，不证明真人身份。有效期为激活 15 分钟、用户令牌最多 5 分钟；刷新或离开工作区后需重新选人。本包没有开放真实任务审批、跨进程生产用户委托或 Skill 发布入口，原总验收的“组织 OIDC 未接”限制仍然成立。
