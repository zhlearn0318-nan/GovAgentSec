# 轨迹审计与候选技能实施计划

基线：OpenClaw **2026.7.1-2**，保留本机已有安全补丁，不升级。

指定的 v2 不在本仓库 docs 中。本轮实际依据是 `../升级方案/GovAgentSec-轨迹审计与技能自演进设计方案-v2.md`；没有用 v3 替代。最新用户要求优先于 v2 的推测接口。

## 已确认的接口与实施顺序

1. 固定宿主的 `api.on` 只读观察器：`before_agent_run`（runId 来自 ctx）、`model_call_started/ended`、`before/after_tool_call`、`llm_output`、`agent_end`。`agent_end` 无 skillsUsed，model_call_ended 无 usage；embedded 的 agent_end 先于 llm_output。因此不在 agent_end 封账，也不虚构单次模型 token。详见 TRACE_HOOK_VERIFICATION.md。
2. 新模块 `modules/govagentsec-trace`：`TraceStore.append(event)`、`read(runId)`、`list()`；JSONL 唯一事实源，SHA-256 文件名仅用于安全定位，事件 trace_id 保留原 runId。关联字段 request_id/task_id 独立保留。摘要默认 hash，不存原文。
3. `LocalJudge.review(trace)` 可注入本地实现；默认 FixtureJudge 仅认显式合成测试证据，真实轨迹返回缺失。评分与选择独立纯函数。阈值与标定集版本必填，测试评分不得流入生产发布。
4. 以同 task_key 的 T_safe 评分记录数（包括 Q 缺失）为 TopK 分母，floor(n*0.9)；Q 缺失不入选，同分保持输入顺序。安全 S 必须严格大于 t_star。论文 evaluation_error 的降级分支与用户缺失要求冲突时采用更严格的 Q 缺失。
5. 确定性公共步骤归纳器输出 instruction-only SKILL.md，不宣称复现 SkillClaw。沿用现有 Workshop.create/admit、combined_install_policy。保留隔离目录、内容哈希、人工确认和独立验证要求；不安装候选。
6. UI 使用已认证 gateway RPC `govagentsec.trace.*`，新视图复用工作区审计/对比入口，历史记录仍可查看。RPC 读操作 operator.read，人工 task_key 关联 operator.write；不开放匿名数据接口。
7. 自动测试、至少 6 条纯本地合成运行、真实联合准入 allow/block、既有安全回归；所有结果注明来源，禁止向外部模型发送审计数据。

## 保留边界

- Group1/AgentGuard/Aegis/Group4 的判定、审批与执行代码不重写；仅增加只读审计订阅。
- 新收集器启用时旧采集器停止重复记录内容，旧 UI/RPC 与安全模块继续工作。
- 只读取到 SKILL.md 可证明文件被读取，不能证明技能完整执行。CLI/MCP 的事件覆盖按核验事实提示缺失。
- 哈希链证明本地文件的连续性，非外部签名或不可抵赖证明；完整改写事件与锚点不能靠本地 hash 发现。
- 不执行 git push，不修改远端。
