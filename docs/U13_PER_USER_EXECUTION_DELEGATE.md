# U13 逐用户执行委托设计

实况：`identity-status.mjs` 的全局服务徽章始终 executionEnabled=false，旧 HTTP 管理页拒绝业务执行；真正可操作的演示路径是 `govagentsec-ui/demo-identity.mjs` 页面内存 Bearer → runtime plugin/demo-identity.mjs 已登录网关 RPC → identity/demo_provider.py → 同一 OidcVerifier → U10/U11 契约、OPA、审批和票据。已有选人签发 JWT，但旧 token 在切换用户后仍有效，缺少主动撤销。

状态：未登录/无委托 → 选人取得已验证 Bearer → 按角色可评估执行 → 当前委托关闭/切换/过期/演示关闭 → 服务端撤销或拒绝。经办可发起和任务内读、处长可审批他人、审计只能看台账。执行启用只表示可以提交闸门评估，不能越过任务 ACL 或自批。

实现沿用现有 JWT 验签，在演示 worker 加 token 哈希→当前活跃委托记录，不创建第二套签名/角色系统。Bearer 不落盘。登录携带旧 Bearer 时原子撤销该页面旧委托，再签新 token；不同标签页独立 token，不靠 subject 全局串身份。撤销同步清掉使用该 token 的 U11 会话绑定与未消费授权。新的 revoke RPC 只接收 bearer；关闭委托后须重新选人登录。

| UI 操作 | RPC / 鉴权 | 闸门 |
| --- | --- | --- |
| 建立/切换演示会话 | demoIdentity.login(user, bearer 可选旧委托)，网关 operator.admin；新 JWT 经原 Verifier | 撤销旧委托，不授额外 scope |
| 关闭当前委托 | demoIdentity.revoke(bearer)，Verifier + 活跃委托 | 撤销该 token；其他标签页不受影响 |
| invoke/task_read/task_escalate/bind_session | 每次携带 bearer | DemoIdentity.subject 验签+活跃委托，再 U10/U11 |
| resolve | 审批人 bearer | 原 resolve_approval_authenticated，禁自批 |
| status | bearer 可选 | 无委托 execution_enabled=false，返回原因码；审计角色仍可查看 |

UI 显示委托用户/角色、是否可提交执行、原因码；危险按钮在操作期间立即禁用。刷新丢弃页面 token；未过期的聊天绑定本轮也受显式撤销控制，不冒称刷新能销毁服务端 token。无 token/网关 token/体内角色不能执行。旧 HTTP 管理页保持拒绝，文案改为“本入口未携带业务委托”，不再声称整个产品没有委托。

U12 管组织口径，真实授权码/设备码待单位 IdP；本包主路径仍是演示身份源（非生产）。U10/U11 管任务范围，U9 管隔离，均不重造。

## 阶段 A 自检

- [x] 设计引用实际 UI、RPC、Verifier 和任务模块。
- [x] 状态机包含切换、主动关闭和过期收回。
- [x] 服务端每次验证，不能只禁按钮。
- [x] 复用 U4b/U10/U11，不新建身份内核。
- [x] 无单位 IdP 可测角色矩阵、撤销和多标签页边界。

## 使用与验收

防护设置 → 开启演示身份源 → 选择用户 → 建立演示会话。页面显示“执行评估可提交”只代表委托有效，后续仍受角色/OPA/任务范围限制。点击“关闭当前委托”收回本页 token 和关联聊天授权；切换用户并重新建立会话会先撤销旧 token。其他标签页的独立 token 不被误撤销；关闭整个演示源撤销全部。

无 Bearer 显示 DEMO_DELEGATION_REQUIRED；已撤销显示 DEMO_DELEGATION_REVOKED；审计显示 DEMO_AUDITOR_READ_ONLY；过期沿用 Verifier 原原因码。页面刷新只丢弃本页 token，不能冒称服务端已收到撤销；显式关闭委托或等待 TTL 才构成服务端收回。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts/test_identity_boundary.py
node scripts/verify_demo_identity.mjs
node scripts/verify_identity_task_acl.mjs
node scripts/verify_per_user_delegate.mjs
```

最后一个命令包含上述必跑项、U11 回归和委托专项，顺序执行避免并发污染演示身份。证据含命令日志与真实页面 delegate-active / delegate-revoked PNG；不保存 Bearer。无现网配置变更，只重启固定宿主加载新增 RPC。

演示话术：“徽章不授予执行权；当前用户的有效委托才允许提交闸门评估，关闭或切换后旧凭据立即失效。”

## 本轮结果

PASS。证据 `local-validation/u13-per-user-delegate/2026-11-08T07-30-32-129Z/report.json`：必跑身份、U4b、U10、U11 均退出 0；服务端撤销专项与真实页面开/关委托通过。最终报告链接各命令原始来源，不覆盖初次失败报告。新增页面探针遇到既有激活时只操作自己的 token，保留全局状态。最初的全局关闭被自动审批拒绝；用户随后明确“允许关闭并重测”，据此关闭并重新验收通过，最终演示源为关闭。两张截图为 delegate-active.png / delegate-revoked.png。
