# 升级轮次验收

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

## U9：会话执行沙箱双引擎（2026-11-08）

已在本机安装 srt 0.0.81 原生 Windows 运行时、构建 Docker 专用镜像，注册 `govagentsec-session-sandbox` 插件，并在工作台 / 防护设置加入管理员切换入口。默认 Docker，OpenClaw 保持 **2026.7.1-2**。实现和复跑命令见 [SESSION_SANDBOX_DEMO.md](SESSION_SANDBOX_DEMO.md)。

最终联合验收命令 `node scripts/test_session_sandbox_ui.mjs --probe` **exit 0**。真实登录页面依次选择 srt、Docker，每次保存后运行固定宿主的原生 exec 工具与后端探针，最终恢复 Docker。两引擎各 **6 项检查通过**，并验证配置保存、页面显示、刷新、非法参数拒绝和切换审计。没有发送聊天或外部模型请求。

| 证据 | 路径 / 结果 |
| --- | --- |
| UI 与切换总报告 | `local-validation/session-sandbox/2026-11-08T03-09-38-600Z/ui/report.json`，passed=true，两个 isolation_probe_passed=true |
| Docker 隔离报告 | 同目录 `docker/report.json`，原生 exec 442 ms，越界 ENOENT / EROFS，网络 ENETUNREACH；实际 HostConfig 验证 network=none、只读根、非特权、cap-drop ALL、512 MB、128 PID |
| srt 隔离报告 | 同目录 `srt/report.json`，原生 exec 99502 ms，越界 EPERM、网络 EACCES；版本 0.0.81 |
| 真实页面截图 | 同目录 `docker.png`、`srt.png`，已查看；无网关令牌 |
| 配置保留比对 | `local-validation/session-sandbox/config-preservation.json`，gateway / models / hooks / mcp / skills / 既有 plugins 均保留 |
| 实际工具策略 | `local-validation/session-sandbox/effective-tool-policy.json`，原受管文档与公告工具仍获准，browser/gateway 仍禁止 |
| Aegis 准入回归 | `local-validation/sandbox-check-u9-20261108/summary.json`，Python / Node / Shell 全部 ALLOW，exit 0 |

`node --test modules/session-sandbox/test/*.test.mjs scripts/test_result_guard.mjs scripts/test_runtime_stop.mjs scripts/test_ui_release.mjs`：**21/21 通过**。覆盖保留既有安全模块配置、宿主旁路拒绝、保留更严格白名单、切换失败不落盘、审计不含凭据、路径与目录链接逃逸拒绝、srt 参数边界，以及原 BLOCK 停止、错误复检、页面回归。`node scripts/test_workspace_ia.mjs`：exit 0，13 项原有工作区交互检查通过。

安装命令 `Ensure-DockerReady.ps1`、`Ensure-SrtReady.ps1` 均已实际运行成功，未仅提交脚本。首次 srt 重装遇到本机全局 npm 缓存 EEXIST/ENOENT；安装脚本改用 `local-validation/session-sandbox/npm-cache`，原样复跑成功，不清理全局缓存。浏览器和目录链接单测首次在工具受限环境启动失败，正常 Windows 权限下原样复跑通过，没有删断言或把跳过算通过。

修复的真实缺口：固定宿主 `workspaceAccess=none` 将工作区挂成只读，Docker 写入对照改用容器 tmpfs；srt 权限初始化超过原 45 秒探针时限，明确使用有上限的长等待，错误不静默吞掉；原生 exec 自带 HOME/OPENCLAW_SHELL，适配器允许这些内建字段但不转发敏感环境；broker 与 srt holder 同进程，避免宿主取消后留下独立执行子进程；启用原生沙箱后额外工具白名单会隐藏受管 MCP，现只保留之前已授权的已知受管工具，并尊重已有更严格 allow/deny。

**边界：** 报告 source 为 `real-openclaw-sandbox-context`，调用真实固定宿主执行工具和 OS 隔离，但输入是合成文件，没有新建 LLM 驱动会话。srt Windows 有匿名令牌回环连接残余限制，且单次启动约 100 秒；页面和文档均已说明，不能作为恶意代码完全隔离保证。Docker 只读工作区、临时目录输出、镜像只含 Node/shell；没有宣称 Python/办公产物交付完善。MCP 服务进程和模型 API 不受这个会话网络命名空间约束，AgentGuard 链路保持原样。

本机 OpenClaw 配置写前均留备份；本轮仅新增隔离插件及会话隔离/工具边界配置，没有升级宿主或 git push。没有修改 Group1、AgentGuard、Aegis、Group4 的安全判定实现。

### U9 实际安装目录补验

