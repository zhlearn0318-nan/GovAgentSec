# GovAgentSec U1–U9 证据型总验收报告

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

**综合结论：需补强。** 硬门禁通过，核心链路具备演示证据；U4 生产身份与 U7 现网新增工具接入仍为 PARTIAL，不宣称 U1–U9 已全部完成正式交付。

验收时间：2026-11-08 12:27:59 — 2026-11-08 13:06:26（Asia/Shanghai，UTC+8）。目录名使用 UTC。本报告严格按 [U1-U9-ACCEPTANCE.md](F:/揭榜挂帅/GovAgentSec/docs/codex-prompts/U1-U9-ACCEPTANCE.md)，默认只验收、写报告。

本轮执行 30 条命令：26 条必跑、4 条补充 live；另跑 1 条宿主返回封装检查。主清单 PASS 30 / FAIL 0 / PARTIAL 0。源文件修改 0 个；未升级、未 git push、未调用云模型、未生成新 LLM 会话。

## 1. 环境与证据目录

| 项目 | 本轮核验值 |
|---|---|
| OpenClaw | 2026.7.1-2 |
| Node | v24.15.0 |
| Docker | 29.8.2 / linux / amd64 |
| 会话镜像 | govagentsec-session:node20-v1；sha256:8ba499d49f70ed5da80ef18b7063e1448dcfe5730d6a09fe53081ab810c9cfa6 |
| srt | 0.0.81，已安装 Windows 专用账户，CheckOnly 与行为探针分别执行 |
| 会话默认模型 | deepseek/deepseek-flash；本轮不验云账号连通 |
| 安全评审 | 本机 Ollama qwen3:8b，external_review_enabled=false，not-production |
| 内容存储 | govagentsec-trace contentMode=hash |
| 最终引擎 | docker，elevated 禁用 |

总证据：[local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance)。命令与退出码：[commands.json](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/commands.json)；机器可读结论：[acceptance-summary.json](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/acceptance-summary.json)；环境：[environment.json](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/environment.json)；截图/报告来源表：[evidence-index.json](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/evidence-index.json)。

## 2. 硬门禁

| 门禁 | 结果 | 证据及边界 |
|---|---|---|
| 固定宿主 | PASS | environment.json；四层脚本预检 |
| 轨迹/安全评审不出域 | PASS | 本地 mock/禁网启发式、外部端点/重定向/云 Ollama 拒绝；external_requests=0。不是全宿主 DLP 证明 |
| U9 两引擎与同案隔离/切换 | PASS | 三份独立报告及 UI 下分引擎报告，不能用 Verify 全绿替代 |
| srt 真实安装可跑 | PASS | CheckOnly + 原生 exec + 实际安装目录探针 |
| 截图真实 | PASS | evidence-index.json 中 real-openclaw-ui；单元/夹具界面没有伪称现网 |
| 候选不得自动安装 | PASS | 隔离副本测试无 install API/正式目录为空；现网两个候选 installed=false |
| 不改业务策略、切换后复原 | PASS | 配置已备份；临时 docker→srt→docker，最终字节一致；产品源文件哈希一致 |

## 3. U1–U9 逐项结论

