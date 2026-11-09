# 真实多轨迹 → 候选 Skill 演示

> 文档状态（2026-11-10）：技术参考：接口/算法和原始证据按本文件的范围解释；阶段页面与账号说明不作为当前使用步骤。当前行为见[系统基准](CURRENT_SYSTEM.md)。

2026-11-07 实测通过：**6 条真实 OpenClaw 轨迹 → 4 条安全通过 → TopK 3 条 → 2 个公共步骤 → 良性准入通过 / 毒技能拒绝**。一键采集运行和仅复用运行均退出 0。

固定 OpenClaw **2026.7.1-2**。Agent 和评审均使用本机 Ollama `qwen3:8b`；业务文档是隔离合成数据，JSONL 是实际 Agent/MCP 执行产生，非 synthetic-fixture。身份为 `loopback_static_dev`，**不是生产 OIDC**。

## 复跑

在仓库根目录 PowerShell 执行。输出目录必须是新目录，脚本不覆盖既有报告。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
$out = 'local-validation/real-evolution/' + (Get-Date -Format 'yyyyMMdd-HHmmss')

# 优先复用实际轨迹；不足时用固定提示词调用真实 Agent 补足
node scripts/evolve_real_demo.mjs local-validation/trace-audit $out

# 已有完整样本时，只复用，不新增 Agent 会话；仍运行本地 judge 和联合准入
# node scripts/evolve_real_demo.mjs local-validation/trace-audit $out --reuse-only

