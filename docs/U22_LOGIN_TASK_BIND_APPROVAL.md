# U22 登录、任务绑定与审批主路径

日期：2026-11-08。阶段 A 设计先于代码；基线 release/3.0，OpenClaw 固定 2026.7.1-2。本包实现依据 PRODUCT_UX_LOGIN_AND_DEMO_FLOW，不改宿主安装文件、不建新身份内核。

## 1. 切片与非目标

交付：独立 `section=login` 登录壳、同页内存委托与常驻徽章、准确当前聊天绑定、待我处理/我发起审批队列、返回原任务、相邻审批回执、工程话术清理。管理员设置保留原合成目录/通知/付款演示，用折叠详情承载。

不做：真组织 OIDC、第二套 JWT/角色/ACL、自动续权、扩大 TTL、自动执行自然语言拼出的原动作、生产发布、U9 新隔离内核、U20 启用。保留原生动作与面板动作不同批准语义。

## 2. IA、视觉与宿主接线

```text
网关原有连接页（不改内核）
  → 工作区：登录业务身份 section=login
       政安纵深 / GovAgentSec
       网关：已连接 / 等待连接
       演示（非生产）→ 管理员开启 → 经办/审批/审计 → 进入工作台
       组织登录：未接入（不可点假SSO）
  → 工作台：当前任务 → 以当前身份开始 → 待办/最近任务
顶栏：当前任务 / 角色·演示·剩余时间 / 本人退出 / 查看过程
侧栏：工作台 / 能力接入 / 待审批 / 任务轨迹 / 防护设置
```

沿用 `/plugin?plugin=protect-agent&id=govagentsec&section=...`，新增 login，旧 home/approvals/audit/compare/settings 地址兼容。登录后落工作台；含 request 定位的链接保留定位，不绕过服务端身份。网关未连接时只提示连接工作区，不开演示源。

视觉采用现有操作界面：墨青 #233e3b、操作青 #1e695b、雾白 #f5f7f7、边线 #d6e2df、警示琥珀 #946224、拒绝红 #b42318。标题用系统中文黑体/Segoe UI Semibold，正文 Microsoft YaHei UI，技术详情 Consolas。唯一强调是紧凑的“当前身份→当前任务→下一步”任务条，取消大宣传图和算法卡片；登录双栏在窄屏变单栏。焦点可见、状态 aria-live、无非必要动效。该选择服务于值班办事，不另建营销首页。

已安装宿主已有 `<govagentsec-shell .host=... .sessionKey=activeSessionKey>`，只读核验 `scripts/install_openclaw_workspace.mjs:38` 与当前安装壳。此次只改仓库托管静态模块；**不运行 install_openclaw_workspace/install_delivery，不写 node_modules/openclaw**。新增 ESM 资源仅通过现有插件静态路由登记。

## 3. 委托生命周期

同页 ESM `identity-session.mjs` 闭包持有 token，提供订阅去敏状态与 call/login/revoke/disable；不在 window、CustomEvent、DOM、URL、日志、localStorage/sessionStorage 保存 Bearer。壳、登录页、工作台和审批页共享同一个 gateway 对应会话对象。组件卸载只退订，不清除尚有效委托；不同标签页独立模块内存。

复用 RPC `govagentsec.demoIdentity.enable/status/login/revoke/disable/bind_session/task_escalate/resolve`，及管理员合成演示原 invoke/task_create/task_read。服务端现有 operator.admin 与业务验签不变，网关 token 不能代替业务 token。

- 登录切换由既有 login 携带旧 Bearer 原子撤销后签新；不另做角色授予。
- 本人退出调用 revoke 成功后清空；失败时本页禁用并提示退出未确认，不能宣称后端已撤销。
- 全局 disable 是管理员显式动作，撤销全局源。测试只关闭自己的激活，已有他人活动应失败/保留，不自动清理。
- 刷新清空页面 token，服务端已有绑定直到撤销/过期；不声称刷新即退出全部授权。
- 倒计时取 login.expires_at 与源 status.expires_at 的最小值；定期 status 验权；无自动续权。
- enable 无时长参数，显示最长 15 分钟，不做假时长选择。

