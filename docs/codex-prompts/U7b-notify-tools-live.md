# Codex 提示词 U7b：通知工具进现网工具列表

## 0. 角色与总目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2（禁止升级）**。默认不 git push、不外发轨迹到外部 API。

**本包只做一件事**：把 U7 已实现、测试已绿、但未进现网菜单的受管通知工具 **登记进现网工具列表（toolFilter / 相关 allowlist）**，使生产/演示聊天路径能看到并调用该工具，同时仍受 privilege contract / provenance / tool-surface / 闸门约束。

验收报告原文（必须对齐口径）：
> U7 新增 `submit_emergency_notice` 在实现和测试里存在，现网 `toolFilter` 未包含；尚不能在当前聊天工具菜单演示新增动作。

**禁止**：重做 U7 行为约束内核；不接真实组织 OIDC；不重做 U9 双沙箱；不宣称「全工具已托管」；不新增默认放行旁路。

---

## 1. 必读（动手前全部读完）

- `docs/U1-U9-ACCEPTANCE-REPORT.md`（U7 PARTIAL / P1 缺口）
- `docs/BEHAVIOR_CONSTRAINT_SOTA_UPGRADE.md`（明确写过：本轮未改现网 toolFilter）
- `docs/codex-prompts/U7-behavior-constraint-sota.md`
- `docs/UPGRADE_ROUND_VALIDATION.md` 中 U7 / 通知工具小节
- 实现与接线（按实文件，勿臆造）：
  - `modules/agentguard-group2/integrations/openclaw_mcp/server.py`（`NOTICE_TOOL_NAME = 'submit_emergency_notice'`）
  - `modules/agentguard-group2/integrations/openclaw_mcp/agentguard_client.py`
  - `modules/agentguard-group2/integrations/openclaw_mcp/openclaw-config.example.json`（**示例已含** `submit_emergency_notice`，现网未同步）
  - `scripts/build_config.py` → `mcp.servers.agentguard-notices.toolFilter.include`（生成侧缺项）
  - 现网配置：`%USERPROFILE%\.openclaw\openclaw.json` → `mcp.servers.agentguard-notices.toolFilter.include`
  - `.runtime/config-batch.json`（若仍为交付批次产物，按需同步，勿无脑覆盖无关字段）
  - `modules/session-sandbox/policy.mjs` → `MANAGED_TOOLS`（沙箱保留受管工具名单，当前**缺** `agentguard-notices__submit_emergency_notice`）
  - `modules/trajectory-governance/task-links.mjs` / `modules/govagentsec-trace/register.mjs`（轨迹映射已含 `submit_emergency_notice` → `notification.submit`，核对即可）
  - 测试：`scripts/test_param_provenance.py`、`scripts/lib/behavior_constraint_live.py`、`scripts/demo_behavior_constraint.mjs`、`scripts/test_workspace_ia.mjs`

---

## 2. 硬约束

1. **不升级 OpenClaw**；不 push；轨迹原文不外发外部 API。
2. **只补登记与必要接线**，不重写 U7 provenance / privilege contract / OPA / 审批。
3. **fail-closed**：无业务身份 / 无任务契约 / 无票据时，通知工具不得静默执行；敏感参数仍走 provenance；收件人/模板白名单不变（`duty_office` / `synthetic_external_office` + `typhoon_notice`）。
4. **无真实外发**：仍只写合成送审账本；UI/文档禁止写成「已对接真实短信/邮件通道」。
5. 改现网 `openclaw.json` 前：**备份**并记录前后哈希；验收后若需恢复，给出可执行恢复步骤；尽量不改与工具表无关的网关字段。
6. 改完后若 MCP 需重载才能出现在聊天工具菜单：用仓库既有安全方式 reload/restart（若有），并在交付说明写清；禁止破坏性清状态。

---

## 3. 阶段 0 — 盘点（先写清，再改）

在动手改配置前，产出一份盘点（可写入交付文档开头）：

| 项 | 要求 |
| --- | --- |
| 新通知工具名 | 至少确认 `submit_emergency_notice`（MCP 短名）；完整观测名一般为 `agentguard-notices__submit_emergency_notice` |
| 已登记位置 | MCP server 工具清单、example `toolFilter`、轨迹 action 映射、单测 |
| 现网缺项 | 现网 `openclaw.json` 的 `toolFilter.include` **不含** `submit_emergency_notice`；`build_config.py` 生成列表也不含；`session-sandbox/policy.mjs` 的 `MANAGED_TOOLS` 也不含完整名 |
| 是否还有其它 U7 新工具未进现网 | 以 MCP `tools/list` 与代码为准；本验收报告点名的是通知工具；若另有遗漏，一并列出但优先修通知工具 |

盘点结论写入：`docs/U7B_NOTIFY_TOOLS_LIVE.md`（本包新建）。

---

## 4. 实现要求

### 4.1 现网 / 生成侧登记（必须）

1. 将 `submit_emergency_notice` 加入：
   - 现网 `%USERPROFILE%\.openclaw\openclaw.json` → `mcp.servers.agentguard-notices.toolFilter.include`
   - 仓库生成源 `scripts/build_config.py` 中对应 `include` 列表（避免下次安装又丢）
   - 若交付流程依赖 `.runtime/config-batch.json`，同步该路径下 `agentguard-notices.toolFilter.include`（**只改 include，不改无关 path**）
