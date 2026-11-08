# Codex 提示词 U11：任务 ACL 全量覆盖（聊天任务 + 原生工具）

## 0. 角色与总目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2（禁止升级）**。默认不 git push、不外发轨迹到外部 API。

**前置依赖（强制）**：先完成 [`U7b-notify-tools-live.md`](U7b-notify-tools-live.md)（通知工具已进现网 `toolFilter`，相关回归绿）。若 U7b 未完成或 FAIL，**停止本包**，在交付说明写明阻塞原因。

**本包目标**：把 U10 已交付的 L2 任务 ACL，从「合成文档目录任务链」扩展为：

1. **聊天发起的任务自动带 scope**（不再只靠演示面板手工创建）
2. **原生工具**（至少 read / write / exec / 网络类）统一过任务 ACL
3. 无关文件不可见/不可读；越权 → 审批 → **单次 ticket**；禁自批；防重放——与 U10 同内核，不平行造第二套

U10 已承认的剩余边界（必须关掉或诚实收窄）：
> 未自动为全部聊天 run 绑定任务范围，未受管原生工具仍不在本包覆盖内。

---

## 1. 必读（动手前全部读完）

- `docs/IDENTITY_TASK_ACL_DESIGN.md`（本包先补「全量覆盖」一节再实现）
- `docs/U10_IDENTITY_TASK_ACL_VALIDATION.md`
- `docs/codex-prompts/U10-identity-login-task-acl.md`
- `docs/codex-prompts/U7b-notify-tools-live.md`（前置）
- `docs/U1-U9-ACCEPTANCE-REPORT.md`（U7「任务契约未自动逐 run 绑定」）
- `docs/BEHAVIOR_CONSTRAINT_SOTA_UPGRADE.md`（`AGENTGUARD_MCP_TASK_ID` / 非逐 run 自动切换的旧边界）
- 实现落点（按实文件扩展，勿臆造）：
  - `modules/agentguard-group2/enforcement/task_policy.py`
  - `modules/agentguard-group2/enforcement/gateway.py`
  - OpenClaw 插件 `before_tool_call` / Protect tool-surface / session-sandbox 文件桥
  - `modules/govagentsec-ui/` 任务最小权限面板（保留；全量覆盖后仍可作调试入口）
  - `scripts/verify_identity_task_acl.mjs`、`scripts/test_identity_task_acl.py`、`scripts/test_task_acl_live.mjs`
  - U7b 后的现网 `toolFilter`（含 `submit_emergency_notice`）

---

## 2. 硬约束

1. **不升级 OpenClaw**；不 push；轨迹原文不外发。
2. **不接真实组织 OIDC**；继续用 U10/U4b 演示身份源（非生产标注不变）。
3. **不重做 U9 双沙箱**；会话隔离与任务 ACL 文案勿混称。
4. **复用 U7/U10 内核**：契约、scope digest、单调收紧、审批、一次性 ticket、禁自批、provenance；禁止平行第二套策略引擎。
5. **fail-closed**：无 scope / 无业务身份的敏感或文件类调用，默认 **DENY** 或进入明确拒绝策略（见阶段 A 选型，禁止静默放行）。
6. 无关路径不可枚举为「可用」；越权读不得增加底层 read_count（与 U10 断言同级严格）。
7. UI/文档诚实：可写「聊天任务与原生工具已纳入任务 ACL」；**禁止**写成组织 SSO 已完成或恶意代码完全隔离。

---

## 3. 阶段 A — 设计补篇（先文档，再大改代码）

更新 `docs/IDENTITY_TASK_ACL_DESIGN.md`，新增（或扩写）一节 **「全量覆盖（U11）」**，并自检清单全部勾选后再实现：

### 必须写清

1. **聊天任务如何自动获得 scope**  
   - 触发点：新会话 / 新 user turn / 首次工具调用前（三选一或组合，写清）  
   - scope 推导：用户意图 + 角色默认模板 + 显式附件/路径；默认最小集  
   - 与演示面板手工建任务的关系：面板仍可用；聊天路径不得绕过契约

2. **原生工具覆盖表**

| 类别 | 宿主工具（按仓库实名填写） | ACL 动作 | 无 scope 时 |
| --- | --- | --- | --- |
| 读 | （如 file/read、MCP read_*） | 路径 ∈ 允许前缀 | DENY |
| 写 | （如 file/write） | 路径 ∈ 允许前缀 | DENY |
| 执行 | exec / run_protected_command 等 | 工具 ∈ allowed_tools；命令参数 provenance | DENY 或升格审批 |
| 网络 | 浏览器/HTTP 类（若现网启用） | 默认拒绝或仅白名单主机 | DENY |
| 受管 MCP | read_gov_document、submit_emergency_notice 等 | 保持 U7 契约 + provenance | 同 U7 |

3. **无 scope 策略（二选一，写进设计并实现一致）**  
   - **推荐 A**：敏感/文件/exec/网络 → **硬 DENY**（原因码中文可展示）  
   - 或 B：仅只读无路径工具可走只读空契约，其余 DENY  
   - 禁止「无 scope 当全开」

4. **与 U9 / Protect / Aegis 边界**：谁管执行隔离、谁管工具面停机、谁管任务权限；不互相冒充。