## 4. 当前任务绑定

由现有 Shell.sessionKey setter 发布准确 session 定位到同页上下文模块 `task-context.mjs`。工作台只读取它；无当前值禁用并提示先选择聊天。禁止默认 agent:main:main、禁止按最近时间猜、禁止手填 key。

“以当前身份开始”先展示选中任务、只读范围原则与实际模型数据处理位置，再确认调用原 bind_session。确认前复查当前 session 未改变；改变则取消确认重新选择。绑定不授 scope；仍由 before_agent_run 根据本条用户消息建立最小任务范围。切聊天不把旧绑定/scope显示成新任务已授权。

任务范围显示服务器 task 摘要；缺数据只说明下一条任务按明确材料授予只读，不伪造已授目录。原生网络/写/exec 硬拒绝保持。

## 5. 审批主路径

登录/身份卡与审批队列分离；顶栏可返回登录选择审批身份，推荐审批人独立标签页，保留申请人有效委托。切换身份在同页会撤旧委托，这是正确语义，不为演示偷偷保留经办权限。

队列提供“我发起的 / 待我处理 / 全部可见”，卡片展示申请人、原动作/材料、范围外原因、审批效果；hash/协议枚举放核验证据。硬拒绝 D004/D005/角色拒绝不显示申请按钮，禁自批仍由后端保证。

原生：经办“申请一次性扩权”→另一审批人“批准本次重试”→经办“返回原任务”→原聊天用户重试。批准只签授权，不自动读，不改变 30 秒票据/60 秒审批。面板合成动作仍“批准并执行一次”。没有精确重试接口，不拼自然语言假装一键消费。

当前请求缺 session_key/run_id，允许**仅补可信展示元数据**：在 identity/chat_acl.py 构造原请求时保存已验证 run 的 session、run ID；不接受工具参数覆盖。状态仅对有效经办/审批/审计主体投影这些定位；深链携 request_id，不带凭证；返回会话取服务器记录，不猜。

授权与执行分态：原请求展示 authorized；若能用宿主 toolCallId 在内部 chat_tool→chat_result 精确关联，则追加执行结果展示字段；缺 ID 保留“执行结果未关联”，不按最后动作猜。审批到期仅能采用真实服务端时间，没时间字段时写“请立即回原会话重试；到期需重新申请”，不从页面观察时刻计算假倒计时。以上元数据不改策略/签票/核销分支。

## 6. T09 唯一方案：诚实降级

**选择相邻展示，不新增图节点。** 当前 trace/register.mjs 的 approval.observed 主要由可信 MCP 回执产生，原生审批在 identity-audit.jsonl。任务详情内提供相邻审批卡入口，按准确 session/request 查询已鉴权状态，文案“审批回执与调用图分屏核对”。没有相关条目时明确空态。

不向历史 JSONL 拼入事件，不按时间排序画因果边，不宣称完整审批已进图。可靠桥接留 U24。

## 7. 文案清理

| 文件/视图 | 改动 | 保留 |
| --- | --- | --- |
| shell/workspace | 品牌政安纵深、审计中心导航称任务轨迹；身份/任务入口；沙箱移设置 | 原深链、旧记录可查 |
| demo-identity | 登录/队列主操作中文；hash、协议字段折叠 | 非生产、合成数据、禁自批、未安装 |
| identity-status | 去“仅本机验收”与首屏 OIDC 委托术语 | 管理登录≠业务身份，缺身份不执行 |
| workspace 设置 | 去“配置与验收”路径及技术清单首屏；读实际状态 | 模型是否外部处理，工具覆盖维度、srt限制 |
| trace/view 候选 | 内部状态机移详情，“准入通过·未安装” | 来源、隔离、缺失、禁发布 |

