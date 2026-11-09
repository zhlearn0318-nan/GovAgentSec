# U24 任务工作区与本地改进流程

2026-11-09。根据本轮体验评审执行开发；基线 OpenClaw 2026.7.1-2、release/3.0，保留U22/U23未提交改动。不升级、不push、不patch宿主；轨迹不外发。

## 阶段A：设计与接口确认

目标是让业务用户沿“登录→选择材料→执行→权限处理→看过程→本地评审→候选”操作，保留原安全判定与票据链。产品页面显示当前结果和下一步，验收细节留独立文档。

| 切片 | 方案 | 不变的安全约束 |
|---|---|---|
| 入口与布局 | 无秘密的同源中文欢迎页；管理员连接与业务登录区分；主导航任务/待审批/能力库/审计与改进；顶栏仅查看过程 | 不跳过网关认证，不把token写静态页或新增浏览器存储 |
| 材料选择 | demoIdentity.materials与select_materials，只提交服务端登记ID；显式选择建立现有精确任务契约 | 主体来自JWT；路径/密级不接收前端覆盖；运行中不可变更；不扩大目录 |
| 到期恢复 | task_reapply针对原人、过期未消费授权，创建新request重新核验/审批 | 原失效票据墓碑不删除，自批、硬拒绝、已消费均不能重开 |
| 过程 | 恢复原横向分栏调用图，默认保留全部事件；可切时间线；可见运行约1.5秒增量刷新，结束后有限等待延迟审批 | 不丢原始事件、不假造因果、字段缺失不补0 |
| 本地评审 | assessmentStart/Status/Cancel包装原LocalJudge/assess；selectionPreview绑定真实集合与证据快照 | loopback与可信服务端配置；生产未标定保持false；UI过程评审test_only，不得生产发布 |
| 历史与候选 | 服务端限定的历史真实证据包只读浏览；generate接明确trace_ids与快照 | 不接受任意路径、不偷导入现网、不安装候选、不修改scoring公式 |
| 能力库 | 配置、连接、具体版本准入、当前任务权限分列；MCP模板＋明确确认；原始详情折叠 | 配置可用不冒充准入；仍走原combined策略；检查失败不安装 |

身份/任务细节见U24_TASK_MATERIALS_APPROVAL.md；本地评审细节见U24_LOCAL_ASSESSMENT_FLOW.md（由相应切片同步交付）。现有策略task_id每运行可不同，UI只关联，不重写。get_control_request_status补当前ACL映射，不能因名称看似只读跳过身份/归属核验。

视觉：底色#f5f7f7、纸面#ffffff、主墨#233e3b、操作绿#1e695b、警告#9c6524、阻断#b14942；标题Segoe UI Variable/Microsoft YaHei UI，正文Microsoft YaHei UI，技术详情Consolas。沿用工作区风格，不做宣传网站。唯一突出元素是当前任务的材料与动作摘要；减少双顶栏、重复快捷入口和大空卡。

阶段A自检：已有安全内核可复用；不新增组织身份源；欢迎页仅静态内容；全部新变更均有可信来源；过期恢复不重放；评审来源与演示限制不隐藏；明确全量事件与聚合投影；不通过改公式或伪造分数满足演示。**通过，开始按切片实施。**

## 验证计划

1. 单元/集成：多材料、参数注入、未选材料、身份不足、运行中改选、过期新申请、原票重放/已消费/禁自批；原U10/U11/U22/U23回归。
2. 轨迹：图投影、完整事件、选中/滚动保留、后台暂停、延迟审批、评审作业失败/取消/重复、集合快照改变、TopK门槛、test_only不发布。
3. 页面：中文欢迎无secret；匿名不能读审计；任务与审批路径、准入模板、能力状态、真实图与时间线、历史证据包、候选来源。
4. 主机隔离真实OpenClaw链：本地模型/合成文件，阻断零读取、审批一次执行、重放拒绝、哈希有效；尽量用已安装Ollama验证一份短简报结果，不把确定性模型用例冒充业务质量。
5. 部署前后核对配置/宿主哈希；现网若需重启仅重启已知本机服务，不修改配置。任何实际配置修改必须先U18备份与哈希。

## 已交付的操作路径

1. 打开中文欢迎页，连接已有网关，再登录业务身份。管理员开启演示源与普通登录分开。
2. 在任务页绑定当前会话，只能选择服务端登记的材料ID。确认后生成可复制的任务指令，由用户核对并发送；页面不自动调用模型。
3. 任务越界进入原审批链。过期且未消费的原生授权可重新申请；修改材料范围会撤销旧授权，旧请求不可重新放行。审批与执行结果分别显示。
4. 顶栏“查看过程”显示当前任务横向分栏调用图；可以跟随最新运行，手选历史时暂停。图与毫秒时间线均保留全部记录；长链在图内双轴滚动，栏头固定，筛选与原始JSON折叠。根据用户反馈已撤回纵向紧凑默认图，恢复情况见 TRACE_CALL_GRAPH_VALIDATION.md。
5. 审计页选择同任务记录，运行本地评审、查看安全筛选和TopK、生成隔离候选、运行联合准入。候选步骤可定位来源；历史真实六轨迹包只读。测试候选不可提交生产复核。
6. 能力库分别显示配置、连接、匹配检查记录和任务权限。MCP表单先检查再明确确认保存，保存重新走原准入逻辑；不把配置启用显示成已安全接入。

