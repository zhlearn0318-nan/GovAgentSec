# Codex 提示词：U1–U9 总验收（证据型，默认不改产品代码）

日期基线：2026-11-08  
仓库：`F:\揭榜挂帅\GovAgentSec`  
宿主锁定：**OpenClaw 2026.7.1-2**（禁止建议升级）  
产品叙事四层「政安纵深」：行为护栏 / 权限闸门 / 过程台账 / 经验自演进  
对照总方案：[`../UPGRADE_PLAN_政安纵深.md`](../UPGRADE_PLAN_政安纵深.md)  
既有轮次记录：[`../UPGRADE_ROUND_VALIDATION.md`](../UPGRADE_ROUND_VALIDATION.md)  
会话沙箱说明：[`../SESSION_SANDBOX_DEMO.md`](../SESSION_SANDBOX_DEMO.md) / [`../SESSION_SANDBOX_PLAN.md`](../SESSION_SANDBOX_PLAN.md)

## 1. 角色与目标

你是**验收官**，不是开发者。

1. 逐条对照 `docs/codex-prompts/U1-*.md` … `U9-*.md` 与下文硬门禁做**证据型验收**。
2. **默认只验收 + 写报告**；除非用户本轮明确授权修复阻断级缺陷，否则**不要改产品代码、不要改 openclaw.json 业务策略、不要 git push、不要升级 OpenClaw**。
3. 失败如实记：命令、退出码、关键日志路径；不得删断言、把跳过算通过、用自绘假 UI / Pillow 示意图冒充现网截图。
4. 证据可复制到 `F:\揭榜挂帅\评委演示素材\验收与证据\`（不要往桌面堆）。仓库内证据优先落在 `local-validation/verify/` 与既有模块目录。

## 2. 范围与四层映射

| 工作包 | 名称 | 主要映射层 | 提示词 |
| --- | --- | --- | --- |
| U1 | Aegis 深链与安装前阻断 | 权限闸门（准入） | `U1-aegis-deep-link-admission.md` |
| U2 | 过程台账常驻工作区 | 过程台账 | `U2-trace-workspace-embed.md` |
| U3 | 经验自演进发布闸 UI | 经验自演进 | `U3-evolution-release-gate-ui.md` |
| U4 | 身份边界产品态 | 权限闸门 | `U4-identity-product-guardrails.md` |
| U5 | 四层一键验收 | 横切（文档/复检） | `U5-four-layer-verify.md` |
| U6 | 行为护栏政务工具面 | 行为护栏 | `U6-protect-tool-surface.md` |
| U7 | 权限闸门 SOTA（来源门/契约/受管面） | 权限闸门 | `U7-behavior-constraint-sota.md` |
| U8 | 会话 API + 本地安全评审双轨 | 横切（模型路由/隐私） | `U8-session-api-local-review.md` |
| U9 | 会话沙箱双引擎 Docker+srt + 切换 | 行为护栏 / 运行时隔离 | `U9-sandbox-network-isolation-demo.md` |

**区分（必写进报告）：**

- **Aegis 准入沙箱**（Skill 安装前 Docker 试跑，`network_mode none`，`verify_sandbox_v2.py`）≠ **会话执行沙箱**（U9，`agents.defaults.sandbox` + `govagentsec-session-sandbox`）。
- **会话主模型**可走先进云端 API（如 DeepSeek）；**轨迹安全评审 / 自演进门控默认本地模型**，轨迹原文/评分证据**不得**发外部 API。

## 3. 硬门禁（任一 FAIL 则综合不可宣称「可演示验收完成」）

1. OpenClaw 版本仍为 `2026.7.1-2`。
2. 轨迹 / 评审路径不出域：`check_model_routing.py` 与相关报告字段证明无外部轨迹外发。
3. U9：Docker **与** srt **均已安装可跑**；产品有 `docker` ↔ `srt` 切换入口；**同一越界案例两引擎各验一遍**且有分引擎证据。
4. srt **不是可选**；不得只写文档或只留脚本未安装。
5. 不自绘假 UI；截图必须来自真实 OpenClaw Control UI / 工作台。
6. `admission_passed` ≠ 自动安装；候选发布闸不得自动装 Skill。
7. 验收过程默认不改配置策略；若为复现必须改，须备份、复原，并在报告写明。

## 4. 逐 U 检查清单

对每项标 `PASS` / `FAIL` / `PARTIAL`，附证据路径。

### U1 — Aegis 深链与安装前阻断
- [ ] 提示词与实现：`modules/aegis/.../aegis-admission-ui` 插件已启用
- [ ] 匿名深链 / 过期或二次 token / 样例包联合准入 block 有证据
- [ ] 命令：`node scripts/test_panel_access.mjs`；可选 live：`node scripts/test_aegis_admission_demo.mjs`
- [ ] `scripts/verify_admission.py`（或既有 admission 报告）可读
- [ ] 演示可讲：安装前中文阻断原因 + 审计回执

### U2 — 过程台账常驻工作区
- [ ] 工作台/审计中心可达调用图、对比、候选入口
- [ ] `node --test modules/govagentsec-trace/test/*.test.mjs`
- [ ] `node scripts/test_workspace_ia.mjs`
- [ ] `node scripts/test_trace_audit_ui.mjs`（或 live：`test_trace_workspace_live.mjs`）
- [ ] 空态/孤儿事件中文文案存在；无伪造 Hook

### U3 — 经验自演进发布闸 UI
- [ ] 候选车间：评分/TopK、隔离原因、联合准入、人工确认、**不自动安装**
- [ ] `node --test modules/trajectory-governance/test/*.test.mjs`
- [ ] `node scripts/test_real_evolution.mjs`
- [ ] `node scripts/test_evolution_release_gate_ui.mjs`（或 live 版）
- [ ] 身份不足时确认禁用有产品说明

### U4 — 身份边界产品态
- [ ] 默认禁用开发身份；UI 不宣称已完成组织 OIDC
- [ ] `.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_boundary.py`
- [ ] 本地演示开关若存在：默认关、标红、写审计

### U5 — 四层一键验收
- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-ZhengAn.ps1` → exit 0
- [ ] 产出 `local-validation/verify/<timestamp>/report.json` + `report.md`
- [ ] 可选：同脚本 `-Live`（现网四项；缺依赖不得伪装成功）
- [ ] **注意**：当前 Verify 清单**未内置 U9 会话沙箱**；U9 须按第 7 节单独跑，不得因 Verify 全绿就省略 U9

### U6 — 行为护栏政务工具面
- [ ] `node scripts/test_result_guard.mjs`
- [ ] `node scripts/test_runtime_stop.mjs`
- [ ] `node scripts/test_protect_tool_surface.mjs`（注入输入 / 恶意返回 / 越权读 + 正常对照）
- [ ] 轨迹无秘密哨兵原文；BLOCK → stopRun 链路成立

### U7 — 权限闸门 SOTA
- [ ] 参数 provenance / 任务最小权限契约测试存在且绿
- [ ] `python scripts\test_param_provenance.py`（用 AgentGuard venv）
- [ ] `python scripts\test_task_privilege_contract.py`
- [ ] `python scripts\test_gov_document.py` + `test_gov_document_panel.py`
- [ ] 面板对未知来源/未受管工具标红；不扩大默认放行面

### U8 — 会话 API + 本地评审
- [ ] `config/model-routing.json` 与 `docs/MODEL_ROUTING.md` 一致描述双轨
- [ ] `.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\check_model_routing.py` → passed
- [ ] 会话可配置云端；评审/演进默认本地；轨迹不出域
- [ ] 不要求本轮必须对现网发真实云请求；若未切换现网，报告写清「实现验收 vs 现网激活」边界

### U9 — 会话沙箱双引擎（专项见 §7）
- [ ] `Ensure-DockerReady` / `Ensure-SrtReady` 可 CheckOnly 通过
- [ ] `modules/session-sandbox` 插件启用；`agents.defaults.sandbox` 存在
- [ ] UI/RPC 可在 docker↔srt 切换并写审计
- [ ] 同一越界剧本两引擎分目录证据
- [ ] Aegis `verify_sandbox_v2` 回归仍绿（准入≠会话）
- [ ] 文档已写明 srt Windows 限制（匿名回环等），不夸大成完美隔离

## 5. 必跑命令清单（仓库真实路径）

在仓库根执行。失败保留日志；长命令可设合理超时，但不得无证据跳过。

### 5.1 四层打包（U5 / 覆盖 U4–U8 多项）
```powershell
Set-Location "F:\揭榜挂帅\GovAgentSec"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-ZhengAn.ps1 -TimeoutSeconds 180
# 可选现网：
# powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-ZhengAn.ps1 -Live
```

### 5.2 U1 / 准入与面板
```powershell
node scripts/test_panel_access.mjs
# 可选深链 live（需服务）：node scripts/test_aegis_admission_demo.mjs
# 准入沙箱回归（Aegis，≠会话沙箱）：
.\modules\aegis\.runtime_skill\python.exe .\scripts\verify_sandbox_v2.py --output .\local-validation\sandbox-check-u1u9-rerun
```

### 5.3 U2 / U3 台账与演进
```powershell
node --test modules/govagentsec-trace/test/*.test.mjs
node scripts/test_workspace_ia.mjs
node scripts/test_trace_audit_ui.mjs
node --test modules/trajectory-governance/test/*.test.mjs
node scripts/test_real_evolution.mjs
node scripts/test_evolution_release_gate_ui.mjs
```

### 5.4 U4 / U7 身份与闸门
```powershell
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_boundary.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_gov_document.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_gov_document_panel.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_param_provenance.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_task_privilege_contract.py
```

### 5.5 U6 行为护栏
```powershell
node scripts/test_result_guard.mjs
node scripts/test_runtime_stop.mjs
node scripts/test_protect_tool_surface.mjs
```

### 5.6 U8 模型路由
```powershell
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\check_model_routing.py
```

### 5.7 U9 会话沙箱（必跑）
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Ensure-DockerReady.ps1 -CheckOnly
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Ensure-SrtReady.ps1 -CheckOnly
node --test modules/session-sandbox/test/*.test.mjs
node scripts/test_session_sandbox_docker.mjs
node scripts/test_session_sandbox_srt.mjs
node scripts/test_session_sandbox_installed.mjs
node scripts/test_session_sandbox_ui.mjs --probe
# 完整 UI 切换（较慢，需登录态/网关）：node scripts/test_session_sandbox_ui.mjs
.\modules\aegis\.runtime_skill\python.exe .\scripts\verify_sandbox_v2.py --output .\local-validation\sandbox-check-u9-rerun
```

若某脚本「应存在但缺失」：该项标 FAIL，并写明期望路径。

## 6. 输出物

1. 新建带时间戳报告（二选一或都写）：
   - `docs/U1-U9-ACCEPTANCE-REPORT-YYYYMMDD-HHMM.md`
   - 和/或 `local-validation/verify/<timestamp>/U1-U9-ACCEPTANCE-REPORT.md`
2. 报告必须含：
   - 环境：OpenClaw 版本、Docker 版本/镜像、srt 版本（期望 0.0.81）、机器时区说明
   - U1…U9 逐项：`PASS|FAIL|PARTIAL` + 命令 + 退出码 + 证据路径
   - 硬门禁核对表
   - **阻塞项**列表（按严重度）
   - 综合结论（见 §8）
3. 可将关键 `report.json` / 截图复制到 `F:\揭榜挂帅\评委演示素材\验收与证据\U1-U9-<日期>\`。

## 7. U9 专项（不得省略）

必须同时满足：

| 项 | 期望 |
| --- | --- |
| Docker 可跑 | `Ensure-DockerReady -CheckOnly` 成功；镜像 `govagentsec-session:node20-v1` 存在；隔离探针越界 DENY + 界内 ALLOW |
| srt 可跑 | 仓库内 `modules/session-sandbox` 依赖安装；CLI `--version` = `0.0.81`；`Ensure-SrtReady -CheckOnly` 成功；隔离探针越界 DENY |
| 切换入口 | 防护设置/工作台可见；管理员 RPC 可保存；审计有记录；最终可恢复默认 docker |
| 同一越界案例 | 两引擎各一份 `report.json`（protected read / outside write / network） |
| 与准入区分 | `verify_sandbox_v2` 仍作为 Aegis 准入回归，不得与会话沙箱混为一谈 |
| 已知限制 | srt Windows 匿名回环等写入报告「边界」，不得隐瞒也不得夸大 |

参考既有绿证（复验时以**本轮新跑**为准）：  
`local-validation/session-sandbox/2026-11-08T03-09-38-600Z/ui/`、`.../04-10-22-288Z/ui/`、`deployment-srt-report.json`。

## 8. 综合结论模板

在报告末尾三选一（可附条件）：

- **可演示**：硬门禁全过；U1–U9 无阻断级 FAIL；现场可用四层报告 + U9 双引擎证据讲解。
- **需补强**：核心可讲，但存在 PARTIAL/非阻断 FAIL（列出补强清单与预估）。
- **不可验收**：硬门禁失败，或 U9 缺一引擎/无切换/无双引擎越界证据，或轨迹出域，或宿主版本漂移。

口径提醒（写入报告「宣传边界」）：

- 工程交付「能验、能讲、能挡住一批演示攻击」≠ 宣称已达 CaMeL/ToolFence 等论文全量 SOTA。
- 无组织 OIDC 时不得宣称生产身份验收完成。
- srt Windows 不得宣称恶意代码完全隔离保证。

## 9. 给用户的一句话启动示例（Windows）

把本文件全文交给 Codex，或：

```bat
cd /d F:\揭榜挂帅\GovAgentSec
codex exec -C "F:\揭榜挂帅\GovAgentSec" "请严格按 docs/codex-prompts/U1-U9-ACCEPTANCE.md 做 U1-U9 证据型总验收：默认不改产品代码；跑文内必跑命令；输出 docs/U1-U9-ACCEPTANCE-REPORT.md 与 local-validation/verify 下带时间戳副本；U9 双引擎与切换必须单独验；最后给可演示/需补强/不可验收结论。"
```

（若本机 `codex` CLI 参数不同，保持 `-C` 指向仓库根，并明确「只验收+写报告」。）