| 工作包 / 层 | 状态 | 本轮证据与不足 |
|---|---|---|
| U1 · 权限闸门·准入 | **PASS** | 匿名 / 重复 / 过期页面票据 401，登录合法页 200；真实联合准入良性 allow、投毒 block，安装数 0。 关联命令：U1-panel、U1-aegis-sandbox、U1-live-admission。 |
| U2 · 过程台账 | **PASS** | 31 项核心测试；真实旧 JSONL 的图、边、对比、刷新/侧栏折叠与孤儿提示通过。采集历史异常另列，不伪造 Hook。 关联命令：U2-trace-core、U2-workspace-ui、U2-trace-ui、U2-live-trace。 |
| U3 · 经验自演进 | **PASS** | 46 项治理测试、6 项演进关联测试；真实六轨迹证据副本+测试身份验证发布闸，不重新调用模型。现网测试候选有评分/TopK、allow/block，确认禁用，未安装。 关联命令：U3-governance、U3-real-evolution、U3-release-ui、U3-live-release。 |
| U4 · 权限闸门·身份 | **PARTIAL** | 代码默认开发身份关闭、现网 UI 禁执行/审批且标非生产均通过；但现网受管 MCP 显式保留 loopback_static_dev，组织 OIDC 未接。不能将默认配置守卫通过写成现网生产身份完成。 关联命令：U4-identity、U4-live-identity。 |
| U5 · 四层验收 | **PASS** | 15 项必选检查通过；原四个 -Live 项在打包报告中明确跳过。本轮另跑相应三个 live UI 及宿主返回封装，均单列证据；U9 单独验。 关联命令：U5-four-layer。 |
| U6 · 行为护栏 | **PASS** | 注入输入、恶意工具返回、D004 越权与正常对照；BLOCK→取消→拒绝后续工具，秘密哨兵不进轨迹；实际宿主返回封装补测通过。业务用例仍为合成宿主驱动，不是新 LLM 会话。 关联命令：U6-result、U6-stop、U6-tool-surface。 |
| U7 · 权限闸门·来源与契约 | **PARTIAL** | 来源与任务契约各 10 项通过，文档票据/审批拒绝路径与面板测试通过。新增 submit_emergency_notice 在实现和测试里存在，现网 toolFilter 未包含；尚不能在当前聊天工具菜单演示新增动作。 关联命令：U7-documents、U7-panel、U7-provenance、U7-contract。 |
| U8 · 模型路由/隐私 | **PASS** | 会话默认 deepseek/deepseek-flash；评审回环 qwen3:8b，外部评审关闭。测试无外部证据请求；本轮不测试云账号，不将 mock 评分当作真实 Qwen 标定。 关联命令：U8-routing。 |
| U9 · 会话执行隔离 | **PASS** | 双引擎安装、原生 exec、界内允许、越界读写及网络拒绝、实际目录、页面切换/审计均分开验收；Aegis 准入另行回归。Windows srt 已知限制保留。 关联命令：U9-docker-ready、U9-srt-ready、U9-unit、U9-docker、U9-srt、U9-installed、U9-ui-probe、U9-aegis-regression。 |

## 4. 必跑与补充命令、退出码

