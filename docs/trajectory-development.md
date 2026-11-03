# v3 开发记录（更新至 2026-11-03）

## 2026-11-03 续开发

- 聊天界面新增右下角固定“历史调用轨迹”入口，通过原生对话框展示同一历史图；关闭和 Esc 返回聊天，不跳转、不清除草稿。真实浏览器验证通过认证图加载、草稿保留、关闭/Esc、焦点恢复、手机窗口及无脚本错误检查，记录在 `local-validation/trajectory-chat-report.json`。

- 增加 OpenClaw 原生“历史调用轨迹”侧栏，复用当前登录连接及只读 RPC；不再依赖在隔离 iframe 中重复认证。前端适配脚本提供备份和恢复，不修改宿主权限。
- 新增历史搜索、来源筛选、按时间倒序、三列 SVG 调用图、节点详情与缩放；配对只使用唯一调用 ID，虚线单独标示观察顺序。新增并发/孤立/重复 ID、RPC 只读 scope 和路径校验、适配恢复测试。
- 原生页面实测通过：侧栏进入、认证 RPC、无需重新输入令牌、图节点详情、刷新重载；证据在 `local-validation/trajectory-native-report.json`，截图 `local-validation/trajectory-native-desktop.png`。历史仅包含已采集记录，不回填未采集的旧会话。
- 本轮最终验证：36 项轨迹模块 Node 测试通过，独立页面 12 项交互检查通过，真实 OpenClaw 原生入口 6 项检查通过；原执行审批文件哈希保持不变。

- 新增采购任务独立验证器、确认发布、版本回退和中断恢复、本地评审与门控串联、人工标定工具、四组选择计划、只读时间线/对照/候选页面。
- 43 项自动化测试通过：33 项 Node 测试、4 项 Python 适配测试、6 项发布配置回归。另通过无头 Edge 的认证、时间线、证据展开、双轨迹对照、候选拒绝状态、移动端布局、令牌清除及脚本错误检查。
- 实际候选 `b91dade8-5985-45d2-ba47-c9a5a30d11c0` 在三项采购新任务中完成两项。含注入备注的任务持续读取材料，未生成报告；无外发尝试，业务验收失败，状态转为 rejected，未发布。完整证据在 `local-validation/trajectory-holdout/validation.json`。
- 发布加载测试使用**明确标注的测试夹具**，在隔离 skills 目录执行 A → B → A，真实 OpenClaw `skills info` 正确读取每版描述。记录在 `local-validation/release-loader-1793693738555/report.json`。这证明版本加载机制，不证明真实候选通过了业务验证。
- 隔离测试改为同时设置 OPENCLAW_HOME、STATE_DIR、CONFIG_PATH，消除了仅改 state 导致审批迁移的路径；每步检查真实审批文件哈希不变。
- 页面截图和交互结果在 `local-validation/trajectory-ui-test/`。该测试使用实际验证记录的副本；不把失败轨迹改成成功。
- 真实网关启用操作首次被自动审批系统拒绝；2026-11-03 用户明确授权后，通过 `local-validation/trajectory-config-batch.json` 启用插件和 `allowConversationAccess`。当前网关页面返回 200；轨迹与候选接口无认证返回 401、持有效网关令牌返回 200。原执行审批文件 SHA-256 保持 `38BDB4809E641674AEA92723116E4DA431E2D6F16251E713D2BD0F313B5CFA46`。当前列表中的三条轨迹为明确标注的受控验证记录；启用后新产生的真实任务才属于本次现网采集。

待完成的效果验收：人工标定样本、四组真实生成与新任务效果实验、在线防护资源共存、原生/MCP 全路径及跨模块审批关联。四组选择计划仅为实验输入清单，不能代替效果实验。

## 首轮开发记录（2026-11-02）

已落地独立模块 `modules/trajectory-governance`，完成本地评审与候选生成的能力探针、一次真实 OpenClaw 完整采集、一次真实联合准入。未宣称 v3 全部完成；现网未启用新插件，未发布候选。

