# Codex 提示词 U13：UI 逐用户执行委托（按人开/关执行）

## 0. 角色与目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2**。不 push；轨迹不外发；不提交真实组织密钥。

**缺口（项 2）**：U4b/U10 已有演示身份选人与徽章，但产品面仍缺清晰的 **逐用户执行委托**——避免「有身份徽章却恒禁执行」或「无该用户 Bearer 却旁路放行」。`docs/OIDC_DEMO_OPTIONS.md` 已点名：`identity-status.mjs`「尚无逐用户 OIDC 委托」；工作台执行/审批不能仅因徽章变绿就放开。

**目标**：登录/选人后，**持有该用户验证后的 Bearer**，再调用 evaluate / approve / 任务执行；UI 可按用户看到执行开/关与原因；关闭委托或切换用户立即收回执行权。

---

## 1. 硬约束

1. 不升级 OpenClaw；不 push；轨迹不外发。
2. **复用** U4b/U10：`OidcVerifier`、演示身份源、禁自批、任务 ACL；禁止第二套角色系统。
3. fail-closed：无有效业务 Bearer → `executionEnabled=false`（或等价）且服务端拒绝；禁止只改前端按钮。
4. 网关管理员 token **不得**当业务执行/审批身份。
5. 请求体自报角色无效；必须经同一信任边界。
6. UI 诚实：演示源下仍标「演示身份源（非生产）」；不宣称组织 SSO 已完成。
7. 真组织授权码/设备码可设计预留，本包以**演示源逐用户委托**为可交付主路径；组织路径写清待单位 IdP。

---

## 2. 阶段 A — 设计

写出：

**`docs/U13_PER_USER_EXECUTION_DELEGATE.md`**

必须包含：

1. **问题陈述**：当前 `executionEnabled` / 徽章 / Bearer 持有链的实况（先读 `modules/govagentsec-ui/identity-status.mjs`、`demo-identity.mjs` 及相关 RPC，按实文件填写）。
2. **委托状态机**：未登录 → 已选演示用户（有 Bearer）→ 执行可评估 → 切换/登出/超时 → 收回；审批人切换同理。
3. **按人开/关**：何谓「该用户执行启用」——至少：持有未过期 Bearer + 演示源开启（或组织模式已验证）+ 角色允许的动作集合；管理员全局开关（若有）不得绕过禁自批与任务 ACL。
4. **API/RPC 接线表**：UI 动作 → 携带 Authorization → 服务端校验 → 闸门；先查仓库再填真实路径。
5. **与 U10/U11 关系**：委托只解决「谁在操作」；任务 scope / 越权审批仍走 U10/U11。
6. **与 U12 关系**：组织真接后应用同一委托链；本包不完成 IdP 联调。
7. **威胁**：丢弃 Bearer 后按钮仍可点、用网关 token 调用 approve、多标签页串身份——对策。

### 阶段 A 自检

- [ ] 设计已入库且引用真实模块路径
- [ ] 状态机含收回执行权
- [ ] 明确服务端 fail-closed，非纯 UI
- [ ] 不平行造身份内核
- [ ] 演示路径可在无单位 IdP 下验收

---

## 3. 阶段 B — 实现切片

### 切片 1：Bearer 委托链可观测

- UI 显示：当前委托用户、角色、执行是否启用、原因码（无身份/已过期/演示关闭/角色不足）。
- 页面内存 Bearer 规则与 U10 一致（刷新丢失可重新选人）；不得把 Bearer 写入世界可读日志。

### 切片 2：执行/审批按钮与服务端对齐

- 无委托：执行/审批禁用，服务端仍拒绝（双保险）。
- 经办委托：可发起需审批动作 / 任务内读；不可自批。
- 处长委托：可批他人；批自己仍拒。
- 审计委托：只读台账，不执行不审批。

### 切片 3：切换与收回

- 切换用户或关闭演示源：旧 Bearer 作废；进行中危险按钮立即禁用；审计记 `identity_source` 与委托变更。

### 切片 4：验收与证据

证据：`local-validation/u13-per-user-delegate/<ISO-UTC>/`

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_boundary.py
node scripts\verify_demo_identity.mjs
node scripts\verify_identity_task_acl.mjs
# 本包专项（新增或扩展，名称可自定）：
# node scripts\verify_per_user_delegate.mjs
# 断言示例：无 Bearer 时 RPC 执行失败；经办/处长委托后行为符合矩阵；切换用户后旧票失效；徽章无「组织已启用」
```

---

## 4. 非目标

- 不接单位真实授权码联调（可留接口说明）。
- 不重做任务 ACL（U10/U11）与双沙箱（U9）。
- 不把「全局管理员一键全开执行」做成默认。

---

## 5. 完成后中文简短交付说明

设计路径、改动列表、委托如何开/关、验收命令与证据目录、与 U10 回归是否仍绿、一句演示话术。
