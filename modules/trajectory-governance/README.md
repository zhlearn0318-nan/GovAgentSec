# 轨迹审计与受控技能演进

当前交付覆盖采集、评审门控、候选生成、联合准入、采购任务独立验证、确认发布/回退，以及只读审计页面。2026-11-03 经用户明确授权，正式 OpenClaw 已启用插件和本地轨迹采集，页面与接口认证检查通过。**尚未完成生产阈值标定、四组技能效果实验、全部原生/MCP 防护关联。**

## 已实现

- OpenClaw 被动插件：运行、模型、工具、最终输出事件；保留 run_id、tool_call_id、model_call_id。记录宿主提供的 session_key/session_id；AgentGuard 审批按可信 MCP 调用与请求编号关联，未知技能使用和任务分类不推测。
- 本地 JSONL 哈希链、封存清单、标识配对、脱敏和输入大小限制。无工具结果、异常、孤立及重复事件不能作为完整经验。
- 兼容实测的 `agent_end → llm_output` 顺序；模型失败不能被宿主 `agent_end.success=true` 掩盖。
- LocalJudge 四个接口；仅访问字面量回环地址、禁止重定向、固定模型摘要、严格结构检查、过长输入返回 unknown。默认 CPU 后台推理，请求结束卸载模型。
- 安全硬约束优先；未经本地标定不得通过。标定绑定模型、提示词、规则及任务类型。质量评估区分无失败和评估失败，按同类任务稳定选取前 K 条。
- SkillClaw 固定提交的最小生成组件；不启动其服务器，不调用外部模型，不给生成器执行工具或发布权限。
- 候选与已知技能加载根目录互斥；首版只接收 SKILL.md。修改内容或添加文件会使检查失效。
- 主动调用现有 Aegis + Group4 stdin 协议，保存判决与产物哈希；纯指令结果明确为语义审计，不称作脚本执行。
- 独立采购验收器：本地模型通过受控工具完成读取、计算、报告，代码按整数分验算；越权尝试或未完成任务使候选失败。工具为内存模拟业务接口，非任意 Shell 或生产接口。
- 发布前输出完整新旧文档及确认摘要；确认绑定文件哈希、前一版及验证证据。单个 SKILL.md 原子替换、版本归档、回退、事务中断恢复；拒绝覆盖非托管或被外部修改的技能。
- 标定工具检查人工标注、模型/提示词/规则版本与任务组隔离；未知结果保留在分母中。四组选择计划保存固定预算和种子，不冒充四组技能效果实验。
- 只读页面展示事件证据、两次运行对照、候选验证结果；数据接口保持网关认证，令牌仅在页面内存中使用。

## 本地使用

在项目根目录执行：

```powershell
# 首次下载；后续启动不加 -Download
.\scripts\Start-TrajectoryModel.ps1 -Download

# 六个合成能力样例，结果写入 local-validation；不是生产标定集
node scripts/probe_trajectory.mjs

# 用项目内临时目录避免 Windows 沙箱系统临时目录权限问题
New-Item -ItemType Directory -Force local-validation/test-temp | Out-Null
$env:TEMP = (Resolve-Path local-validation/test-temp).Path
$env:TMP = $env:TEMP
node --test modules/trajectory-governance/test/*.test.mjs
.\.runtime\protect\Scripts\python.exe -m unittest discover -s modules/trajectory-governance/test -p test_adapter.py
```

复制 `config.example.json` 到自己的本地配置后调整路径。loaderRoots 必须包含实际的工作区 skills、托管 skills、插件技能目录及所有 extraDirs；示例不能替代检查。数据根目录本身不要放入自动加载范围。