补验发现仅在仓库 F 盘跑通还不够：没有广泛用户主目录读取授权时，srt 受限账户无法进入 C 盘 `.openclaw` 工作区，PowerShell 落到 `C:\`，相对路径写入 EPERM。修复没有放宽主目录权限：srt 现使用仓库 `.runtime/session-sandbox/workspaces` 下的具体会话目录；Docker 工作区保持原路径。执行前在隔离进程显式 Set-Location，失败立即 exit 125，不能继续执行用户命令。

`node scripts/test_session_sandbox_installed.mjs` **exit 0**，`local-validation/session-sandbox/deployment-srt-report.json`：passed=true，回执为 ALLOW、DENY_READ:EPERM、DENY_WRITE:EPERM、DENY_NETWORK:EACCES。这是实际部署目录/最终后端的合成执行检查，与前述原生 exec 联合测试证据分别保留。回归仍为 **21/21 通过**，日志 `local-validation/session-sandbox/regression.log`。补充脚本和页面切换测试均核对新的工作区策略，主目录未扩大授权。

最终部署后的页面复验 `node scripts/test_session_sandbox_ui.mjs`：exit 0，报告 `local-validation/session-sandbox/2026-11-08T04-10-22-288Z/ui/report.json`。两次切换均就绪、保存并显示，srt 的新工作区路径断言通过，审计核对通过，最终引擎 Docker。配置保留报告也在此后重新生成，所有保留项均为 true。

## U6：行为护栏政务工具面验收

2026-11-07 完成，使用现有 `read_gov_document`、`list_notices` 两个受管工具的三条合成路径。没有新增工具、路径参数或默认放行。

| 用例 | 工具路径与输入 | 阻断与停止判据 | 审计与隐私判据 |
|---|---|---|---|
| 注入输入 | 计划读取公开预案 `read_gov_document(emergency_plan)`，输入含合成注入与秘密哨兵 | `before_agent_run` 返回 block；宿主测试器终止运行；工具执行 0 次，后续工具不执行 | `SYNTHETIC_INPUT_INJECTION`；轨迹 blocked；提示词及秘密哨兵原文均不存在 |
| 恶意工具返回 | `list_notices(limit=1)` 的真实本机合成查询回执，在测试内替换为恶意文本 | 返回内容隔离，流式回调不下发；请求宿主取消 1 次，后续工具执行 0 次 | `SYNTHETIC_NOTICE_INJECTION`；恶意正文与口令哨兵不进入模型返回或轨迹 |
| 越权读取 | clearance=1 合成值班员读取 `read_gov_document(command_contacts)` | 真实 OPA 判定拒绝，底层文档 read_count 增量为 0；即使文本分类器 ALLOW，也请求宿主取消，后续工具不执行 | `G002_POLICY_DENY` 及 `policy_reason_codes` 中的 `D004_CLEARANCE_INSUFFICIENT`；轨迹保留 D004，文档 ID 参数值和提示词仅以哈希进入轨迹 |

三条轨迹均完成到 `agent_end`，检查停止确认、原因码、采集缺失为 0、哈希链有效、原文未落盘。输入拒绝发生在推理启动前，由宿主执行 block 结果，因此取消回调次数为 0；后两条在工具返回阶段通过现有 stopRun 请求取消，不把提前拒绝伪装为运行中取消。

**查明并修复的缺口：** 受管文档已被 AgentGuard 拒绝时，原返回门禁可能将回执按普通错误放行，任务仍可继续。本轮在 `result-gate.mjs` 增加受限识别：必须是已配置启用的 agentguard-notices、宿主工具名和 MCP 元数据均匹配 read_gov_document、请求 ID 格式合法、`blocked` 且 `executed=false`、主原因 G002 且规则命中 D004/D005。满足后走原 BLOCK → 隔离返回 → stopRun → 后续工具拒绝链，不另建执行链。正常公开读取仍通过；普通错误仍沿原检查路径处理。没有仅凭正文中的 BLOCK/D004 或另一个工具伪造的元数据停止任务。

新增用例边界：检测器为确定性夹具，用于验证接线、阻断、取消与隐私，不评估真实模型识别率。Python 辅助脚本在随机本机端口启动临时 AgentGuard，通过真实 HTTP 客户端和 MCP 工具分发取得公开读取、公告、D004 回执；只使用仓库 demo_documents 和合成数据。随后 Node 宿主测试器使用这些回执驱动实际 Protect 钩子、返回门禁和 Trace 存储；取消使用 AbortController，结束事件由宿主测试器发出。**这不是新采集的真实 OpenClaw Agent 会话。** 报告 source 为 `synthetic-host-harness-with-real-local-agentguard`，身份注明 `loopback_static_dev-not-production`，轨迹 source 为 `synthetic-fixture`。没有调用外部模型或真实生产文件。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts/test_result_guard.mjs
node scripts/test_runtime_stop.mjs
node scripts/test_protect_tool_surface.mjs
# U6 已纳入默认行为护栏层
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-ZhengAn.ps1
```

结果：新增 2 项组合测试通过（3 个业务场景 + 正常对照 + 来源/字段伪造反例）；原结果门禁、runtime-stop、Protect 插件与 Trace 相关回归 **72/72** 通过。完整默认验收 **12 项检查通过，退出 0**；4 项 `-Live` 检查未选定并明确跳过。

- 用例报告：`local-validation/protect-tool-surface/2026-11-07T13-44-50-568Z/report.json`。
- 同目录保存三条合成 JSONL、哈希锚点及隔离 AgentGuard 审计；`deployment.json` 记录重启后网关可达、版本 2026.7.1-2、配置摘要不变，未新建 Agent 会话。
- 四层报告：`local-validation/verify/2026-11-07T13-44-50-096Z-30440/report.json`、`report.md`。

改动文件：Protect 插件 `register.mjs` 与 `result-gate.mjs`（15 行净新增级别的停止联动）、`scripts/test_protect_tool_surface.mjs`、`scripts/lib/protect_tool_surface_fixture.py`、`scripts/verify_zhengan.mjs` 及文档。AgentGuard 策略、身份校验、票据与隔离适配器未改；未降低现有防护。已重启本机网关加载代码，无配置修改、升级或 git push。

## U5：四层一键验收报告

