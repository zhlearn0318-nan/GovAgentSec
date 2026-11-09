# GovAgentSec Trace

固定 OpenClaw 2026.7.1-2 的只读采集插件。prompt、参数和输出默认只存脱敏哈希；不修改 Agent 决策、不注册工具、不调用外部模型。

逐次 token：公开 `model_call_ended` 钩子在固定版本不含 usage；插件兼容保存实际提供的计数，缺失时保留元信息，图节点不显示“token 未提供”，`model.output` 单独标注运行汇总。在线图、时间线和离线导出共用标签；合成夹具数字不代表真实钩子已支持。详见 [U19 设计与验收](../../docs/U19_PER_CALL_TOKEN_USAGE.md)。

可选 [U20 本机 HTTP 包装层](../govagentsec-usage-wrapper/README.md)（默认关）：从上游回包采集逐次 usage，经公开 trace/span 精确关联后追加 `model.usage`；模型返回节点显示注解用量，详情保留原事件，哈希链不改写。缺失/重试歧义不造数，安全评审路由不变。

界面：OpenClaw **演进审计** → 选择轨迹 → 调用关系图 / 毫秒时间线。勾选同任务记录后“对比所选轨迹”；“候选 Skill”查看逐步骤来源与联合准入结果。测试轨迹默认隐藏，需勾选“包含本地合成测试”。

未评估的运行显示“尚未评估”；当前横向图按 LLM、Skill、MCP / 工具、结果、防护 / 审批五类分栏。当前产品入口以 [系统基准](../../docs/CURRENT_SYSTEM.md) 为准。

## 安装与配置

项目安装器使用 `scripts/build_config.py --trajectory` 时同时配置新采集器和原工作区。已有工作区可运行 `node scripts/enable_trace_audit.mjs`，会备份本机配置，授权新插件读取本地对话以计算哈希，自动沿用现有安全策略。固定宿主的配置监视器会重载插件；如没有重载，再重启网关。不要手动修改现有审批规则。

新插件启用时旧采集器停止重复记录原始内容，旧记录不改写，通过兼容只读视图保留历史入口。

插件配置只接受 `dataDir` 与 `contentMode=hash|summary`。config.example.json 的 scoring/generation 是本地评审/CLI 配置，不能整份直接粘贴进插件 configSchema。

## 接口

- `TraceStore.append/read/list/assign`：JSONL 追加、完整性验证、显式任务归属。
- `LocalJudge.review`、`assess`、`quality/safety/selectTopK`：本地评审、严格边界、稳定排序。
- `generateCandidate`：有序公共步骤及来源证据 → 独立 skill-workshop；复用 Workshop.admit。
- Gateway `govagentsec.trace.list/detail/health/candidates`：operator.read。
- Gateway `govagentsec.trace.assign/generate/admit`：operator.write。写入审计关联或候选区，不安装/发布。
- HTTP 仅公开无数据的 view.mjs/view-model.mjs；所有审计数据走已认证网关。

## 运行

在仓库根目录：

```powershell
node scripts/probe_trace_hooks.mjs
node --test modules/govagentsec-trace/test/*.test.mjs
node modules/govagentsec-trace/demo.mjs
node scripts/test_trace_audit_ui.mjs DATA_DIR
node scripts/load_trace_demo.mjs DATA_DIR
node scripts/test_trace_audit_live.mjs
node modules/govagentsec-trace/cli.mjs verify DATA_DIR TRACE_ID
node modules/govagentsec-trace/cli.mjs generate DATA_DIR modules/govagentsec-trace/config.example.json
```

最后一条先填写配置中的 records 和 loaderRoots。演示依赖本项目已配置的真实 Aegis+Group4 运行环境，不改准入规则。load_trace_demo 只接收已验证的六条合成记录且不覆盖已有链；更换 demo 时使用新的数据目录，不能改写既有审计证据。

`examples/traces` 含两条完整合成运行及头锚点，可运行：

```powershell
node modules/govagentsec-trace/cli.mjs verify modules/govagentsec-trace/examples fixture-word-1
node modules/govagentsec-trace/cli.mjs verify modules/govagentsec-trace/examples fixture-word-2
```

字段、覆盖和哈希算法见 [Hook 核验](../../docs/TRACE_HOOK_VERIFICATION.md)；评分分母、论文差异及限制见 [评分与候选演进](../../docs/TRACE_SCORING_AND_EVOLUTION.md)。

## 本地 Judge 标定回归

```powershell
node scripts/judge_calibration_demo.mjs
node scripts/judge_calibration_demo.mjs --judge heuristic
node modules/govagentsec-trace/cli.mjs assess DATA_DIR TRACE_ID JUDGE_CONFIG.json
```

默认只调用本机 Ollama，失败明确记录启发式回退。9 条样例全部标为 synthetic；报告要求 pass/quarantine 与 S/Q 均有区分，缺失证据不得补分。CLI 的 judge 支持 ollama、heuristic、fixture。版本 `local-adversarial-v2-not-production`、阈值 0.75 与 H 先验都是开发演示配置，不等于论文 DeepSeek 阈值复现或生产标定。详见 [实测结果、计数规则与限制](../../docs/LOCAL_JUDGE_CALIBRATION.md)。