```powershell
node modules/trajectory-governance/cli.mjs list CONFIG.json
node modules/trajectory-governance/cli.mjs inspect CONFIG.json TRACE_ID
node modules/trajectory-governance/cli.mjs review CONFIG.json TRACE_ID
node modules/trajectory-governance/cli.mjs select CONFIG.json RECORDS.json TASK_FAMILY K
node modules/trajectory-governance/cli.mjs generate CONFIG.json RECORDS.json TASK_FAMILY K
node modules/trajectory-governance/cli.mjs admit CONFIG.json CANDIDATE_ID
node modules/trajectory-governance/cli.mjs validate CONFIG.json CANDIDATE_ID
node modules/trajectory-governance/cli.mjs request-approval CONFIG.json CANDIDATE_ID
node modules/trajectory-governance/cli.mjs release-review CONFIG.json CANDIDATE_ID
# 阅读新旧内容与验证证据后，以返回的 confirmation 确认
node modules/trajectory-governance/cli.mjs publish CONFIG.json CANDIDATE_ID ACTOR CONFIRMATION
node modules/trajectory-governance/cli.mjs rollback-review CONFIG.json SKILL_NAME VERSION_HASH
node modules/trajectory-governance/cli.mjs rollback CONFIG.json SKILL_NAME VERSION_HASH ACTOR CONFIRMATION
node modules/trajectory-governance/cli.mjs recover CONFIG.json SKILL_NAME
```

`RECORDS.json` 是受信操作员准备的已评审记录，不是模型随意上传的声明。记录含 trace_id、evidence_hash（完整事件数组的规范化 SHA-256）、original_task_group、task_family、trace_status、safety、quality、task_validation 和 data_reviewed；generate 会重新核验原始轨迹。技能发布没有网络写接口；发布命令只供本地受信操作员使用，不能注册成模型工具。任务工作台另有受 operator.approvals 权限约束的 AgentGuard 审批 RPC，不提供候选发布能力。

发布需显式配置 `publishRoot` 为选定的 skills 加载目录；`dataDir/releases` 归档目录必须位于加载范围之外。命令成功表示磁盘版本已切换，返回的 `loader_status=reload_required` 不声称正在进行的会话已重新加载。已通过真实 OpenClaw 新进程读取 A/B/A 三个版本的隔离测试；现有会话热加载仍需按宿主机制检查。

评分串联与标定：

```powershell
# CONTEXT.json 包含 context（任务、原始任务组、数据复核状态）和 oracleCase
node modules/trajectory-governance/cli.mjs assess CONFIG.json TRACE_ID CONTEXT.json
# LABELS.json 包含 rows、identity 和可选 requirements；默认每个类别/划分至少 10 条
node modules/trajectory-governance/cli.mjs calibrate CONFIG.json LABELS.json
node modules/trajectory-governance/cli.mjs compare-plan CONFIG.json RECORDS.json TASK_FAMILY K SEED
```

assess 会核对独立任务结果的 trace_id 和 evidence_hash，不接受与当前轨迹无关的成功声明；工具调用数由已观察事件核对。没有合格标定时 safety 仍为 unverified。compare-plan 仅输出四组入选清单，不能报告技能收益。

admit 需在本地配置提供 `admission.command/script/env/openclawVersion`，对应现有 `security.installPolicy.exec` 中的联合策略。不要把含私密环境变量的本地配置提交到仓库。

## 插件接入

`scripts/build_config.py --trajectory` 可以生成包含本插件的配置批次。默认安装流程保持原状。2026-11-03 已经用户授权在本机网关开启本插件的 `hooks.allowConversationAccess`，数据保存于 `local-validation/trajectory`；未放宽其他防护插件权限，原执行审批文件哈希保持不变。

页面：`/plugins/govagentsec/trajectory-panel`，已接入“使用后·审计中心”导航。静态页面不包含审计数据；`GET /plugins/govagentsec/trajectories`（可加 `?trace_id=...`）和 `/plugins/govagentsec/candidates` 都使用宿主 gateway 认证。未授权不会返回记录；没有候选发布 HTTP 接口。

### OpenClaw 原生历史与调用图

在 OpenClaw 侧栏展开“更多”，选择“历史调用轨迹”；也可访问 `/plugin?plugin=govagentsec-trajectory&id=history`。原生页面复用当前登录连接，通过 `govagentsec.trajectory.list/detail/candidates` 三个只读 RPC 读取记录，所需 scope 为 `operator.read`，无需重复输入令牌。