业务可见主路径扫描 `U\d+|PASS|FAIL|PARTIAL|本轮验收|仅本机验收|工程自检`；原错误码/审计字段仅在技术详情，不能将敏感原文或票据放详情。验收边界仍在 ACCEPTANCE_BOUNDARIES；管理员帮助可链接文档，不把报告正文塞进首屏。

## 8. 演示稳定性与配置

本轮起点磁盘 backend=srt。**计划在 Docker CheckOnly/镜像就绪通过后，按 U18 将默认 backend 切回 Docker**；若未就绪，保留 srt 并将状态报告为未切换，不声称 Docker 预热。U14 既有回归仍用它自己的隔离 srt 配置，不修改 U9 引擎实现。

步骤：固定版本→U18 backup()私有备份+before SHA→调用现有 SandboxService.select('docker')→after SHA/检查 backend 与对应 workspaceRoot 差异→新会话生效说明。切换不迁移运行中会话。恢复用 scripts/restore_openclaw_config.mjs 的备份哈希+当前目标哈希双校验；完整配置留用户私有目录，不进证据。

冷启动显示“执行环境准备中，请稍候”；没有可信时长不写预计秒数。srt 说明可能较久，Docker 未就绪说明联系管理员，不露 errno 栈。切换配置不代表新隔离验收通过。U20 保持关。

## 9. 风险与失败规则

深链只有定位不得授权；未知请求拒绝；多标签页不能共享 token；绑定时换聊天取消确认；切换角色撤销旧绑定要明示；自批、到期、变参仍拒绝；不能为简洁隐藏外部会话处理/非生产/缺失状态。Docker 切换影响新运行环境，需要记录起点恢复；原生审批未进图要说清。轮询失败立即禁动作，但不伪称服务器已撤销。

## 10. 验收（阶段 B 必跑）

```powershell
openclaw --version
node scripts/verify_demo_identity.mjs
node scripts/verify_per_user_delegate.mjs
node scripts/verify_identity_task_acl.mjs
node scripts/verify_judge_chat_acl.mjs
node scripts/verify_u22_login_approval_path.mjs
```

专项：登录→准确当前会话绑定（无手填/无默认）→用户只授权A、本地确定性模型尝试B→P014零读取→申请→自批拒绝→另一主体批准→回原session→一次成功/再次拒绝；实际拒绝原因照实。U14 的普通新消息若明确B会新建B范围，不拿这种消息制造假越权。

另验：多页身份隔离、路由不丢委托、刷新/退出/失效、请求深链不授权、缺当前会话/切换取消、无业务Bearer服务端拒绝、文案、T09降级、未patch宿主/未开wrapper/配置差异。截图来自真实本地浏览器，包含 login/workbench/binding/approval/result；失败留证。现有测试的标签变更同步更新选择器，不删除安全断言。

证据：local-validation/u22-login-approval-path/<UTC>/，含 design-ref、版本、截图、copy-scan、verify日志、report、DELIVERY；配置切换另有备份指针/哈希/rollback。不能用历史图或fixture页面冒充当前真实宿主。

## 阶段 A 自检

- [x] 文档已写，引用 U21/PRODUCT_UX 与实际模块；代码尚未修改。
- [x] 网关连接与业务身份分离，组织未接入。
- [x] 当前会话从现有宿主setter读取，不手填、不猜测。
- [x] 审批主路径、授权≠执行、禁自批与准确返回原任务明确。
- [x] T09 唯一选择相邻回执降级，不新增审批图节点。
- [x] 文案清单与独立边界文档已明确。
- [x] Docker就绪前提、U18备份/哈希/回滚明确。
- [x] 复用 U4b/U10/U11/U13，不造第二套身份内核。
- [x] 非目标、失败语义与风险明确。
- [x] 六条验收命令及专项断言明确。

