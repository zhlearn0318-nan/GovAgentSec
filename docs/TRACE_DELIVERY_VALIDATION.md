# 轨迹与候选技能交付验证

2026-11-07 最新：[真实六轨迹 → TopK → 两步候选 → 联合准入](REAL_MULTI_TRACE_EVOLUTION.md) 已实测两次退出 0，79 项自动化回归通过。使用非生产 loopback_static_dev 演示身份；一条参数恢复轨迹因宿主缺少工具开始事件而隔离，未补造事件。以下早期阻塞与默认身份状态保留为历史记录，不代表本机最新演示状态。

2026-11-07 补充：[调用关系图修复及真实 UI/离线验收](TRACE_CALL_GRAPH_VALIDATION.md)。使用已通过冒烟的 `4af42d89-727a-45cb-b1b0-5f6406699928`，保存 evidence 为 22 节点/26 边，实际 OpenClaw 当前台账为 26 节点/30 边（追加归属/评分事件）；原始事件哈希前缀一致。图、时间线和离线 PNG/SVG 已实测非空，并完成异步选择/筛选/Tab 回归。

交付日期：2026-11-06。固定宿主 OpenClaw 2026.7.1-2；未升级，未执行 git push，未修改远端。指定 v2 不在 docs，已向用户说明并采用工作区升级方案目录中的同名 v2。

## 实测结果

| 检查 | 结果 | 证据 |
|---|---|---|
| 新轨迹核心 + 原轨迹/发布 + 原防护/审批/面板/工作台/安装器 | 76 项通过 | local-validation/trace-final-node-tests.log |
| 安装配置与 Group4 规则回归 | Python 7 项通过 | scripts/test_release.py |
| AgentGuard 身份边界 | Python 5 项通过 | scripts/test_identity_boundary.py，使用 AgentGuard 自身 .venv |
| 原 SkillClaw adapter | Python 4 项通过 | modules/trajectory-governance/test/test_adapter.py |
| 固定宿主实际取消接口 | 通过；取消信号、后续工具拒绝、agent_end 确认 | scripts/test_stop_host.mjs |
| 固定宿主 hook dispatcher | 7 种事件通过 | docs/TRACE_HOOK_SOURCE_HASHES.json |
| 新界面浏览器交互 | 11 类检查通过 | local-validation/trace-ui/result.json、graph/compare/candidates.png |
| 真实 OpenClaw 工作区 | 页面加载、hash 模式、匿名 401、原防护保持启用 | local-validation/trace-live/result.json、openclaw-audit.png |
| 最终六轨迹演示 + 真实联合准入 | 四条正常入选；投毒隔离；低质量不入选；候选 allow、恶意候选 block | local-validation/trace-demo-1793894121519/report.json |
| 两条可分发合成样例 | 每条 23 个事件、哈希链验证通过 | modules/govagentsec-trace/examples/traces |

默认开发身份仍停用。浏览器实测没有发送模型请求。六轨迹是明确标注的本地合成事件重放，不是一次真实模型性能/检测准确率实验。联合准入实际调用原 Aegis+Group4 进程，没有用假 scanner。

2026-11-06 补充 [真实短链冒烟脚本与报告](TRACE_LIVE_SMOKE.md)：`scripts/smoke_real_trace.ps1` 实际运行退出码 1，连接网关和轨迹插件成功；因 MCP 禁用、缺 OIDC、本地模型未接入而在前置检查退出。未产生真实 Agent 轨迹，生产路径端到端验收仍未通过。新增核对器及原轨迹模块测试 28/28 通过。报告为 `local-validation/trace-live-smoke/2026-11-06T13-27-14-241Z-5b35a45c/report.json`。

首次候选因描述过于笼统被 Aegis 阻断；修改生成内容为具体任务、工具、输入输出及审批约束后重新生成候选通过。未修改准入规则。旧工作台测试仍期待开发身份审批按钮，本轮改为默认验证按钮不可用；旧开发态执行测试须显式测试环境开关，不影响产品配置。

## 本地使用

入口：`http://127.0.0.1:18789/plugin?plugin=protect-agent&id=govagentsec&section=audit`，使用已登录工作区。勾选“包含本地合成测试”查看已导入的演示；默认业务列表不混入测试。

新插件已在本机启用，配置有带时间戳备份。旧采集器停止重复存内容，但保留旧记录和只读兼容视图。真实任务从此写入 local-validation/trace-audit/traces。新候选只写 skill-workshop；没有自动安装。

```powershell
node scripts/probe_trace_hooks.mjs
node --test modules/govagentsec-trace/test/*.test.mjs modules/trajectory-governance/test/*.test.mjs
node modules/govagentsec-trace/demo.mjs
node scripts/test_trace_audit_ui.mjs DATA_DIR
node scripts/test_trace_audit_live.mjs
node modules/govagentsec-trace/cli.mjs verify DATA_DIR TRACE_ID
```

## 变更文件与接口

- 新增 modules/govagentsec-trace：privacy/store/register/index/plugin manifest、scoring、evolution、fixtures/demo/cli、view/view-model、legacy-reader、配置示例、README、核心测试、两个 JSONL 样例及锚点。
- 新增 scripts：probe_trace_hooks、enable_trace_audit、load_trace_demo、test_trace_audit_ui、test_trace_audit_live。
- 修改 govagentsec-ui/workspace.mjs：审计/对比入口使用新视图。
- 修改 Group1 result-gate.mjs：只读观察订阅，订阅异常不影响防护判定。
- 修改旧 trajectory-governance/register/task-links：旧历史兼容和保留原请求 ID；gates/assessment：阈值等号隔离；releases：测试候选禁止生产发布。
- 修改 build_config.py：部署新只读插件；test_task_workbench：对齐已停用开发身份的真实默认。
- 更新 README；新增 TRACE_IMPLEMENTATION_PLAN、TRACE_HOOK_VERIFICATION、TRACE_HOOK_SOURCE_HASHES、TRACE_SCORING_AND_EVOLUTION、本文件。

接口详情见模块 README。核心为 TraceStore、LocalJudge.review、assess、selectTopK、generateCandidate，以及带 operator.read/write 作用域的 govagentsec.trace.* RPC。

## 仍存在的限制

1. 默认评审器仅验证合成样例。真实轨迹缺少可信本地评审/标定证据时 Q/S 缺失或隔离，不宣称具备自动生产自演进能力。
2. 内容哈希不能反推完整任务语义。生成使用公共工具序列、字段名和操作者补充说明；是确定性本地归纳器，不是 SkillClaw 算法复现。当前只生成 instruction-only Skill，无需新脚本。
3. agent_end 无 skillsUsed；Skill 文件读取不代表完整执行。CLI/native/MCP 事件覆盖不一致，逐次 token 不可由汇总用量推算。
4. hash 链与同机锚点不能防有权限的整链重写。磁盘完全不可写且随后进程崩溃时，未落盘事件的精确数目不可恢复。
5. 原流式回复防护仍为观察模式，本轮没有更改其能力声明。组织 OIDC 仍需真实配置。
6. 新插件的宿主注册与 UI 已实测，生产模型/MCP 全路径尚未做逐一端到端验证；探针是实际 dispatcher 加合成载荷。未为验证而向外部模型发送轨迹原文。