2026-11-07 完成 `scripts/Verify-ZhengAn.ps1`，内部由 `scripts/verify_zhengan.mjs` 执行固定测试清单并生成中文 Markdown 和机器可读 JSON。入口已加入 `docs/README.md` 与仓库实际维护文档 `docs/MAINTENANCE.md`，保留根目录原 `Verify.ps1` 的服务检查用途。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-ZhengAn.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-ZhengAn.ps1 -Live
```

| 实测范围 | 结果 | 报告目录 |
|---|---|---|
| 默认离线 | 11 个检查项通过；4 项现网检查明确标为未启用 -Live；退出 0 | `local-validation/verify/2026-11-07T12-37-01-223Z-28280/` |
| 最终离线 + Live | 15/15 检查项通过，无跳过；退出 0 | `local-validation/verify/2026-11-07T12-40-52-526Z-35360/` |

每个目录均含 `report.json`、中文 `report.md`、逐项 `.log` 和本轮界面证据副本。最终分层检查项数：行为护栏 3、权限闸门 5、过程台账 3、经验自演进 2、文档索引 2；这些是脚本项数，不是测试断言数。主要套件结果包括行为护栏 13 + Protect 28、文档 10 + HTTP 2、身份 9、面板 10、trace 31、生命周期/演进 52、工作区 13 类检查。

汇总器的 6 项自动化测试已通过，包括真实子进程非零退出、启动失败、超时、缺依赖不执行、内部跳过、四层文档链接，以及在隔离空仓库中实跑 PowerShell 验证退出 1、移除子进程 PATH 中 Node 后验证退出 2 和完整五层跳过报告。没有改实际仓库或机器 PATH 来构造失败。

保留的中间报告：

- `local-validation/verify/2026-11-07T12-35-31-466Z-41832/`：初版汇总器误将测试名称中的 skip 识别为跳过，退出 2。已改为只解析测试框架统计/标记，并补回归。
- `local-validation/verify/2026-11-07T12-37-56-223Z-4952/`：HTTP 合成文档测试发生一次 Windows `WinError 10053` 连接中断，汇总正确退出 1；同轮四项 live 追加检查均通过。随后该测试独立复核 2/2、最终完整复跑通过。此连接中断的系统原因未定位；没有增加自动重试、吞错或修改安全策略。

默认离线测试仍需要本机 Node、AgentGuard 环境、OPA/Wasm 和 Edge/playwright-core；缺依赖不伪装为成功。`-Live` 读取现有真实轨迹、候选与身份页面，行为层另核对已安装宿主包装器的隔离副本；不新建 Agent 会话、不调用模型、不重新标定评分或安装候选。不能据此声称生产 OIDC、全文算法复现、准确率或 U1 已知动态遥测问题已验收。

本轮仅新增汇总器/入口/自测及文档。OpenClaw 保持 2026.7.1-2；无 git push、无网关配置修改、无轨迹外发。

## U4：身份边界文案与执行守卫

2026-11-07 完成并在固定 OpenClaw **2026.7.1-2** 验证。工作台/待审批/防护设置、嵌入运行防护面板增加身份徽章与本地配置指引。OIDC 启用徽章同时要求服务版本和就绪证据；演示身份红色标注非生产。配置存在或网关登录不再被解释为业务身份就绪。

旧管理页面在 loopback_static_dev 模式下允许动作试算和开发审批，是本轮查明的执行入口缺口。现在页面执行、开发审批和页面文档演示均禁用；对应 HTTP 路由和轨迹审批 RPC 同步拒绝，不能靠去掉按钮 disabled 绕过。没有新增演示开关；底层 MCP 显式合成演示和原 OIDC/OPA/票据/审批安全链保持不变。

| 命令 | 结果 |
|---|---|
| `.\modules\agentguard-group2\.venv\Scripts\python.exe scripts/test_identity_boundary.py` | 9/9，退出 0；默认停用、假网关身份、OIDC 未就绪、真实服务自批拒绝、角色与待审批绑定 |
| `node --test scripts/test_panel_access.mjs` | 10/10，退出 0；三种身份配置下，真实面板 handler 接收有效页面凭据后仍拒绝三个执行端点，向业务服务发出的请求数为 0 |
| `node --test modules/govagentsec-trace/test/*.test.mjs modules/trajectory-governance/test/*.test.mjs scripts/test_panel_access.mjs` | 87/87，退出 0；含上述 10 项面板检查 |
| `node scripts/test_workspace_ia.mjs` | 13 类检查通过，退出 0；四类身份状态 × 三个入口；嵌入面板初始/刷新失败均禁用；无执行 POST |
| `node scripts/test_identity_live.mjs` | 退出 0；真实网关三个页面均显示“演示身份（非生产）”，嵌入面板执行控件禁用，无业务操作，配置未变 |

实机报告：`local-validation/identity-guardrails/2026-11-07T12-10-18-792Z/report.json`，source=`live-openclaw`。同目录 `home.png`、`approvals.png`、`settings.png`、`runtime-readonly.png`。界面夹具报告：`local-validation/workspace-ia/report.json`。上述 OIDC 就绪正向状态使用测试服务事实验证；没有真实组织 issuer，不宣称完成生产 OIDC 验收。

变更：`modules/govagentsec-ui/identity-status.mjs`、`workspace.mjs`、`workspace-style.mjs`；`modules/trajectory-governance/task-links.mjs`；AgentGuard `integrations/openclaw_runtime_security_plugin/{index.js,ui/panel.html,README.md}`；身份/面板/工作区测试与新增 `scripts/test_identity_live.mjs`；本文及 `DELIVERY_ACCEPTANCE.md`。

重启网关加载新代码，重启前后配置 SHA-256 一致。未升级、未 git push、未修改网关/组织身份配置、未安装候选、未外发轨迹。Control UI 逐用户 OIDC 委托仍未实现，因此即使身份服务就绪也不会启用页面业务执行。U1 动态扫描遥测问题不在此轮解决范围内。

## U3：候选车间发布闸

2026-11-07 已完成。入口为审计中心 → 候选车间。展示评分/TopK、隔离原因、公共步骤摘要、联合准入结果，以及仅写回执的人工复核。身份不足、评分缺失或 block 时不能确认。`admission_passed ≠ 发布/安装`；未调用安装或发布接口，未改评分和安全策略。

| 验证 | 结果 |
|---|---|
| `node --test modules/govagentsec-trace/test/*.test.mjs modules/trajectory-governance/test/*.test.mjs scripts/test_real_evolution.mjs` | 83/83，退出 0；含低质量保留展示、缺失评分、身份拒绝、内容变化、回执幂等和不安装 |
| `node scripts/test_evolution_release_gate_ui.mjs` | 8 类检查通过，退出 0；6 条真实轨迹的隔离副本，4 安全/2 隔离，3 条 TopK，良性 allow、毒候选 block |
| `node scripts/test_evolution_release_gate_live.mjs` | 退出 0；真实网关现有两张候选卡确认禁用，未尝试确认，config_unchanged=true |
| `node scripts/test_trace_audit_ui.mjs` | 原轨迹 UI 15 项检查通过，退出 0 |

最终隔离 UI 报告：`local-validation/evolution-release-gate/2026-11-07T11-52-43-202Z/report.json`。同目录 `gate-disabled.png`、`gate-confirmed-no-install.png` 分别展示身份不足与测试管理员写回执后的状态。来源明确为 `real-evidence-copy-with-test-auth-context`，模拟管理员不是生产 OIDC；只在隔离副本创建回执。

实机报告：`local-validation/evolution-release-gate/live/report.json`；截图 `workshop-gate.png`。真实网关候选仍是原有候选，未将六轨迹演示副本混入实机候选库。

变更文件：`modules/govagentsec-trace/{release-gate,register,evolution,view}.mjs`、`test/release-gate.test.mjs`、`scripts/test_evolution_release_gate_{ui,live}.mjs` 和两份文档。新 RPC 为只读 `releaseGate` 和管理员 `confirmReview`；详见 `REAL_MULTI_TRACE_EVOLUTION.md`。

保持 OpenClaw 2026.7.1-2；为加载插件代码重启过网关，未修改网关配置、未升级、未 push、未安装候选、未外发轨迹。当前实机没有组织 OIDC，人工确认仍禁用；新增确认链路的成功分支已在可信上下文模拟测试中验证。U1 记录的既有动态扫描遥测失败仍未解决，不将本轮结果表述为整个系统全部验收通过。

## U2：过程台账常驻工作区

2026-11-07 已在真实 OpenClaw 2026.7.1-2 验证。此次仅改前端/视图、测试和文档，无模型调用、无配置写入、不修改源 JSONL、不升级、不 push。网页测试只访问本机。

根因与改动：顶栏原来仍挂旧版工作台轨迹，审计页使用新 JSONL，导致数据范围不一致；改为优先复用新视图，并严格按当前会话过滤。新顶栏常驻“审计中心”和“任务与轨迹”；补搜索/状态筛选、可刷新恢复选择的对比 URL、明确空态/孤儿提示。宽屏图原有 1000px 最小宽度会把首节点挤出窄抽屉，现在抽屉单独适配，实机测试断言首节点在可视范围内。

### 命令与结果

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node --test modules/govagentsec-trace/test/*.test.mjs
node scripts/test_workspace_ia.mjs
node scripts/test_trace_audit_ui.mjs
node scripts/test_trace_workspace_live.mjs
```

- 轨迹模块：**27/27 通过**。受限环境系统临时目录 rename 曾返回 EPERM；设置本次进程 `TEMP`/`TMP` 到项目 `local-validation/u2-temp` 后通过，没有改哈希链实现。
- 工作区 IA：**11 类检查通过**，包含刷新、侧栏折叠、顶栏双入口、旧版对比路由及设置返回。
- 轨迹 UI：**15 类检查通过**，包含零事件无假节点、孤儿提示、搜索后清理详情、当前会话隔离、默认合成过滤、图/时间线/对比/候选。
- 真实工作区：**5 类检查通过**，`local-validation/trace-ui/u2-live/report.json` 的 `passed=true`、`config_unchanged=true`。浏览器在受限沙箱无法启动 Edge，实机验收在正常主机权限下运行。

`test_trace_audit_ui.mjs` 默认使用最近一次 `trace-demo-*` 的本地合成数据，仅用于 UI 回归，不冒充真实业务。若新部署没有该目录，先运行 `node modules/govagentsec-trace/demo.mjs`。实机脚本另用现有真实 JSONL；要求至少两条已确认同任务的完整轨迹及一条真实孤儿记录，缺少前置数据会明确失败，不合成替代。

### 现场演示

1. 登录 `http://127.0.0.1:18789`，刷新页面，折叠侧栏，顶栏“任务与轨迹”和“审计中心”仍可见。
2. 当前会话运行受管工具后打开“任务与轨迹”：看调用图、时间线、防护摘要；无记录会话只显示采集指引。审批处理仍在原“待审批”入口。
3. 打开 `/plugin?plugin=protect-agent&id=govagentsec&section=audit`；搜索、筛选，合成记录默认隐藏。
4. 勾选同任务轨迹后点对比，复制地址并刷新。实测 URL：

```text
/plugin?plugin=protect-agent&id=govagentsec&section=compare&tab=compare&trace_id=e820b9a1-e1eb-416c-b5ea-a3b1600d0090&trace_id=4af42d89-727a-45cb-b1b0-5f6406699928
```

5. 本轮实机孤儿轨迹 `6c1ffa69-e105-43a0-93c1-e66edc77864c`，用 `section=audit&trace=该ID` 打开，显示证据不足/不可入选；没有补造开始节点。该提示与真实演进演示恢复样例的隔离原则一致。

截图：`trace-ui/u2-live/task-drawer.png`、`compare-deep-link.png`、`real-orphan.png`；回归孤儿截图 `trace-ui/orphan-isolated.png`（以上目录均在 local-validation 下）。实机脚本读取已有记录，无新 Agent 请求，hash 配置已检查。历史分数原样显示，不在 UI 为演示重新评分。

### U2 文件变更

- `modules/govagentsec-ui/shell.mjs`：顶栏入口、新 JSONL 抽屉、会话范围和异步关闭保护。
- `modules/govagentsec-ui/workspace.mjs`：合成分类、对比/候选/单轨迹深链参数。
- `modules/govagentsec-trace/view.mjs`：搜索/状态过滤、会话范围、缺证据说明、防护摘要、窄抽屉图布局。
- `scripts/test_workspace_ia.mjs`、`test_trace_audit_ui.mjs`、新增 `test_trace_workspace_live.mjs`。
- `docs/openclaw-workspace.md`、本文。

边界：顶栏摘要只统计已采集事件，不替代审批授权；旧台账保留兼容入口。未改变采集 Hook、评分/联合准入规则，也未重写 UI 框架。

## U1：Aegis 深链与安装前阻断

2026-11-07 完成开发并在本机 OpenClaw **2026.7.1-2** 验证。没有升级、git push、安装测试 Skill 或修改网关配置；为加载插件代码重启过网关。

### 两条演示路径

1. **未授权深链**：匿名打开 `http://127.0.0.1:18789/plugins/aegis-admission/panel` 或 `/plugins/aegis-admin/rules?embed=1`。真实 HTTP **401**，中文页面显示“需要管理员签发的一次性访问凭据”与 `UI_PAGE_TOKEN_MISSING`，不返回审计内容。
2. **安装前准入阻断**：运行下方专用脚本，生成明确标注 synthetic 的纯指令样例，通过本机 `security.installPolicy.exec` 调用真实 **Aegis + Group4 combined_install_policy.py**。良性包 `allow`；投毒包 `block`，命中 `GROUP4_STATIC_提示投毒`。仅 preflight，不进入安装和执行流程。

管理员登录后从 **能力接入 → 检查报告** 查看“最近放行 ALLOW / 最近阻断 BLOCK”双回执，包括中文说明、原因码、命中规则、时间、报告序号、现有 PDF 导出入口。数据来自已有鉴权的审计 API，不从演示报告文件拼装页面。卡片是 Aegis 的审计证据，联合策略最终结果另存专用报告；Aegis ALLOW 不被表述为联合安装必然通过。

页面凭据仍由 `operator.admin` 的 `govagentsec.ui.open` 签发，绑定完整目标且有效期 60 秒、仅使用一次。拒绝原因：

| 原因码 | 含义 | HTTP |
|---|---|---|
| UI_PAGE_TOKEN_MISSING | 未提供凭据 | 401 |
| UI_PAGE_TOKEN_INVALID | 未知凭据或过期记录已清理 | 401 |
| UI_PAGE_TOKEN_EXPIRED | 凭据过期且记录仍可识别 | 401 |
| UI_PAGE_TOKEN_USED | 凭据已消费 | 401 |
| UI_PAGE_TOKEN_TARGET_MISMATCH | 请求方法或目标不匹配；凭据同时消费 | 401 |

响应头 `X-GovAgentSec-Reason` 与正文一致；不反射 URL、令牌或用户输入。保留 no-store、no-referrer、CSP；API 凭据校验未放宽。凭据清理后只能判断无效，不声称仍能区分历史过期与历史消费。

### 复跑命令和实测

在普通本机终端运行（受限环境可能不允许扫描器所需文件/进程访问）：

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts/test_panel_access.mjs
node --test modules/aegis/demo_web/openclaw_plugin/aegis-admission-ui/*.test.js
node scripts/test_aegis_admission_demo.mjs
python scripts/verify_admission.py
```

前置：本机网关运行、Aegis 插件已加载本仓库代码、已有管理员凭据与 `security.installPolicy.exec`、联合准入环境可用、Edge 已安装。修改代码后运行 `openclaw gateway restart` 并等待侧车就绪。专用脚本使用本机既有管理员凭据，凭据不写入日志或报告；网页只访问本网关，不调用外部扫描替代品。

| 命令 | 本轮结果 |
|---|---|
| `node scripts/test_panel_access.mjs` | 7/7 通过，退出 0；含缺失、过期、重放、目标不符和能力范围限制 |
| Aegis 插件 `node --test .../*.test.js` | 21/21 通过，退出 0 |
| `node scripts/test_aegis_admission_demo.mjs` | 退出 0；真实策略 allow/block、3 条匿名深链 401、授权报告 200、真实重放/等待 61 秒后过期均 401 |
| `python scripts/verify_admission.py` | **退出 1，未通过**；既有 `benign_doc_summary` 动态样例产生 `AEGIS_DYNAMIC_TELEMETRY_INCOMPLETE`、`AEGIS_DYNAMIC_EXECUTION_INCONCLUSIVE`，按原策略 block；普通主机权限复核仍复现 |

专用脚本在受限环境首跑也曾遇到 `AEGIS_POLICY_SCAN_FAILED / PermissionError`，保留失败报告；在本机正常权限下完成真实测试。没有删除失败审计、模拟放行或降低动态策略来通过验收。原动态遥测问题不属于本轮深链/回执 UI 改动，仍需单独排查，不能据此称全部原准入回归已通过。

### 验收材料

通过的报告目录：`local-validation/aegis-admission-demo/2026-11-07T10-53-28-001Z/`。

- `report.json`：`passed=true`、`exit_code=0`、`config_unchanged=true`；真实策略返回值及 HTTP 检查。
- `anonymous-denied.png`：真实网关 401 中文拒绝页。
- `expired-denied.png`：实际等待后得到的过期 401 页面。
- `admission-receipts.png`：实际网关报告页的 ALLOW/BLOCK 双回执；本次报告序号 #58 / #59。
- 两个合成包及 README：仅用于扫描，没有安装。

### 变更范围

- `modules/govagentsec-ui/access.mjs`：明确原因码；消费记录保留至 TTL 以识别重放；保持原访问范围和过期限制。
- `modules/aegis/demo_web/openclaw_plugin/aegis-admission-ui/index.js`：去除鉴权前重定向，敏感深链直接进入原凭据校验；有凭据则返回原真实面板。
- 同目录 `admin_pages.js`：真实审计列表的最近放行/阻断双回执，沿用原鉴权 PDF 接口。
- `scripts/test_panel_access.mjs`：新增凭据失败分类回归。
- `scripts/test_aegis_admission_demo.mjs`：真实联合准入及网关浏览器验收，失败非零、保存报告。
- 本文及文档索引。

未改安装策略规则、动态扫描引擎、主体身份、受管 MCP 或 Q/S 评分模块。

## U1–U6 综合验收声明（2026-11-07 复检）

复检命令：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-ZhengAn.ps1` 与同脚本 `-Live`。

| 范围 | 结果 | 报告 |
| --- | --- | --- |
| 默认离线 | 12/12 通过，exit 0 | `local-validation/verify/2026-11-07T14-22-18-781Z-56364/` |
| 现网 Live（网关可达） | 15/15 通过，exit 0 | `local-validation/verify/2026-11-07T14-22-45-582Z-29284/` |

### 可写入材料的口径
- **工程交付**：U1–U6 升级目标中的「可演示、可复检、身份不装假、发布不自动装」已达到；四层一键验收与 Live 现网检查全绿。
- **对齐主流厂商（OpenAI/Anthropic 类护栏+审批产品形态）**：输入/结果护栏、阻断停跑、敏感动作人工审批、工作区审计入口等**产品骨架大致对齐**；文件系统/网络沙箱、通用工具面自动评审策略仍未作为本轮交付，**不宣称全面对等厂商运行时**。
- **相对优秀开源（如 GoPlus AgentGuard）**：在政务密级受管读、中文门禁面板、轨迹台账与哈希链、双门控自演进且 `admission_passed ≠ 安装`、四层验收打包上可主张**政务 Agent 安全套件完整度的局部领先**；在全工具 `before_tool_call` 覆盖广度与日常 shell/文件开箱策略上**不宣称全面超越**。
- **相对 SOTA 方法（CaMeL / ToolFence / PACE / Progent）**：U1–U6 **未交付**参数 provenance、任务级单调最小权限或控制流/数据流隔离，**不得宣称已对齐 SOTA 安全保证**；该方向归属后续 U7。
- **已知未关闭项**：U1 记录的 Aegis 动态扫描遥测失败（`verify_admission.py` / `AEGIS_DYNAMIC_TELEMETRY_INCOMPLETE`）仍在；无组织 OIDC 时不得宣称生产身份验收完成；部分用例为合成宿主夹具，不得表述为全部来自真实 Agent 长会话采集。

### 一句话
U1–U6 把系统抬到「能验、能讲、能挡住一批演示攻击」的工程水位；安全算法上界看 U7，先进会话模型双轨看 U8。


## U7 参数来源与任务权限（2026-11-07）

已完成仓库实现与本地自测。实现说明：[BEHAVIOR_CONSTRAINT_SOTA_UPGRADE.md](BEHAVIOR_CONSTRAINT_SOTA_UPGRADE.md)。原 U7 轮次未升级 OpenClaw 2026.7.1-2、未 git push、未改现网配置或 toolFilter、未部署/重启。后续 U7b 已补现网登记，见下方补记，不改变本段原验收时间事实。

### 交付行为

- 可信用户参数哈希与 `user / approved_snapshot / tool_untrusted / unknown` 来源；模型参数不能自我授权。
- 任务只读模板、单调收紧、版本变化使旧票据失效、精确动作的一次性扩权审批。
- 新受管工具 `submit_emergency_notice`，只写合成送审账本；无真实外发能力。
- 待审批、任务风险详情与正式权限闸门面板显示来源、契约、扩权与 TTL；未知来源和未受管工具标红。U4 身份执行禁用边界保持。
- 参数审计/面板缓存哈希化；任意未登记文档 ID 不以原文落审计。

### 本机执行结果

均从仓库根目录执行，退出码均为 0：

| 命令 | 结果 |
| --- | --- |
| `.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_gov_document.py` | 10 项通过 |
| `.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_boundary.py` | 9 项通过 |
| `.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_param_provenance.py` | 10 项通过 |
| `.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_task_privilege_contract.py` | 10 项通过 |
| `node scripts/demo_behavior_constraint.mjs` | 六个真实本地 MCP/HTTP/OPA 场景及正式面板通过 |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Verify-ZhengAn.ps1` | 必选 14/14 通过；四项可选现网检查未启用，不计入通过数 |

最终综合报告：`local-validation/verify/2026-11-07T15-33-32-158Z-62904/report.json`。同目录保存逐项日志；含新增参数/契约用例、U6 工具防护、原文档/身份/面板、轨迹、自演进及工作区 UI 回归。工作区 UI 用例检查未受管 `exec` 提示实际可见且为红色。

真实本地演示报告：`local-validation/behavior-constraint/2026-11-07T15-32-07-122Z/report.json`；截图 `pending-provenance-contract.png`；实际面板数据 `panel-snapshot.json`；MCP 场景报告 `mcp-report.json`。`passed=true`、`service_exit_code=0`、`gateway_config_unchanged=true`。

演示结果：明确授权公开文档成功；工具来源文档待批且读取增量 0；工具来源收件人待批且写入 0；用户收件人因超出只读契约仍待审批；合法审批写入 1 次；重放拒绝且写入仍为 1。审批面板中无可点击的执行审批按钮；演示以显式内部合成身份验证业务执行链。

最初受限运行环境无法调用 OPA/打开系统临时 SQLite，随后在普通本机进程环境复跑通过；没有删除断言或降级策略。`git -c core.whitespace=cr-at-eol diff --check` 通过。

### 本轮变更文件范围

- `modules/agentguard-group2/enforcement/`：新增 `task_policy.py`、`notifications.py`；修改 `gateway.py`、`tickets.py`、`adapters.py`。
- `modules/agentguard-group2/service/`：`app.py` 增加可信契约接口与审批衔接；`gov_document_demo.py` 明确固定演示参数授权。
- `modules/agentguard-group2/data/agent_guard.json`：新增通知送审工具与 office_user 操作许可；原拒绝和审批规则不变。
- `modules/agentguard-group2/integrations/openclaw_mcp/`：客户端、服务、配置、示例、README；`scripts/` 下既有演示安装工具清单。
- 正式权限闸门插件 `index.js` / `ui/panel.html`；`govagentsec-ui/workspace.mjs`；`trajectory-governance/task-links.mjs` / `workbench.mjs`；轨迹插件 `register.mjs` 的新工具关联映射。
- `scripts/test_param_provenance.py`、`test_task_privilege_contract.py`、`demo_behavior_constraint.mjs`；`scripts/lib/behavior_constraint_fixture.py` / `behavior_constraint_live.py`；U6 夹具、工作区 UI 测试及四层验收入口。
- 本记录、U7 专项说明、产品使用逻辑及文档索引。

### 边界

演示数据为 synthetic，身份明确为 `loopback_static_dev-not-production-OIDC`；MCP、HTTP、OPA、一次性票据与正式面板代码真实运行，`host_session=false`，不冒充 OpenClaw 模型会话。工具污染由受控测试入口导入；尚无全宿主自动来源传播、按 run 自动绑定契约或逐用户页面 OIDC 委托。未知来源继续待批，不作隐式授权。没有实现完整 CaMeL，不宣称复现论文安全证明或指标。


## U7b 通知工具现网登记补记（2026-11-08）

先盘点再补 submit_emergency_notice：现网 toolFilter 与两层 alsoAllow、生成源 include、批次 include、沙箱 MANAGED_TOOLS。既有身份/OPA/任务契约不变；通知可信拒绝补入原返回门控的独立停止分支。

`node scripts/verify_u7b_notify_live.mjs` exit 0，11 项均 PASS；含真实 MCP 清单、U7/U6/工作台、沙箱名单及安装态 srt、真实现网工作台截图。证据 `local-validation/u7b-notify-live/2026-11-08T06-18-53-362Z/`。

配置已备份且保留新登记；改前哈希 `0b6a24718f17312c9ab5aaa1d9f344b0508dbfc70ff8784681266875acbe3374`，改后 `ad6f883e73137df5af3b5ee90a7c41648491b92a08f186d04a9726899e1fb6d6`。已重载网关，未改其他配置、未清状态、未升级/推送/外发轨迹。恢复步骤与文件清单见 [U7B_NOTIFY_TOOLS_LIVE.md](U7B_NOTIFY_TOOLS_LIVE.md)。不宣称组织 OIDC、真实外发或 U11 全量任务覆盖完成。

## U8 会话 API + 本地安全评审（2026-11-08）

仓库实现与验收完成，现网切换未执行。OpenClaw 保持 2026.7.1-2，未 git push、未重启现网，未发送真实云请求。说明：[MODEL_ROUTING.md](MODEL_ROUTING.md)。

### 变更

- `config/model-routing.json`：默认会话 `gov-session/deepseek-chat`，默认本地评审 `qwen3:8b`，外部评审强制关闭；只记录环境变量名。
- `modules/model-routing/routing.mjs`、`local-only.mjs`：分层配置、OpenClaw 模型片段、中文实际状态、逐请求回环校验与本地权重检查。
- `modules/govagentsec-trace/local-judges.mjs`：默认 Ollama；禁外发传输；保留明确的启发式回退和显式 Fixture 测试方式。`scoring.mjs` 未改。
- `modules/trajectory-governance/local-judge.mjs`、`skillclaw_adapter.py`：旧路径也增加逐请求地址检查及云代理模型拒绝；保留固定模型摘要。
- `task-links.mjs` / `govagentsec-ui/workspace.mjs`：防护设置中文显示会话与评审分工，不把配置当作云连通证据。
- `scripts/prepare_model_routing.mjs` / `apply_model_routing.mjs`：生成无密钥片段；可显式备份并应用，仅改模型设置、保留安全钩子与工具限制，缺凭据不修改。
- `scripts/check_model_routing.py` / `test_model_routing.mjs` / `test_generation_local_only.py`：自动冒烟、防外发与 Python 生成边界测试。
- `scripts/evolve_real_demo.mjs` / `judge_calibration_demo.mjs`：共享本地评审默认配置；轨迹 config 示例、工作区测试、四层验收入口与相关文档同步。

### 验收结果

| 命令/范围 | 结果 |
| --- | --- |
| `python scripts/check_model_routing.py` | exit 0；本机 API/Ollama 模拟、断网回退、地址篡改/重定向/云代理拒绝、配置保留检查通过；Python 生成边界 3 项通过 |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Verify-ZhengAn.ps1` | exit 0，必选 15/15 通过；4 项可选 Live 未启用，不算通过 |
| 其中轨迹核心与本地评审 | 31 项通过，无跳过 |
| 其中旧轨迹、自演进与生命周期 | 52 项通过，无跳过 |
| 工作区页面 | 两个中文标题可见；实际配置为本地时不显示 API 已连通；截图已检查 |
| 空白检查 | `git -c core.whitespace=cr-at-eol diff --check` 通过 |

最终综合报告：`local-validation/verify/2026-11-07T16-05-39-724Z-14548/report.json`（目录时间为 UTC，对应本地 11 月 8 日）。逐项日志在同目录。

最终路由报告：`local-validation/model-routing/2026-11-07T16-05-58-060Z/report.json`。`passed=true`、`external_requests=0`、`gateway_config_unchanged=true`。`source=synthetic-local-routing-smoke`，会话端为本机 API mock，评审端为本机 Ollama 协议 mock 与禁网启发式，不冒充云连通或实际 Qwen 推理。合成评分 S=1、Q=0.95 仅用于验证路由，不是新标定结果。

设置页截图：`local-validation/workspace-ia/model-routing-settings.png`，使用工作区浏览器夹具；没有把它标成现网截图。

首次综合报告 `2026-11-07T16-00-05-874Z-35032` 中原文档面板遭遇 WinError 10053 本机连接中止；原样单独复跑通过。第二轮 `2026-11-07T16-03-40-445Z-57980` 中路由子进程以 4294967295 异常退出且未留下子报告；原因未确定，单独复跑与最终综合复跑通过，保留失败记录。没有删除断言或将失败算作通过。

### 部署边界

- 本轮读取现网默认仍为 `ollama/qwen3:8b`；当前进程没有 `DEEPSEEK_API_KEY`。没有自动切换到不可用的 API 配置。
- 已生成 `local-validation/model-routing/openclaw-model-patch.json`，状态 `prepared-not-applied`。用户本地注入密钥后按 MODEL_ROUTING 的显式应用命令切换；启动网关的进程须继承凭据，并另验实际云连通与新会话钩子。
- 原会话/代理模型覆盖不会被强行清除。本包未实现全宿主 DLP；含真实公文和敏感 prompt 的任务需显式本地运行。
- 外部评审开关没有开放；原始轨迹、prompt、公文未发送到外部 API。

## U8 本机会话 API 激活（2026-11-08）

用户提供新凭据后已完成真实 DeepSeek 合成消息连通检查：HTTP 200，回复 OK，使用 14 tokens。请求模型 deepseek-chat，服务返回模型标识 deepseek-flash；没有发送历史会话、公文或轨迹。

凭据保存于仓库外的 OpenClaw 私有环境文件，配置只引用 DEEPSEEK_API_KEY。默认会话已改为 gov-session/deepseek-chat，OpenClaw 仍为 2026.7.1-2。原安全插件、工具规则、网关设置经前后比较保持不变；本地评审仍为回环地址，external_review_enabled=false。既有会话与独立演示代理的模型覆盖未强制修改。

已请求重启 OpenClaw Gateway 计划任务，随后本机 18789 页面 HTTP 200。真实 API 检查见 local-validation/model-routing/live-session-api-report.json；配置比较见 deployment-config-report.json。未推送源码或凭据。

补充运行核验：网关启动日志明确显示 agent model: gov-session/deepseek-chat；模型清单 exit 0，available=true，标签 default/configured。见 local-validation/model-routing/loaded-model-report.json。


## 2026-11-08 U10 身份与任务 ACL

- 先完成 `docs/IDENTITY_TASK_ACL_DESIGN.md` 与阶段 A 六项自检，再扩展 U4b/U7 五个切片。
- `node scripts/verify_identity_task_acl.mjs` exit 0，12 条验收/回归命令全部 PASS；U10 专项 10 项，包括越界零读取、scope 收紧、过期与并发一次性票据。组织配置探针仍诚实报告缺口。
- 真实 OpenClaw UI 走同一 RS256→Verifier→OPA→TaskPolicies→HMAC→隔离 reader：A 成功 read_count=1；B DENY/自批仍 1；处长批准后 2；重放仍 2。
- 报告与 8 张 PNG：`local-validation/identity-task-acl/2026-11-08T05-58-38-522Z/`；详见 [U10_IDENTITY_TASK_ACL_VALIDATION.md](U10_IDENTITY_TASK_ACL_VALIDATION.md)。
- 为加载新 RPC 重启网关，未改配置，前后哈希一致；演示源结束后关闭。OpenClaw 仍 2026.7.1-2，未 push、未外发轨迹、未发送模型消息。
- 生产 OIDC/真人 MFA 未接；逻辑 registry 目录不是全盘 ACL；未受管原生工具、逐聊天 run 自动绑定仍是后续交付项。

## 2026-11-08 模型选择与思考控件修复

- 原因：U8 最小 provider 没有完整模型目录/推理能力；宿主聊天页规范化会话 key 后提前返回连接初始化，页面模型目录保持空（metadataVersion=0），而网关目录正常。
- 修复：补齐 DeepSeek Flash/Pro 能力和允许列表；固定 2026.7.1-2 聊天页在 sessionKey 更新后完成尚未执行的连接初始化；原生 Fast 支持范围不变，补中文说明。
- `node scripts/test_model_picker_patch.mjs`：exit 0，验证规范化后连接一次、离线不连接、补丁幂等。
- `python scripts/check_model_routing.py`：exit 0；Node 路由/请求参数测试通过，Python 本地评审边界 3/3。报告：`local-validation/model-routing/2026-11-07T17-17-13-425Z/report.json`（UTC 目录时间）。
- `node scripts/test_model_controls_live.mjs`：exit 0，真实浏览器菜单含 Flash、Pro、Qwen；专用空白会话 Pro/High 和 Flash/Low 均保存并刷新复核成功。报告：`local-validation/model-controls/report.json`；截图：`model-menu.png`、`saved-flash-low.png`。
- `local-validation/model-controls/config-preservation.json`：plugins/tools/gateway/hooks/Ollama 与变更前备份相同；仅更改会话模型配置及前端补丁。无聊天发送，无轨迹外发，无升级，无 git push。
- 边界：Pro 在固定宿主的包装层里 Low/Medium 仍映射 high；DeepSeek 原生 Fast 开关不支持。前端为固定 bundle 的可重复补丁，重装宿主后需重新执行安装脚本；版本或代码锚点不匹配会拒绝修改。