依据：U21 工作提示词、JUDGE_USER_FULL_CRITIQUE、PRODUCT_UX_LOGIN_AND_DEMO_FLOW、ACCEPTANCE_BOUNDARIES；OIDC_USAGE/U12/IDENTITY_TASK_ACL_DESIGN/U10/U11/U13/U14；U18及backup/restore脚本；SESSION_SANDBOX_DEMO/U15讲稿。UI已读shell/workspace/demo-identity/identity-status/compact-page/access/client/design；后端复用 identity/demo_provider.py、chat_acl.py、enforcement/task_policy.py、gateway.py、runtime_security_plugin/demo-identity.mjs/chat-acl.mjs。旧宿主适配只读，本轮不运行安装patch脚本。

## 阶段 B 的实测调整

U22 attempt-04 在原 srt 配置上实际完成单次受控 read：首次拒绝 11,369 ms、底层读取 0；批准后一次成功 360,807 ms、文件桥读取 2 次（一次工具调用）；再次拒绝 4,849 ms、读取不增长。查询回执时 300 秒业务委托已自然到期，报告按失败保存，未延长 TTL。

最终专项改用已就绪、已设为演示默认的 Docker。仅增加隔离测试计数插件：观测固定宿主原始 readFileSync(fd)，用合成目标文件 dev/ino 与 readPinnedFile 调用栈精确匹配，调用原函数并核对字节/哈希。没有替换文件内容、权限决策、路径检查或沙箱实现；宿主文件哈希前后必须一致。固定宿主 Docker 文件桥在检查后于网关进程读取映射文件，这不是容器内系统调用证据，也不是新的 U9 隔离验收。旧 srt 失败和实际耗时保留在对应 attempt 目录。

## 阶段 B 最终交付（2026-11-08）

后续 U23 已为本项目原生任务 ACL 审批补充可信私有审计桥，当前 UI 使用“同屏核对”，并显示实际采集的审批节点。本文阶段 A 的“分屏/留 U24”是当时的选择，历史报告不回填；新覆盖与验收见 [U23](U23_APPROVAL_GRAPH_SANDBOX_FP.md)。

结论：PASS。上述五条 Node 验收命令均 exit 0，OpenClaw 仍为 2026.7.1-2。最终专项 16 项真实流程断言、10 项身份单测通过；后端回执 12 项、工作区 16 项、发布闸 4 项通过。

- [总报告](../local-validation/u22-login-approval-path/2026-11-08T11-46-08-529Z/report.json)
- [交付、命令与剩余风险](../local-validation/u22-login-approval-path/2026-11-08T11-46-08-529Z/DELIVERY.md)
- [最终真实专项](../local-validation/u22-login-approval-path/2026-11-08T11-46-08-529Z/attempt-07/u22-live-report.json)
- [改动清单](../local-validation/u22-login-approval-path/2026-11-08T11-46-08-529Z/changed-files.json)
- [配置与宿主完整性](../local-validation/u22-login-approval-path/2026-11-08T11-46-08-529Z/integrity.json)
- [回滚命令](../local-validation/u22-login-approval-path/2026-11-08T11-46-08-529Z/rollback.md)

复现：先启动现有网关与输入防护服务，确保固定版本、专用 Docker 镜像就绪，再在仓库根目录执行本设计 §10 命令。不要并发运行会开关共享演示源的旧 Live 回归。专项自动创建独立网关、合成材料与本地确定性模型，不依赖外部模型账号；结束只清理本轮容器与临时运行进程，保留证据。

最终配置 SHA-256 为 `5497e4fd8840b1d3ba939c74b006612fec53c5795ba4705969a320ae16f60083`，只改沙箱引擎和对应隔离目录。私有备份、前后哈希与恢复命令齐全；U20 默认关闭。现网 18789 已加载本版本，演示身份默认关闭。未升级、未 patch 宿主、未 push。

11 张专项流程截图及 1 张最终现网登录页截图均为本次实拍。原生审批采用相邻回执展示：13 个图节点来自实际轨迹，未生成审批节点。投产身份、完整审批进图和输入误报修复仍未完成；安全签票/审批 TTL 与准入发布边界不变。
