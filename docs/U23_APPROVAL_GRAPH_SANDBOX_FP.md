# U23 审批入图、执行环境提示与误报校准

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

2026-11-08。阶段 A 先于代码。基线 release/3.0，保留未提交的 U22 改动。宿主固定 OpenClaw 2026.7.1-2；本包不改宿主文件、不 push、U20 关闭、原文不外发。

## 1. 切片与非目标

实现三项：可信审批事件追加进轨迹；保留 Docker 演示默认并在切 srt 前确认冷启动代价；修复已复现的数据来源声明误分类，补真实停止回执。

不做真组织 OIDC、第二套身份/审批账本、U9 隔离内核、自动重试、延长 ACL/票据 TTL、启用 U20。组织接入仅指向 [U12 runbook](U12_ORG_OIDC_OR_DEMO_BOUNDARY.md)。沿用 U22 登录→当前会话绑定→申请→另一人批准→返回原任务重试。

## 2. 审批：唯一主方案 A

现有事实：`identity/demo_provider.py` 的 `audit()` 写 `identity-audit.jsonl`；`identity/chat_acl.py` 保存可信 session/run/request/task 和宿主 toolCallId。`DemoIdentityBridge` 以私有 stdio 连接同一 Python worker。U22 没有跨到 trace 的可靠桥，因此采用相邻回执；现有 `approval.observed` 主要描述 MCP 审批状态，不能冒充原生审批。

实施：在已有 audit 成功写入后，将本次操作产生的白名单审批投影随私有 stdio envelope 交给网关。投影不放进业务 RPC 返回，不接收浏览器提供的事件、run 或票据。JS 只读桥将其交给 trace 内部观察器，由 `TraceStore.append()` 写入原 JSONL 链尾。无历史回填、无第二套授权或审批决策。

覆盖：`approval.requested`（真实扩权申请）、`approval.approved`（服务端授权成功）、`approval.rejected`（真实拒绝）、`approval.denied`（自批等操作拒绝）、`approval.execution`（宿主精确关联的执行回执）。事件保留 audit 时间、request/task、原 run、session、已知 tool call、去敏角色、状态/原因；不写正文、参数、Bearer、票据。批准≠执行，执行失败≠审批拒绝。

关联：申请/批准写原 run；重试执行写执行 run，同时带原 run/request。图只对同一 trace 内精确匹配的 request 和已存在工具调用建立 parent；其他关联显示 ID/跳转，不用时间邻近制造因果。顺序虚线仍只是顺序。缺 toolCallId 不猜。去重依据原审计记录标识；追加失败写 capture health，并在身份状态/轨迹提示采集缺失，授权本身仍由原内核决定。

降级仅针对未覆盖或采集失败的记录：保留同屏审批卡，提示“审批回执与调用图同屏核对；未采集的审批以回执为准”。历史轨迹无事件不补节点。评委讲法：“本次申请、审批和精确关联的执行回执来自服务端，写入追加链；授权与实际执行分别展示。”不宣称所有宿主审批均闭环。

## 3. Docker / srt

阶段 A 磁盘 backend=docker；配置 SHA-256 `5497e4fd8840b1d3ba939c74b006612fec53c5795ba4705969a320ae16f60083`。保持原字节。设置展示实际引擎，srt 切换先出现可取消的确认面板：**首次/冷启动可能数十秒至数分钟，可能超过业务委托期限**。确认前不发 select RPC；取消恢复原选项。未就绪或超时显示执行环境准备/检查提示，绝不降级宿主或静默切后端。

若实测必须改现网：先 `backup_openclaw_config.mjs` 私有备份、记 SHA；原 SandboxService 保存；后哈希；`restore_openclaw_config.mjs --backup ... --expected-hash ... --target-hash ...` 双校验回滚。完整配置不进证据。U23 默认仅测试确认/取消；srt 原有独立回归保留。不是新 OS 隔离验收。

## 4. 误报依据与最小修复

真实本地 sidecar 阶段 A 对照已落证据：普通预约、台风简报、Word 模板、原 ACL 提示均 ALLOW；英文规则覆盖/密钥提取及中文绕审批提权均 BLOCK。历史 U14 原始合成声明“合成数据：U14 受控读取，不是政企真实文件。”在 input/tool_result 均政治敏感 BLOCK，邻近自然声明 ALLOW，说明不是权限策略拒绝。

沿用 `risk/guard_fusion.py`，只为完整、短、明确的合成/示例数据来源声明加语法限定的内容误分类校准。只处理唯一 political 分类，所有检测器可用且注入/对齐/越权/多轮均低风险，无覆盖/外泄指令时降低该内容分；保留原 detector 理由并追加校准理由。不能靠出现“合成”放行一段正文，不能包裹恶意命令，不能影响其他分类或检测不可用的 fail-closed。不是按 U14 完整样本文本或 hash 白名单。是否达标由真实复测决定。

实际 `sidecar.tool_result` 经 `defend_rag()` 将完整 chunk 以 RAG 来源送入同一融合器，因此该完整声明校准覆盖 USER/TOOL/RAG；不改 RAG 保留门槛。没有把工具返回中的任意子串当声明，全文匹配失败即维持原判定。

矩阵：≥3 正常（服务预约、台风材料、Word 模板）及历史来源声明；≥2 注入/越权；另测附加攻击、非声明政治风险、检测器缺失。真实 OpenClaw 隔离网关只接 loopback 确定性模型，无外部 API；正常应完成，攻击需 `stopConfirmed`、未进模型/工具、真实 Agent 结束。保留 before 的 BLOCK 与无效探针 HTTP400，不删除失败记录。流式输出不具完整发送前门控，声明校准不代表全类别零误报。

