# 当前系统基准

核对日期：2026-11-10。依据本地源码、实际网关配置和现网页面只读检查；本文是当前使用说明的基准，历史设计不覆盖这里的行为。

## 版本与入口

- 产品：**政安智枢 GovAgentSec，正式版 v1.0**，集成版本 1.0.0；OpenClaw 固定 **2026.7.1-2**。
- 页面主导航依次为 **动态权限、能力准入、演进审计、安全总览、防护设置**。聊天是任务执行入口，顶栏“查看过程”用于追踪当前运行。
- 会话顶部提供账号和“资料权限”。登录一次自动应用于此浏览器工作区中的对话，不要求绑定任务或选择材料。
- 工作区地址：`http://127.0.0.1:18789/plugins/govagentsec/welcome`。用 `Start-GovAgentSec.cmd` 启动，避免手动复制网关令牌。

## 用户、资料与确认

| 演示账号 | 执行等级 | 登记资料范围 | 其他能力 |
| --- | --- | --- | --- |
| admin | 最高 / clearance=3 | 全部登记资料，包括秘密及受保护资料 | security_admin、维护权限；保留原生动作确认 |
| weihu | 高级 / clearance=3 | 与最高账号相同的登记资料范围 | 保留已有维护账号，同属最高执行等级 |
| shenpi | 中级 / clearance=1 | 公开、内部；受保护资源仍受角色限制 | 具备业务审批角色，不可用审批突破密级硬拒绝 |
| jingban | 基础 / clearance=0 | 公开 | 按服务端策略执行与申请 |
| shenji | 只读审计岗位 | 无业务资料读取执行权限 | 可查看及本地评估轨迹，不可执行业务或修改配置 |

演示身份源默认关闭，管理员在防护设置开启。账号口令在页面“演示账号说明（非生产）”中查看。登录有效期 **30 分钟**；退出、切换账号、关闭身份源或刷新后的重新登录规则见[身份说明](OIDC_USAGE.md)。这些不是生产组织账号。

工作区读文档工具是 **gov_read_document(document_id)**，复用 AgentGuard 的身份、OPA、动作摘要、一次性票据、隔离读取及审计。只接收登记 ID，不能传路径或自报权限。

| document_id | 内容 | 数据级别 / 特殊限制 |
| --- | --- | --- |
| emergency_plan | 公开台风预案 | public |
| material_inventory | 应急物资清单 | internal |
| duty_contacts | 内部值班通信录 | confidential |
| command_contacts | 指挥中心联络表 | secret |
| protected_resource | 受保护物资材料 | internal，另需 security_admin |

全部为合成资料。D004 是密级不足，D005 是受保护资源；两者不能靠批准绕过。需要确认时会话卡片提供“允许一次／拒绝”，动态权限也能处理同一请求。待审批与执行回执分区，批准不等于执行成功。本人确认适用于工作区演示 worker 的指定聊天路径；独立服务、生产审批仍保留各自规则。确认期限 60 秒、执行票据 30 秒且只能消费一次。

## 五个页面

| 入口 | 当前用途 |
| --- | --- |
| 动态权限 | 登录、当前员工与资料权限、待审批、执行回执 |
| 能力准入 | Skill/MCP 检查、结果与证据、准入规则、人工复核；通过不等于已安装或已连接 |
| 演进审计 | 轨迹列表、横向调用图、毫秒时间线、多轨迹对比、本地 Q/S、候选生成与联合准入 |
| 安全总览 | 安全运行统计、实际防护状态、组件状态 |
| 防护设置 | 配置与维护：会话沙箱与演示身份源；无 OpenClaw 系统设置跳转 |

调用图保留横向分栏形式。当前 `graphLanes` 实际为 **LLM、Skill、MCP / 工具、结果、防护 / 审批** 五类；旧文档“六栏”不是当前栏目数量。安全总览的六步控制路径是另一张流程展示。未做评审显示“尚未评估”；图节点不显示“token 未提供”，真实已有用量仍显示，缺失值不造数。

## 本地运行与安装默认值不同

| 项目 | 此次本机观察 | 新装默认 |
| --- | --- | --- |
| 会话模型 | `deepseek/deepseek-flash` | Ollama `qwen2.5:7b-instruct-q4_K_M` |
| 外部 API | 已配置；此轮未发送会话或付费探测 | 保留接入能力，`Configure-Model.cmd` 配置 |
| 轨迹评审 | 本地 Ollama / 启发式 | 同样仅本地，参考配置 qwen3:8b |
| 输入防护 | protect-agent 配置为 real | 真实防护模型，不用 mock 代替 |
| AgentGuard 独立 MCP | 本机已启用既有演示配置，暴露五项通知/命令/状态工具 | OIDC 未就绪时默认关闭，不复制本机身份凭据 |
| 工作区资料工具 | gov_read_document，当前登录身份 | 同一工具与身份机制 |
| 会话隔离 | 配置为 Docker，mode=all、scope=session；运行状态仍以实际探测为准 | Docker；srt 是可选模式 |
| U20 usage wrapper | 未在本机启用插件清单中出现 | 关闭 |

独立 MCP 的 `read_gov_document` 实现仍在源码中，但不在当前工作区的 MCP toolFilter 中，用于避免两套读文档身份混用。新装不会复制本机额外的采购 MCP、聊天、Skill、模型 Key 或审计库。

## 证据与边界

此次现网只读检查通过：五个入口、总览与设置分离、单一业务身份机制、无手动绑定入口、未登录审计权限检查；网关/AgentGuard/OPA/Ollama HTTP 探测返回 200。检查时演示源关闭、未登录；没有替用户开启源、运行聊天、审批或重装。健康探测不等于全业务验收。

依据：`modules/govagentsec-ui/{shell,workspace}.mjs`、`modules/agentguard-group2/identity/demo_provider.py`、`enforcement/documents.py`、`modules/govagentsec-trace/{view,view-model,assessment-jobs}.mjs`、`scripts/build_config.py`。本机证据见 `local-validation/docs-sync/20261110/`，不上传原配置及轨迹。详细限制统一见[能力与验收边界](ACCEPTANCE_BOUNDARIES.md)。