以下命令均从仓库根执行。通配符单测在执行器内展开为真实文件列表，完整 argv 留在 commands.json。Aegis 输出目录使用本轮时间戳，避免覆盖旧证据。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
$AGPY = '.\modules\agentguard-group2\.venv\Scripts\python.exe'
$AEGISPY = '.\modules\aegis\.runtime_skill\python.exe'
# 下表 $AGPY / $AEGISPY 命令在 PowerShell 中以前缀 & 执行。
```

| ID | 命令 | exit / 状态 | 秒 | 日志 |
|---|---|---|---:|---|
| U5-four-layer | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Verify-ZhengAn.ps1 -TimeoutSeconds 180` | 0 / PASS | 32.8 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U5-four-layer.log) |
| U1-panel | `node scripts/test_panel_access.mjs` | 0 / PASS | 0.1 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U1-panel.log) |
| U1-aegis-sandbox | `$AEGISPY scripts/verify_sandbox_v2.py --output local-validation/sandbox-check-u1u9-rerun-2026-11-08T04-27-57-764Z` | 0 / PASS | 14.1 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U1-aegis-sandbox.log) |
| U2-trace-core | `node --test modules/govagentsec-trace/test/*.test.mjs` | 0 / PASS | 1.5 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U2-trace-core.log) |
| U2-workspace-ui | `node scripts/test_workspace_ia.mjs` | 0 / PASS | 3.4 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U2-workspace-ui.log) |
| U2-trace-ui | `node scripts/test_trace_audit_ui.mjs` | 0 / PASS | 2.6 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U2-trace-ui.log) |
| U3-governance | `node --test modules/trajectory-governance/test/*.test.mjs` | 0 / PASS | 0.8 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U3-governance.log) |
| U3-real-evolution | `node scripts/test_real_evolution.mjs` | 0 / PASS | 0.1 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U3-real-evolution.log) |
| U3-release-ui | `node scripts/test_evolution_release_gate_ui.mjs` | 0 / PASS | 2.3 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U3-release-ui.log) |
| U4-identity | `$AGPY scripts/test_identity_boundary.py` | 0 / PASS | 1.7 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U4-identity.log) |
| U7-documents | `$AGPY scripts/test_gov_document.py` | 0 / PASS | 3.6 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U7-documents.log) |
| U7-panel | `$AGPY scripts/test_gov_document_panel.py` | 0 / PASS | 3.1 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U7-panel.log) |
| U7-provenance | `$AGPY scripts/test_param_provenance.py` | 0 / PASS | 3.8 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U7-provenance.log) |
| U7-contract | `$AGPY scripts/test_task_privilege_contract.py` | 0 / PASS | 3.5 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U7-contract.log) |
| U6-result | `node scripts/test_result_guard.mjs` | 0 / PASS | 0.1 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U6-result.log) |
| U6-stop | `node scripts/test_runtime_stop.mjs` | 0 / PASS | 0.1 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U6-stop.log) |
| U6-tool-surface | `node scripts/test_protect_tool_surface.mjs` | 0 / PASS | 2.9 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U6-tool-surface.log) |
| U8-routing | `$AGPY scripts/check_model_routing.py` | 0 / PASS | 7.5 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U8-routing.log) |
| U1-live-admission（补充） | `node scripts/test_aegis_admission_demo.mjs` | 0 / PASS | 84.7 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U1-live-admission.log) |
| U2-live-trace（补充） | `node scripts/test_trace_workspace_live.mjs` | 0 / PASS | 12.4 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U2-live-trace.log) |
| U3-live-release（补充） | `node scripts/test_evolution_release_gate_live.mjs` | 0 / PASS | 5.2 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U3-live-release.log) |
| U4-live-identity（补充） | `node scripts/test_identity_live.mjs` | 0 / PASS | 7.6 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U4-live-identity.log) |
| U9-docker-ready | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Ensure-DockerReady.ps1 -CheckOnly` | 0 / PASS | 0.6 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U9-docker-ready.log) |
| U9-srt-ready | `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Ensure-SrtReady.ps1 -CheckOnly` | 0 / PASS | 0.6 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U9-srt-ready.log) |
| U9-unit | `node --test modules/session-sandbox/test/*.test.mjs` | 0 / PASS | 0.2 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U9-unit.log) |
| U9-docker | `node scripts/test_session_sandbox_docker.mjs` | 0 / PASS | 15.1 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U9-docker.log) |
| U9-srt | `node scripts/test_session_sandbox_srt.mjs` | 0 / PASS | 578.7 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U9-srt.log) |
| U9-installed | `node scripts/test_session_sandbox_installed.mjs` | 0 / PASS | 89.8 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U9-installed.log) |
| U9-ui-probe | `node scripts/test_session_sandbox_ui.mjs --probe` | 0 / PASS | 385.2 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U9-ui-probe.log) |
| U9-aegis-regression | `$AEGISPY scripts/verify_sandbox_v2.py --output local-validation/sandbox-check-u9-rerun-2026-11-08T05-06-19-019Z` | 0 / PASS | 7.3 | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U9-aegis-regression.log) |
| U6-host-wrapper（补充） | `node scripts/test_result_guard_host.mjs` | 0 / PASS | — | [日志](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U6-host-wrapper.log) |

四层打包原报告：[report.json](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-59-337Z-48728/report.json)，15 项必选通过；4 项未指定 -Live 的跳过只保留为跳过，未改写为通过。独立补跑的 live 证据在上表。

**中断与复跑记录：** 首次 U9-ui-probe 的执行器及子进程已退出，未留下退出码和最终报告，原因未确定，记为 INTERRUPTED，不计通过。临时引擎停在 srt；续跑先通过现有 UI 恢复 Docker，并确认配置与原备份字节一致，再完整重跑该项。首次日志：[U9-ui-probe.interrupted.log](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U9-ui-probe.interrupted.log)；未完成证据：[首次目录](F:/揭榜挂帅/GovAgentSec/local-validation/session-sandbox/2026-11-08T04-42-37-904Z/ui)。上表记录的是复跑结果，commands.json 同时保留 interruptions 字段。

## 5. U9 专项：同一案例分引擎

| 检查 | Docker | srt |
|---|---|---|
| native_exec_tool | allow | allow |
| allowed_read_write | allow | allow |
| protected_read | DENY_READ:ENOENT | DENY_READ:EPERM |
| outside_write | DENY_WRITE:EROFS | DENY_WRITE:EPERM |
| non_allowlisted_network | DENY_NETWORK:ENETUNREACH | DENY_NETWORK:EACCES |
| file_tool_bridge | inside-allow/outside-deny | inside-allow/outside-deny |

独立报告：[Docker](F:/揭榜挂帅/GovAgentSec/local-validation/session-sandbox/2026-11-08T04-31-14-309Z/docker/report.json)、[srt](F:/揭榜挂帅/GovAgentSec/local-validation/session-sandbox/2026-11-08T04-31-29-412Z/srt/report.json)；实际安装目录：[installed](F:/揭榜挂帅/GovAgentSec/local-validation/verify/2026-11-08T04-27-57-764Z-u1u9-acceptance/U9-installed-deployment-srt-report.json)；页面切换及每次切换后探针：[UI+probe](F:/揭榜挂帅/GovAgentSec/local-validation/session-sandbox/2026-11-08T04-59-53-878Z/ui/report.json)。UI 报告 switches 中两个 isolation_probe_passed 均需为 true，最终恢复 docker，audit_verified=true。

原生 exec 实测耗时：Docker 372 ms，srt 99515 ms。这是本轮探针启动与执行的测量，不是模型响应耗时。Docker 核验实际 HostConfig：{"network":"none","readonly_root":true,"cap_drop":["ALL"],"privileged":false,"memory":536870912,"pids":128,"binds":["F:\\揭榜挂帅\\GovAgentSec\\local-validation\\session-sandbox\\2026-11-08T04-31-14-309Z\\docker\\runtime\\workspaces\\agent-main-dashboard-u9-docker-1-773238ab:/workspace:ro,z"]}。

读取拒绝的机制不同：Docker 的 DENY_READ:ENOENT 表示宿主保护路径没有挂入容器，不是对已挂载文件验证 ACL；srt 对实际存在的合成文件返回 EPERM。网络对照分别为 Docker 网络命名空间不可达与 srt 系统权限拒绝。本轮未把不存在的 Docker 路径包装成文件内容级授权测试。

**两个沙箱不可混称：** Aegis 是 Skill 安装前 Docker 试跑；U9 是运行中的会话执行隔离。本轮 verify_sandbox_v2.py 按两节分别执行，Python/Node/Shell 回归单列，不能替代 U9 会话工具探针。

**Windows srt 边界：** 启动权限检查慢；已知 anonymous-loopback 例外可能允许主动匿名令牌模拟访问回环端口，allowRead 不是全盘读取白名单。只对明确保护路径及写入边界作已验证声明，默认保持 Docker。Docker 工作区只读，写入对照在临时 /tmp；镜像为 Node/shell，非完整办公软件环境。MCP 服务与模型 API 在网关侧，不据此声称全部插件进程均已进入容器。

## 6. 现网数据与测试证据的区分

- 真实旧 JSONL 被实际 UI 打开：e820b9a1-e1eb-416c-b5ea-a3b1600d0090、4af42d89-727a-45cb-b1b0-5f6406699928；孤儿事件 979f4fb8-fef9-407e-ae8a-989240739b47 明示不可入选。本轮没有补造 Hook，也没有重新采集模型会话。
- 现网共 48 条轨迹、complete 20、partial 6、已评分 8。12 条采集缺失历史记录集中在 2026-11-07T03:47:46.946Z 至 2026-11-07T03:47:51.083Z，本轮新增 0。页面提示真实存在；没有清掉记录让界面变绿。
- 现网候选：fixture-poisoned-candidate：admitted_block，参与 0、安全 0、隔离 0，公共步骤 0，TopK 缺失/缺失，test_only=true，installed=false；expense-word-candidate：admitted_allow，参与 6、安全 5、隔离 1，公共步骤 6，TopK 4/5，test_only=true，installed=false。两张卡确认均禁用，旧候选缺快照时只引用当前本地评分，不能冒充生成时冻结证据。
- U3 发布闸交互测试采用真实六轨迹的隔离副本和测试管理员上下文；不是现网组织审批。`test_real_evolution.mjs` 本身是合成结构的关联/隔离单测，名称不能作为重新跑真实模型的证明。
- U8 `source=synthetic-local-routing-smoke`；外部请求数 0，Ollama 协议为本地 mock，断网回退为启发式。已核对远端 endpoint、重定向、伪装本地云模型的拒绝路径，但没有声称本轮重新校准真实模型 Q/S 或验证云账号。
- U9 是实际固定宿主工具和 OS/容器执行，输入为合成文件；报告明确 synthetic_data=true，非真实业务文档。真实页面 PNG 与离线 UI 测试不混用。

## 7. 阻塞项与补强建议（本轮未修复）

| 级别 | 问题 / 证据 | 对演示或交付的影响 | 建议与工作量估计 |
|---|---|---|---|
| P0 硬门禁 | 本轮无 FAIL | 不据此宣称生产交付完成 | 保留完整新跑证据 |
| P1 · 正式交付阻塞 | U4 现网受管 MCP=loopback_static_dev；组织 OIDC/逐用户委托未接 | 仅可标非生产演示，不能验组织主体授权 | 取得 issuer/audience/角色映射后接入与联调，约 1–3 工作日；不含等待身份源时间 |
| P1 · 现场功能缺口 | U7 新增 submit_emergency_notice 不在现网 toolFilter；任务契约未自动逐 run 绑定 | 当前 OpenClaw 聊天不能演示新增通知受管动作与完整用户授权链 | 经授权接入已有合成工具并补真实受管短链；约 0.5–1 天，组织授权联调另计 |
| P2 · 演示证据/可用性 | 现网候选仍 test_only；毒候选无评分记录，旧候选不是生成时冻结快照；12 条历史采集失败常驻提示 | 安全拒绝正确，但现场不能说是已发布生产 Skill 或当前采集全绿 | 准备明确来源的新演示证据副本/日期筛选及说明，约 0.5 天；不删除原审计 |
| P2 · 引擎能力边界 | srt Windows 启动慢、匿名回环例外；Docker 只读工作区与临时输出 | 不适合承诺完整恶意代码隔离或低延迟办公全流程 | 演示默认 Docker；srt 作受限对照。上游/平台边界无可靠修复工期 |
| P2 · 页面与防护范围 | 实际设置页仍显示宿主更新提示，回复检查标为“复检 / 观察” | 固定版本未漂移，但交付观感仍有提示；不能把工具返回阻断宣传成所有流式回复都在发送前被完整门控 | 固定版本提示另行产品化；明确工具返回门控与流式文本边界，约 0.5 天核对演示文案 |

## 8. 配置变更与宣传边界

配置备份仅在仓库外：`C:\Users\23684\.openclaw\openclaw.json.before-u1u9-acceptance-2026-11-08T04-27-57-764Z`。本轮仅 U9 必需的真实切换临时修改引擎；最终语义一致=true，字节一致=true，前后 SHA-256：`0b6a24718f17312c9ab5aaa1d9f344b0508dbfc70ff8784681266875acbe3374` / `0b6a24718f17312c9ab5aaa1d9f344b0508dbfc70ff8784681266875acbe3374`。未修改产品代码（0 个哈希变化）、业务策略、模型凭据或远端；没有重启/升级服务来掩盖失败。测试产生的合成准入审计、隔离工作区、切换审计和报告正常保留。

会话主模型可走云 API；轨迹安全评审/演进门控默认本地，两者不是同一数据出口保证。`admission_passed` 不是发布/安装；工程上能验、能讲、能挡住本轮攻击，不等于完整 CaMeL/ToolFence 等论文 SOTA。无组织 OIDC 不宣称生产身份完成；srt Windows 不宣称恶意代码完全隔离。

**最终结论：需补强。** 可以按合成数据、非生产身份、候选未发布的口径演示核心链路；补齐 U4/U7 的现网交付缺口后，再做正式整体验收。

## 9. U7b 后续补记（2026-11-08，保留上述原验收事实）

U7 的「submit_emergency_notice 未入现网 toolFilter」登记缺口已由 U7b 补齐。现网 include、全局/沙箱 alsoAllow、build_config 生成源和 MANAGED_TOOLS 已同步，实际 MCP 清单与现网工作台可见。11 项 U7b 验收全部 exit 0，含 U6/U7/U9 相关回归。

证据：`local-validation/u7b-notify-live/2026-11-08T06-18-53-362Z/`；详见 [U7B_NOTIFY_TOOLS_LIVE.md](U7B_NOTIFY_TOOLS_LIVE.md)。本次先备份后修改配置并重载，保留新登记；身份模式与其他字段不变。原报告时刻“未修改现网”的事实不回写。

只补工具登记与必要拒绝接线，不等于 U7/组织 OIDC 全量生产验收完成；聊天 run 自动契约与原生工具 ACL 仍待 U11。通知仅合成送审账本，不接真实邮件/短信，未发送模型聊天或外发轨迹。