## 5. 四层与风险

| 四层 | 本包触点 |
|---|---|
| 风险识别 | 来源声明误分类校准；真注入仍阻断 |
| 行为约束 | 显示真实审批/执行；原 ACL、禁自批、TTL 不变 |
| 组件准入 | 不改 Aegis；不与会话沙箱混称 |
| 评测审计 | 审批追加链与图；引擎耗时来源诚实 |

风险控制：假审批节点→只接受私有 worker 已写审计投影；断链→原 append/verify；误降攻击→全匹配、低风险联合条件与攻击反例；静默切 srt→确认前零 RPC；超时不提示→环境状态与冷启动文案；OIDC 回潮→继续演示非生产；U22 旧“分屏”文案→更新当前 UI，历史报告保持原意。跨进程未有 worker 事件、无关联字段与宿主原生 exec 审批仍不能宣称全部覆盖。

## 6. 验收命令与证据

前置：本机网关 18789 与 Protect 19171 已运行，配置 mode=real、模型缓存可读；Docker 引擎与专用镜像就绪，AgentGuard Python/OPA 和 Edge 可用。专项另开临时 loopback 网关与确定性模型，只用合成文件；检测不可用明确失败，不回退外部模型。部署 Python 融合规则后需重载 Protect 服务。

```powershell
openclaw --version
node scripts/verify_u22_login_approval_path.mjs
node scripts/verify_judge_chat_acl.mjs
node scripts/verify_demo_identity.mjs
node scripts/verify_u23_approval_graph_sandbox_fp.mjs
node scripts/test_protection_alert.mjs
node --test modules/session-sandbox/test/*.test.mjs
```

身份 live 顺序执行。专项补审批投影/链/缺失、自批/拒绝、原 UI 主路径、srt 确认取消、真实输入停止回执、Group1 现有回归。证据 `local-validation/u23-approval-graph-sandbox-fp/<UTC>/`：版本、设计引用、脱敏事件摘要与链校验、真实截图、前后配置哈希/引擎、fp-matrix、report、DELIVERY；本机原文不复制进证据。

## 7. 已读依据

- U22 设计及 `local-validation/u22-login-approval-path/2026-11-08T11-46-08-529Z/{DELIVERY.md,report.json}`；U21 T02/T03/T09、PRODUCT_UX_LOGIN_AND_DEMO_FLOW、ACCEPTANCE_BOUNDARIES、U15 镜头脚本。
- trace 的 register/store/view/view-model、TRACE_CALL_GRAPH_VALIDATION、TRACE_IMPLEMENTATION_PLAN。
- identity 的 demo_provider/chat_acl、现有 gateway 审批与票据路径、runtime plugin 的 demo-identity/chat-acl；U22 回执测试。UI workspace/shell/demo-identity/task-context。
- SESSION_SANDBOX_DEMO/PLAN、U9/U18 提示与设计、session-sandbox service/policy/backend、setup、sandbox tests、config-recovery。
- Group1 false-positive-optimization-plan、guard_fusion、plugin register/guard-events/result-gate/client、sidecar、test_protection_alert/live、demo/03-PROTECT-AGENT。

## 阶段 A 自检（实现前）

- [x] 设计已写，U22/U21 与实际模块引用明确。
- [x] 唯一主方案 A，明确未覆盖降级与禁止假闭环。
- [x] Docker 当前配置、srt 确认、U18 备份回滚明确。
- [x] 已保存真实误报前对照，正常/攻击矩阵与不关整链明确。
- [x] 非目标包含真组织 OIDC，仅 runbook 指针。
- [x] 风险和验收脚本名明确，失败保留证据。
- [x] 不 patch 内核、不重做 U22、U20 保持关。

## 阶段 B 结果

最终专项 PASS：`local-validation/u23-approval-graph-sandbox-fp/2026-11-08T13-51-22-199Z/attempt-04/report.json`。总报告和命令汇总在同级父目录 `report.json` / `DELIVERY.md`。

真实 OpenClaw + 本地双检测器 + loopback 确定性模型：4 正常 ALLOW、3 攻击 BLOCK 且停止确认，攻击模型请求/工具调用/读取增量均为 0；历史声明在 tool_result 也 ALLOW。真实原申请与重试的两条链经 CLI verify 均 exit 0。申请、自批拒绝、批准、执行回执在真实流中验证；显式拒绝另有真实 JWT/OPA Python 回归，不冒称本轮截图包含该动作。

U22、U14 聊天 ACL、演示身份和 U23 必跑命令均 exit 0；Group1 201、trace 37、sandbox 7，以及图/时间线、工作区回归通过。U14 重放实际命中 G204 到期，保留该原因，不把它改称 G206 消费拒绝。

配置前后 SHA 相同，保持 Docker/elevated=false/U20 off；宿主文件哈希相同。仅重载本机服务。attempt-01 为时间线测试旧选择器失败，已修正；attempt-02 通过；attempt-03 遇到主网关和检测服务退出，输入以 INPUT_CHECK_UNAVAILABLE 停止、模型/工具均 0，不算攻击分类通过。退出原因未确定，恢复后 attempt-04 完整通过。失败均保留，见 service-interruption.json；最终健康状态另见 final-runtime-health.json。长期服务守护仍需后续运维验证。