2. 确认 `mcp.servers.agentguard-notices.enabled` 在演示验收时为可演示状态；若验收前为关，验收后按备份恢复，并在报告写明。
3. **不要**为了「看起来能调」而放宽 `AGENTGUARD_MCP_IDENTITY_MODE`、塞入 `AGENTGUARD_MCP_DEV_SUBJECT_FILE` 长期开着、或关闭 OPA。

### 4.2 沙箱保留名单（必须核对）

- 更新 `modules/session-sandbox/policy.mjs` 的 `MANAGED_TOOLS`，加入 `agentguard-notices__submit_emergency_notice`，行为与现有五个受管工具一致：**仅在已被授权时保留**，不新增旁路授权。
- 跑既有 session-sandbox / installed 相关冒烟，确认不回退 U9。

### 4.3 工作台 / 工具面（核对）

- `toolCoverage` / 工作台「未受 AgentGuard 闸门」逻辑：登记后，该工具应显示为 **受管**；`exec` 等原生工具仍可标未受管。
- Protect tool-surface：通知工具调用失败仍须能独立停后续工具（不削弱 U6）。

### 4.4 非目标

- 不实现真实外发通道；不接组织 OIDC；不自动给每个聊天 run 绑任务契约（那是 **U11**）；不升级宿主。

---

## 5. 验收命令（全部 exit 0）

在仓库根目录执行（PowerShell）。`$AGPY` 指 `modules\agentguard-group2\.venv\Scripts\python.exe`。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
$AGPY = '.\modules\agentguard-group2\.venv\Scripts\python.exe'

# A. 现网列表检查（本包新增或扩展；失败即非 0）
# 要求：读 %USERPROFILE%\.openclaw\openclaw.json，断言
# mcp.servers.agentguard-notices.toolFilter.include 含 submit_emergency_notice；
# exclude 未排除它；并写出 JSON 证据。
node scripts/check_notify_tools_live.mjs
# 若文件名不同，必须在交付说明写清真实脚本名，且语义等价。

# B. U7 回归不得回退
& $AGPY scripts\test_param_provenance.py
& $AGPY scripts\test_task_privilege_contract.py
& $AGPY scripts\test_gov_document.py
node scripts\demo_behavior_constraint.mjs
node scripts\test_workspace_ia.mjs
node scripts\test_protect_tool_surface.mjs

# C. 沙箱名单 / 安装态冒烟（有则跑）
node scripts\test_session_sandbox_installed.mjs

# D. （可选但推荐）MCP tools/list 实查：stdio 或现网已启用时，列表含 submit_emergency_notice
```

另建一键汇总（推荐）：`node scripts/verify_u7b_notify_live.mjs`，把上述命令退出码写入证据目录。

---

## 6. 证据与文档

证据目录（时间戳子目录）：

`local-validation/u7b-notify-live/<ISO-UTC>/`

至少包含：
- `README.md`（中文结论、复跑命令、是否改过现网哈希）
- `report.json`（各检查 exit_code / PASS|FAIL）
- `openclaw-toolfilter-before.json` / `openclaw-toolfilter-after.json`（或脱敏摘录 include 列表）
- `openclaw-hash-before.txt` / `openclaw-hash-after.txt`
- 若改了现网：`restore-steps.md`（如何用备份恢复到验收前逐字节一致）
- 可选：聊天工具菜单或工作台 tool_coverage 截图 1–2 张（真实 UI，禁止假图）

文档：
- 新建 `docs/U7B_NOTIFY_TOOLS_LIVE.md`（盘点 + 改动 + 验收 + 恢复）
- 更新 `docs/UPGRADE_ROUND_VALIDATION.md` / `docs/BEHAVIOR_CONSTRAINT_SOTA_UPGRADE.md` 中「未改现网 toolFilter」旧表述
- 若 `docs/U1-U9-ACCEPTANCE-REPORT.md` 需标注「U7b 已补登记」，可追加一节**补记**，不要篡改原验收时间戳事实

---

## 7. 完成定义

- 现网 `toolFilter.include` **含** `submit_emergency_notice`，且生成源 `build_config.py` 已同步
- `MANAGED_TOOLS` 含完整观测名；U7/U6/工作台相关测试全绿
- 无身份/无契约/污点参数路径仍阻断或升格审批（fail-closed）
- 证据目录完整；交付说明写清哈希变化与恢复步骤
- **不**宣称组织 OIDC 已接；**不**宣称真实外发；**不**宣称 U11 全量任务覆盖已完成

---

## 8. 完成后中文简短交付说明

请用中文输出（可落盘到 `docs/U7B_NOTIFY_TOOLS_LIVE.md` 文首摘要）：

1. 结论：PASS / FAIL  
2. 现网加入的工具名列表  
3. 改动的文件路径（含是否改了 `%USERPROFILE%\.openclaw\openclaw.json`）  
4. 配置哈希：改前 / 改后；是否已恢复或保留  
5. 验收命令与证据目录路径  
6. 剩余边界（明确：聊天 run 自动绑契约 / 原生工具全量 ACL 交给 U11）