聊天区右下方固定显示“任务与轨迹”按钮，在当前页面打开非模态侧栏；关闭按钮或 Esc 返回对话，不清除输入草稿。默认按宿主 session_key 筛选当前会话，也可切到全部历史。侧栏分为过程、风险与审批、证据；待审批动作经原 AgentGuard 审批链处理。安装：`node scripts/install_trajectory_chat.mjs`；恢复：`node scripts/install_trajectory_chat.mjs --restore`。升级 OpenClaw 后需重新适配。

只读 task/status RPC 使用 operator.read，resolve RPC 使用 operator.approvals。MCP 请求文件从已有 statusPath 的 `.requests` 目录读取，与调用 ID 和适配器生成的请求编号匹配；不解析任意工具文本来发起审批。详细流程、验证命令和证据边界见 [任务工作台](../../docs/task-workbench.md)。

左侧支持搜索和来源筛选，默认按记录时间倒序；中间以任务、模型、工具三列显示事件；右侧点击查看节点输入、输出、错误、耗时及原始证据。虚线表示记录顺序，实线只连接唯一且相同调用 ID 的开始和结束，不按邻近事件推断因果。支持缩放、滚动、完整时间线和双运行对照。启用采集之前的旧会话不会自动补造调用记录。

原生视图适配命令：`node scripts/install_trajectory_view.mjs`。脚本仅向当前 OpenClaw 前端插件视图注册表添加本插件映射，首次备份原文件；`node scripts/install_trajectory_view.mjs --restore` 可恢复。升级 OpenClaw 后需要重新运行适配，遇到不兼容的前端结构会停止，不覆盖文件。无需调整 iframe 隔离或审批权限。

验证命令：`node --test modules/trajectory-governance/test/*.test.mjs`、`node scripts/test_trajectory_ui.mjs`、`node scripts/test_trajectory_native.mjs`。最后一项使用本机已登录凭据验证实际 OpenClaw，测试报告不包含令牌。

隔离 OpenClaw 必须同时设置子进程 `OPENCLAW_HOME`、`OPENCLAW_STATE_DIR` 和 `OPENCLAW_CONFIG_PATH`，且 state 指向专用 home 下的 `.openclaw`。只改 state 会触发旧审批迁移。`scripts/verify_trajectory_release.mjs` 已按此方式实测发布与回退，并在每次宿主调用后核对真实审批文件哈希不变。

## 验证结果与边界

详见 [开发记录](../../docs/trajectory-development.md)。合成探针能证明调用和约束生效，不能证明生产准确率或新技能收益。

- 脱敏规则只覆盖常见字段和模式；自动选择还要求 data_reviewed。默认不收集隐藏思考。
- 完整性描述已观察事件的配对，不证明宿主从未漏报。当前清单与轨迹位于同一权限域，尚无独立可信校验副本。
- `skill_usage=unknown`。AgentGuard 请求、审批及回执已经关联；MCP 配置摘要只匹配执行前同摘要的准入记录，不证明远端服务代码版本。旧轨迹未采集会话标识时仍显示未知。
- 轨迹写入针对单宿主进程；重启后的未完成记录保留为不完整。本版本不支持多个进程向同一轨迹目录并发写入。
- `Workshop.validate` 检查独立案例与产物哈希，由采购验收器提供证据；模型不能自行给出 passed。文件和本地 CLI 仍属于受信操作员权限域，不提供抵抗本机管理员伪造证据的保证。
- 单条完整 OpenClaw 测试不代表已验证并行、取消、原生工具和 MCP 全路径；这些当前仅有组件测试或仍待实测。
- 尚未配置生产安全阈值；历史 0.55 不会自动启用。首个真实生成候选在三项独立任务中完成两项、另一项未完成，已拒绝；发布/回退测试使用明确标注的测试夹具，不能作为该候选通过的证据。