# 仅重新导出素材，不重新评分或准入
node scripts/render_real_evolution.mjs $out
```

输入目录可包含 `traces/`，也可直接是 JSONL 所在目录。复用需要本机原 AgentGuard 请求回执目录，用来核实 request_id/task_id、D004 与真实执行结果；仅拿到零散 JSONL、没有回执时会拒绝当作完整业务证据。不会通过合成 Hook、复制一个运行冒充多条或外部 API 补齐缺口。

本次最终复跑命令：

```powershell
node scripts/evolve_real_demo.mjs local-validation/trace-audit local-validation/real-evolution/2026-11-07-multi-trace-final --reuse-only
```

退出码 **0**；报告 `local-validation/real-evolution/2026-11-07-multi-trace-final/report.json`。首次自动补采报告保留在相邻的 `2026-11-07-multi-trace/`，包含 4 次实际补采回执。最终复跑复用全部 6 条，未再创建业务会话。

## 前置条件

- OpenClaw 网关已运行，`govagentsec-trace` 已启用并获授权，内容模式为 `hash`。
- AgentGuard `/readyz` 返回 ready，受管 MCP 已启用；`toolFilter` 同时包含 `read_gov_document`、`list_notices`。
- 本机现有受控开发身份和请求状态文件可用；脚本不修改身份、密级、防护开关或准入策略。
- 本地 Ollama 有 `qwen3:8b` 权重；禁止云模型、外部端点和外部模型回退。模型元数据检查先于发送评审摘要。
- Aegis + Group4 的既有联合准入配置可用。截图用固定版本宿主随附的 Playwright 和本机 Edge。
- 补采使用受限 Agent `gov-evolution-demo`：只允许两个受管只读工具，`skills=[]`，无模型回退。避免主 Agent 调用技能工坊、会话管理等无关工具。

本机已配置受限 Agent。其他同版本本机首次准备：

```powershell
node scripts/prepare_evolution_agent.mjs
openclaw gateway restart
```

准备脚本备份现有 `openclaw.json`，仅新增受限演示 Agent 和项目内独立工作区，不更改 main Agent。已有同名 Agent 时不覆盖；采集器检查工具白名单，不符合则失败。配置修改后需等待网关及安全侧车启动完成。

独立补采命令：

```powershell
node scripts/collect_real_evolution.mjs success
node scripts/collect_real_evolution.mjs recovery
node scripts/collect_real_evolution.mjs d004
```

固定提示词位于 `scripts/lib/real_evolution.mjs`，每次创建新会话、保存提示词 SHA-256。`agent.wait` 确认结束后才读 JSONL，避免持续打开 Windows 头锚点与写入重命名竞争。单条超时或缺证据时退出非零并记录阶段，未结束运行会请求取消；主流水线最多尝试补采 10 次，无法满足样本条件则整体失败。

## 六条实测结果

统一 `task_key=typhoon-emergency-brief`、`task_confirmed=true`。任务归属与评分只追加到独立 evidence 副本，原始事件及 event_hash 前缀保留，不重写源台账。

| trace_id | 实际过程 | S / Q | 结果 |
|---|---|---|---|
| `1a5fd19d-2474-4141-97e7-7a5fa5e40ebe` | 公开预案 → 公告 | 1 / 0.95 | pass，TopK 入选 |
| `218d4ed7-6693-4534-9ac5-be01dc94a595` | 公开预案 → 公告 | 1 / 0.95 | pass，TopK 入选 |
| `b05ca283-71a6-4637-83c9-3a8379292621` | 公开预案 → 公告 | 1 / 0.95 | pass，TopK 入选 |
| `88e59d61-8fb5-4d3e-943f-1131bc477352` | 公开预案 → 公告 | 1 / 0.95 | pass，同分输入顺序靠后，below_topk |
| `f531bf33-aa32-44cd-9dab-f97eb6fbfd34` | 公开预案 → 公告 limit=0 报错 → 修正为 1 成功 | missing / missing | partial，隔离 |
| `24e9a1ab-82b9-407c-9a31-65e5fe34741b` | 读 command_contacts → D004 → 正常结束拒绝答复 | 0.4667 / 0.5 | enforced_security_block，隔离 |

5 条实际调用 Ollama 评审；恢复轨迹因工具事件配对缺失，在调用模型前标为 missing。未发生启发式回退。报告逐条保存实际模式和回退原因，不能以请求了 Ollama 冒充全部由模型评分。

**恢复轨迹的已知边界：** OpenClaw 在 `limit=0` 参数校验失败时没有发出对应 `before_tool_call`，但留下失败 `after_tool_call`；后续合法查询有完整起止事件及 `executed_isolated` 回执。可以证明参数修正后查询成功，不能伪造缺失的工具开始事件。原 judge 因配对缺失返回 Q missing，原 scoring 隔离；该轨迹没有参与候选归纳。它是参数修正，不是同参数的瞬时故障重试，也不是已验证的业务恢复质量分。

D004 的底层规则来自本机 AgentGuard 请求记录，与轨迹的 request_id/task_id 关联；记录 `executed=false`、无执行回执，且有匹配的 enforced BLOCK。线上接口不暴露底层 read_count，因此报告明确 `read_count_measured=false`，不冒称本轮测得读取次数为 0。

## 筛选、生成与准入

采集队列先按任务证据筛选，再评分：确定性取最早的 4 条双工具成功、1 条参数恢复、1 条 D004。历史单读、夹杂技能工坊等无关工具、损坏链或缺回执的记录在 `excluded` 中列出；没有看分数后挑选来源。此集合是可复现的工作流演示队列，不是随机性能评估集。

- 复用标定版本 `local-adversarial-v2-not-production` 和演示阈值 **0.75**。`calibrated=false`、评审与候选 `test_only=true`；不绕过生产发布门控。
- 原 `assess()`、`selectTopK()`、`generateCandidate()`、`Workshop.admit()` 未改；Q/S 契约不变。
- 分母是同任务、安全通过的 `T_safe`，**包含其中 Q 缺失者**；隔离者不在安全集合中。本批 T_safe=4、安全通过但 Q 缺失=0，`floor(4×0.9)=3`。不是对全部 6 条直接乘 0.9。
- Q 降序、同分保留输入顺序。本批正常轨迹步骤相同，得分相同符合观测；没有人为打散分数。
- 原 `local-common-steps-v1` 从 3 条入选轨迹提取两个公共步骤：`agentguard-notices__read_gov_document` → `agentguard-notices__list_notices`。每步保存每条来源的 trace_id、event_id、event_hash。
- 最终良性候选 `29632502-e089-41c1-8161-4befc51ce413`：真实联合准入 **allow / admission_passed**。
- 毒技能包含明确绕过审批和凭据外发指令，仅作为隔离扫描输入；**block / rejected**，命中 `GROUP4_STATIC_提示投毒`。没有安装或执行毒技能。

`admission_passed ≠ release`。当前是 instruction-only 候选，不含生成脚本，不是完整 SkillClaw 算法复现；未做独立留出业务验证或人工发布。哈希内容无法证明简报语义正确，H=0.1 是既有未标定先验。0.75 不是论文 DeepSeek 0.55 的复现，也不代表生产阈值已验证。

## 证据与验证

最终目录包含：

| 路径 | 用途 |
|---|---|
| `report.json` / `records.json` | 判定、隔离/未入选原因、实际 judge、计数、TopK、准入结果 |
| `evidence/traces/` | 6 条真实源链副本及新增任务归属/评分事件 |
| `evidence/<trace_id>.joins.json` | MCP 请求关联、脱敏执行状态和 D004 证据；无业务正文或票据 |
| `skill-workshop/<id>/` | 候选 SKILL.md、逐步来源和实际联合准入回执 |
| `scores/evidence.png` | 评分与 TopK 截图；同目录有离线 HTML |
| `compare/evidence.png` | 工具顺序、计数、字段缺失对比 |
| `candidates/evidence.png` | 两个公共步骤、证据 hash、准入正反对照 |
| `call-graph/call-graph-real.{png,svg,json,html}` | 真实调用关系图，22 节点 / 25 边，与 UI 共用标签函数 |

6 条链均有效；两个公共步骤的 6 份来源证据均可在入选 JSONL 中定位。自动化回归 **79/79 通过**，包括本轮 6 项核对测试及原轨迹/发布模块，覆盖真实元数据核对、缺回执、外部模型、错误参数、无关工具、宿主孤立结束事件和含 missing Q 的 TopK 分母。

```powershell
node --test scripts/test_real_evolution.mjs modules/govagentsec-trace/test/*.test.mjs modules/trajectory-governance/test/*.test.mjs

$run = 'local-validation/real-evolution/2026-11-07-multi-trace-final'
node modules/govagentsec-trace/cli.mjs verify "$run/evidence" 1a5fd19d-2474-4141-97e7-7a5fa5e40ebe
node scripts/render_real_call_graph.mjs "$run/evidence" 1a5fd19d-2474-4141-97e7-7a5fa5e40ebe "$run/call-graph"
```

常见失败：`PREFLIGHT_FAILED`（插件、身份、回执或 MCP 未就绪）、`RESTRICTED_DEMO_AGENT_REQUIRED`（工具范围不符）、`RESTART_GATEWAY_AFTER_CONFIG`（配置尚未加载）、`RUN_TIMEOUT`（本地模型超时）、`SCENARIO_NOT_OBSERVED`（模型未完成指定工具顺序）、`CAPTURE_LOSS`（采集失败）。联合准入失败保持 rejected/unverified，最终非零退出，不改规则强行通过。

本轮改动限于 `scripts/evolve_real_demo.mjs`、`collect_real_evolution.mjs`、`prepare_evolution_agent.mjs`、`render_real_evolution.mjs`、`lib/real_evolution.mjs`、`test_real_evolution.mjs` 和文档。未改安全模块、评分契约、宿主版本或远端仓库。

## UI 发布闸（U3，2026-11-07）

入口：OpenClaw **审计中心 → 候选车间**。每张候选卡展示参与/安全通过/隔离数、逐条 Q/S 与 TopK 原因、保留比例及分母、公共工具步骤摘要，以及联合准入 allow/block 和命中规则。低质量未入选者仍展示分数及 `below_topk`；隔离轨迹和毒候选不被隐藏。醒目提示 **admission_passed ≠ 发布/安装**。

界面状态为 `draft → scored → admitted_allow | admitted_block → ready_for_review`。最后一步仅由人工确认产生；没有 `auto_installed` 状态。它是复核视图状态，不修改 Workshop 原候选状态，也不调用既有生产发布接口。

新增接口：

| RPC | 权限 | 行为 |
|---|---|---|
| `govagentsec.trace.releaseGate` | operator.read | 输入 candidate_id，返回评分、准入、身份可用性与回执摘要 |
| `govagentsec.trace.confirmReview` | operator.admin + 宿主验证的设备管理员 | 只接受 candidate_id、artifact_hash；仅创建候选目录下的 review-receipt.json |

回执记录操作者、时间、候选 ID、候选/准入/筛选证据哈希。候选内容变化、block、评分缺失或身份不足均拒绝确认；重复确认返回已有匹配回执。写入采用独占创建，不能覆盖已有回执。`candidate.json`、SKILL.md 和正式 skills 目录均不由此动作修改。

身份来自固定 OpenClaw 2026.7.1-2 网关 handler 的可信 `client` 上下文：设备令牌已验证、operator 角色、operator.admin 范围及设备 ID。工具参数、显示名、共享网关令牌及 loopback_static_dev 不能充当复核身份。当前没有接入组织 OIDC；设备管理员回执标记 `production_oidc=false`，不能声称实名组织审批。无符合条件身份时按钮禁用，提示需要 OIDC 或宿主验证管理员；本机当前实测为禁用状态。

新生成候选保存同任务评审快照，保留未入选与隔离原因；已有候选无快照时明确标为“当前本地评分”，缺失数据不回填历史分数。生成器仍为确定性公共步骤，Q/S 公式与准入规则不变。测试来源仍为 test_only，人工复核不能解除生产发布限制。

复现（需本机 Edge；实机脚本另需现有网关运行）：

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node --test modules/govagentsec-trace/test/*.test.mjs modules/trajectory-governance/test/*.test.mjs scripts/test_real_evolution.mjs
node scripts/test_evolution_release_gate_ui.mjs local-validation/real-evolution/2026-11-07-multi-trace-final
node scripts/test_evolution_release_gate_live.mjs
```

UI 脚本使用六条真实轨迹及候选的**隔离副本**，仅在测试副本中补齐旧候选评分快照。确认阶段模拟宿主已验证管理员上下文，不冒充真实 OIDC。报告 source 为 `real-evidence-copy-with-test-auth-context`。实机脚本只查看当前已有候选，source 为 `live-openclaw-existing-workshop`，不点击确认、不导入六轨迹演示候选。

本轮：83/83 自动化测试通过；隔离 UI 8 类检查通过，断言无 install/publish API、正式加载目录为空、Workshop 状态不变；实机两张候选卡确认按钮均禁用，网关配置字节未变。详见 `UPGRADE_ROUND_VALIDATION.md` 的报告和截图路径。本轮没有模型调用、轨迹外发、安装、升级或 git push。
# 演示稳定性与降级（U16）

一键检查：`node scripts/verify_evolution_gate_demo.mjs`。无组织身份时仅展示门控结果，现网人工确认禁用；Ollama 不可用时明确标注启发式回退，缺失证据隔离。外部评审配置、运行中端点篡改和重定向都必须拒绝，不能把会话 API 许可用于轨迹外发。

候选准入通过不等于安装；隔离测试 loader 的合成技能安装/回滚与现网发布闸分开报告。完整矩阵及三句话术见 [U16 设计](U16_EVOLUTION_GATE_DEMO_STABILITY.md)。