交付检查：14 项新增 Node 组件测试、4 项 Python 适配测试、2 项现有 UI 测试及 6 项发布/配置回归测试全部通过，共 26 项；Git diff 格式检查通过。测试使用项目内临时目录。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 本地模型安装 | Qwen3 4B Q4_K_M，独立 Ollama 11435 | 模型摘要在模块 dependencies.lock.json；权重在忽略目录 models/trajectory |
| 评审接口初测 | 6 个合成样例中 4 个结构不合格 | local-validation/trajectory-probe/report.json |
| 严格 Schema 后 | 5/6 接口接受，但注入样例误判低风险、工具计数错误 | local-validation/trajectory-probe-schema/report.json |
| 改进提示后 | 6/6 结构及已登记语义检查通过；每项约 9.6–17.9 秒 | local-validation/trajectory-probe-instructions/report.json |
| 本地候选生成 | SkillClaw 生成采购核对纯指令技能，保留授权和审批步骤 | local-validation/trajectory-generation-probe.json |
| 真正 OpenClaw 采集 | run_id=6b2a8523-1a39-4169-ad85-36921fec0014，5 个事件，complete | local-validation/openclaw-trajectory-probe/data/traces/73b0c40942ef0c64babf6fd34db89f29.jsonl |
| 主动联合准入 | allow，候选停在 admission_passed，未发布 | local-validation/trajectory-admission-probe/result.json |

所有模型能力测试均使用合成采购材料。它们不是独立保留测试集，未用于产生生产阈值。提示词迭代前的失败报告仍保留，不能只报告最后一轮而隐去早期失效。

纯指令准入返回了现有 Aegis 的“三类语义场景”描述；本模块将其归类为 `instruction_semantic_audit / code_executed=false`，不认定已经执行三轮智能体任务。

## 实测修正

1. 宿主先发 agent_end、后发最终 llm_output，不能在 agent_end 即封存。已修复并增加回归测试；先前两条旧采集的清单不完整，保留 invalid 状态，未重写来伪造成功。
2. 模型 API 失败时宿主 agent_end.success 仍可为 true。采集摘要另看最后一次模型调用结果；失败不能成为成功经验。
3. 本机原 Ollama 的旧模型目录存在清单加载异常。改用项目模型目录与独立 11435 服务；既有 11434 不替换、不终止。
4. OpenClaw 本机嵌入式运行没有注册 `api=ollama`，隔离探针改用本地 `/v1/chat/completions` 兼容 API 后返回 OK。

## 已知阻碍与下一阶段

OpenClaw 隔离启动触发旧执行审批文件自动迁移。原文件归档路径为 `C:/Users/23684/.openclaw/exec-approvals.json.migrated-1793633781632`，迁入项目测试状态目录。首次恢复被自动审批系统以“涉及权限配置”拒绝。2026-11-03 用户明确授权后，已从归档原样恢复 `C:/Users/23684/.openclaw/exec-approvals.json`；恢复前后 SHA-256 均为 `38BDB4809E641674AEA92723116E4DA431E2D6F16251E713D2BD0F313B5CFA46`，归档保留，未新增或放宽审批规则。

后续依次完成：

1. 原审批文件已恢复；仍需解决测试隔离迁移行为，核对现有网关健康状态。
2. 采集正常工具、并行、重试、取消与 MCP 的真实事件；接入任务分组和实际防护/审批关联。
3. 扩充人工标注与独立保留样例，标定当前模型和提示词；评测安全误判与正常保留率。
4. 采购受控任务验收器、发布/回退及新进程实际加载已实现；继续验证生产工具范围和现有会话热加载。
5. 时间线与轨迹对照页面已实现并测试；四组真实效果实验与资源共存验证仍待完成。

开发测试通过不等于上述阶段已经验收。当前自动经验通道仍要求完整证据、受信数据复核、独立任务结果和有效标定，不能直接使用模型自评放行。