首页与抽屉已收紧，统一青绿色；主要页面不放验收表和长篇工程限制。会影响用户操作的事实——尚未执行、待审批、候选未安装、服务不可用——仍保留。完整边界放在[独立说明](ACCEPTANCE_BOUNDARIES.md)。

## 验证与结论

证据根目录：`local-validation/u24-product-flow/2026-11-08T16-15-58-460Z/`，时间戳使用UTC。汇总为同目录`report.json`，逐文件变更与哈希为`changes.json`。保留本轮开始前已有的U22/U23未提交变更，不能把整个git diff都算作U24。

| 验证 | 结果与来源 |
|---|---|
| 轨迹/候选/任务关联回归 | 101项通过，`trace-final-tests.log`；含哈希、脱敏、Q/S、TopK、快照变化与历史只读 |
| 身份与任务权限 | 79项通过；选材、重申请、旧票据失效、重新绑定/退出撤权及既有U10/U11/U22/U23回归；`identity-final-rebind-tests.log` |
| 前端身份状态与MCP回执 | 17项通过，待审批/阻断不算执行成功，真实isError包装保留业务状态 |
| 准入后端 | 12项通过；真实分析器正反例、检查不提交、保存重核、写入失败恢复 |
| 轨迹界面 | 14项通过，`local-validation/u24-trace-ui/2026-11-08T16-55-45-871Z/report.json` |
| 评审→TopK→生成→联合准入界面 | 通过，`local-validation/u24-trace-pipeline-ui/2026-11-08T16-36-40-209Z/report.json`；合成6JSONL，真实RPC/启发式/combined策略，不是实时采集 |
| 本地Ollama评审 | 10.961秒，Q=.95、S=1、test_only=true，真实历史轨迹的隔离副本；`local-validation/u24-local-assessment/2026-11-08T16-29-19-413Z/report.json` |
| 真实OpenClaw安全控制链 | `isolated-live-final/u22-live-report.json`通过：越界零读、禁自批、一次工具成功、重放不增读、4审批事件、3选定注入在模型/工具前停止。模型为本地确定性夹具，材料为合成 |
| 现网页面只读巡检 | `live-workspace-final/report.json`通过8项，8张截图、零页面脚本错误、零外部请求；真实有工具轨迹15事件→11关键节点，完整图15节点，链有效 |
| 自然业务任务 | **未完成**，见下节真实失败报告，不混入成功统计 |

安全控制链的一次成功原生工具内部发生2次被观测读取；再次重试没有新增读取。不能把“一个工具成功”写成“底层IO恰好一次”。新版欢迎匿名可达仅提供静态引导，匿名审计数据接口仍401。

## 已确认的剩余缺口

**页面选材到独立MCP的可信授权上下文尚未贯通，完整业务演示未通过。** 本轮确实运行了本地qwen3:8b：两次读文档和一次公告调用、开始/模型/结束、25事件哈希链都存在；但两份文档被下游`P006_PARAMETER_SOURCE_UNTRUSTED`转审批，未返回正文，仅公告成功。运行36.1秒，脚本退出1，报告为：

`local-validation/u24-task-materials/2026-11-08T16-53-50-145Z/live/report.json`

主机任务门与MCP服务目前各有契约；固定宿主的MCP调用不传toolCallId，不能用相同动作摘要猜测它属于哪个用户/会话。没有放松P006、伪造审批或实现会串用授权的临时桥。已修复这次测试暴露的“传输成功→执行成功”误标，待审批现在明确显示尚未执行。下一步需要单独实现带真实逐调用关联的可信委托传递，再验证同一业务任务端到端，不能靠前端徽标完成。

其余限制：5份登记材料均为合成，身份非生产OIDC；本地过程评审未生产标定；历史证据包固定登记一组；MCP连接与Skill当前版本回执尚无全面自动核验；后台作业重启后标中断而不自动恢复；本轮不证明长期服务稳定性、全部工具覆盖或自动生产发布。发布会流程和临场操作见[演示手册](PRODUCT_DEMO_RUNBOOK.md)。

## 复现命令

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/open_govagentsec.ps1

# 当前已启动系统，只读核对8个入口并截图
node scripts/verify_u24_workspace_live.mjs

# 隔离界面、实际本地评审与候选准入
node scripts/test_u24_entry_admission_ui.mjs
node scripts/test_u24_materials_ui.mjs
node scripts/test_u24_trace_ui.mjs
node scripts/test_u24_trace_pipeline_ui.mjs
node scripts/test_u24_local_assessment.mjs

# 真宿主 + 本地确定性模型安全链，需Docker与本地Protect就绪
$env:GOV_U23_LIVE='1'
node scripts/test_u22_login_approval_live.mjs
Remove-Item Env:GOV_U23_LIVE

# 真本地通用模型业务链；当前应退出1，暴露P006衔接缺口
node scripts/test_u24_materials_live.mjs
```

身份详细回归命令见[任务材料与审批](U24_TASK_MATERIALS_APPROVAL.md)。评审RPC正式名称为`assessmentStart/assessmentStatus/assessmentCancel`，见[本地评审接口](U24_LOCAL_ASSESSMENT_FLOW.md)。

部署仅重启本机固定版本网关以加载仓库插件。现网`openclaw.json`与本轮基线哈希相同；OpenClaw仍2026.7.1-2，所核验83个宿主文件未变。没有升级、patch宿主、push、修改远端或把轨迹送外部API。汇总报告记录具体哈希与证据来源。