5. **非目标**：真实 IdP、完整 CaMeL、假大屏、重做双沙箱、静默扩权。

### 阶段 A 自检（须全部 `[x]`）

- [ ] 全量覆盖一节已写入设计文档  
- [ ] 聊天自动绑 scope 的触发点与数据流已写清  
- [ ] 原生工具覆盖表已按仓库实名填写  
- [ ] 无 scope 策略已选定（A 或 B）且 fail-closed  
- [ ] 明确复用 U10 审批/ticket/禁自批/防重放  
- [ ] 标明前置 U7b 已完成  

未全部勾选 → **禁止进入实现**。

---

## 4. 阶段 B — 实现切片

按序交付，每片可测：

### 切片 1：聊天任务自动 scope

- 聊天/会话路径创建或绑定 `task_id` + `allowed_tools` + `resource_prefixes`（或等价字段）
- 模型/客户端**不能**伪造放宽 scope；扩权只能走原审批通道
- 审计：`task_id`、`scope_digest`、`identity_source`、原因码

### 切片 2：原生读/写过 ACL

- 原生读：范围外路径 DENY，且底层读取次数不增加  
- 原生写：范围外 DENY  
- 与 U9 workspaceOnly / 文件桥兼容；不拆除沙箱

### 切片 3：exec / 网络类

- exec：不在 `allowed_tools` 或命令污点 → DENY/审批  
- 网络类：默认 DENY 或严格白名单（与设计表一致）  
- `run_protected_command` / 受管 MCP 仍走闸门，不得双轨放行

### 切片 4：越权审批闭环（全路径）

- 聊天或原生越权 → 待批 → 另一审批人确认 → **单次**放行  
- 自批拒绝；重放拒绝；ticket TTL/digest 绑定保持 U10 语义  
- 通知工具 `submit_emergency_notice` 也受同一任务契约约束（U7b 登记后的现网路径）

### 切片 5：验收脚本与证据

- 扩展 `scripts/verify_identity_task_acl.mjs` **或** 新建 `scripts/verify_identity_task_acl_full.mjs`  
- 更新/新增单测与 live 探针；真实 UI 截图（若涉及面板）

---

## 5. 验收（至少覆盖下列意图，全部 exit 0）

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
$AGPY = '.\modules\agentguard-group2\.venv\Scripts\python.exe'

# 0) 前置：U7b 现网通知工具仍在列表中
node scripts/check_notify_tools_live.mjs

# 1) U10 回归不得回退
node scripts/verify_identity_task_acl.mjs

# 2) 全量覆盖验收（本包；名称可自定但必须存在且语义覆盖）
node scripts/verify_identity_task_acl_full.mjs
```

`verify_identity_task_acl_full.mjs`（或等价）**至少**断言：

| ID | 意图 |
| --- | --- |
| chat-scope-auto | 聊天/会话路径创建任务后自动存在 scope（有 task_id + digest） |
| native-read-deny | 原生读越权 → DENY，read_count 不增加 |
| approve-once | 审批后同动作仅成功执行一次 |
| replay-reject | 重放/二次核销拒绝 |
| no-scope-fail-closed | 无 scope 时按设计 A/B 拒绝（不得放行敏感/文件类） |
| self-approve-deny | 自批仍拒绝 |
| notify-under-contract | 现网已登记的 `submit_emergency_notice` 仍受契约/provenance 约束 |

证据目录：

`local-validation/identity-task-acl-full/<ISO-UTC>/`

含 `README.md`、`report.json`、关键日志、必要截图；审计仍脱敏（无正文/Bearer/HMAC 原文）。

---

## 6. 文档与演示话术

- 更新 `docs/IDENTITY_TASK_ACL_DESIGN.md`（全量覆盖节 + 自检勾选）
- 新建或更新 `docs/U11_TASK_ACL_FULL_VALIDATION.md`（结论、命令、边界）
- 更新 `docs/U10_IDENTITY_TASK_ACL_VALIDATION.md` 或升级表中「未覆盖聊天/原生」旧表述为「见 U11」

**演示话术（更新为一句，须写进交付说明）建议：**

> 「组织身份仍未接入，用的是非生产演示身份源；聊天任务会自动带最小权限范围，原生读写和执行也走同一套任务 ACL——越权要另一人审批，票据只能用一次。」

---

## 7. 完成定义

- 阶段 A 自检全勾；五切片可演示  
- 聊天自动 scope + 原生读越权 DENY + 审批单次 + 无 scope fail-closed 证据齐全  
- U10 回归绿；U7b 通知工具仍在现网列表且受契约约束  
- 不宣称组织 OIDC / 全盘 OS ACL / 恶意代码绝对隔离  

---

## 8. 完成后中文简短交付说明

请用中文输出（可落盘到 `docs/U11_TASK_ACL_FULL_VALIDATION.md` 文首）：

1. 结论：PASS / FAIL；U7b 前置是否满足  
2. 无 scope 策略选型（A 或 B）  
3. 聊天自动绑 scope 的触发点（一句话）  
4. 已覆盖的原生工具实名列表  
5. 验收命令、证据目录、关键截图数  
6. 更新后的演示话术原句  
7. 仍不在范围内的边界（若有）