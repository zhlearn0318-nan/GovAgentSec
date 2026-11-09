# 政安智枢文档导航

本目录按 **当前使用、技术参考、历史记录、开发任务书** 分类。当前依据是本地 OpenClaw 2026.7.1-2 工作区，核对日期 2026-11-10；旧版设计/验收保留原结论，不再充当最新操作手册。

## 当前使用

| 文档 | 用途 |
| --- | --- |
| [CURRENT_SYSTEM.md](CURRENT_SYSTEM.md) | 当前版本、五个入口、权限、资料、模型与本机/新装区别 |
| [WINDOWS_ONE_CLICK_INSTALL.md](WINDOWS_ONE_CLICK_INSTALL.md) | 三种安装方式：EXE、Agent、手动 ZIP |
| [INSTALL_WITH_AGENT.md](INSTALL_WITH_AGENT.md) | 可复制给其他 AI Agent 的完整指令 |
| [产品使用逻辑与模块协同.md](产品使用逻辑与模块协同.md) | 登录→准入→执行→确认→审计→候选 |
| [OIDC_USAGE.md](OIDC_USAGE.md) | 当前账号、30分钟登录、权限与审批 |
| [FEATURE_MAP.md](FEATURE_MAP.md) | 风险识别、行为约束、组件准入、评测审计 |
| [PRODUCT_DEMO_RUNBOOK.md](PRODUCT_DEMO_RUNBOOK.md) | 约7分钟演示镜头与场前准备 |
| [MODEL_ROUTING.md](MODEL_ROUTING.md) | 外部会话 API 与本地轨迹评审分工 |
| [MAINTENANCE.md](MAINTENANCE.md) | 启停、备份、检查与组件维护 |
| [VALIDATION.md](VALIDATION.md) | 当前核对与历史验证分别索引 |
| [ACCEPTANCE_BOUNDARIES.md](ACCEPTANCE_BOUNDARIES.md) | 统一能力/验收边界，不进入产品流程 |
| [DOCUMENTATION_SYNC_REPORT.md](DOCUMENTATION_SYNC_REPORT.md) | 本地、GitHub 与发布包差异及本轮修订 |

## 四类能力与技术参考

| 能力 | 组件 | 参考 |
| --- | --- | --- |
| 风险识别 | Protect Agent / Group1 | [输入防护实现](../modules/protect-agent-group1/智能体安全/README.md) |
| 行为约束 | AgentGuard / 任务 ACL / 会话沙箱 | [本人确认](PERSONAL_CONFIRMATION_AND_DOCUMENT_IDENTITY.md)、[自动身份](AUTOMATIC_CHAT_IDENTITY.md)、[沙箱](SESSION_SANDBOX_DEMO.md) |
| 组件准入 | Aegis / Group4 | [Aegis](../modules/aegis/README.md)、[联合准入代码](../modules/supply-chain-group4/integration/combined_install_policy.py) |
| 评测审计 | trace / trajectory-governance | [事件核验](TRACE_HOOK_VERIFICATION.md)、[评分契约](TRACE_SCORING_AND_EVOLUTION.md)、[本地标定](LOCAL_JUDGE_CALIBRATION.md) |

历史证据按原始日期、真实/合成来源与测试范围解释。local-validation 不提交；链接和目录是本机证据定位，不表示 GitHub 下载后已附带真实轨迹。

## 历史记录与开发资料

[完整分类目录](DOCUMENTATION_CATALOG.md)覆盖本目录106份仓库 Markdown；另5份本机演示讲稿排除于发布；[机器可读清单](DOCUMENTATION_INDEX.json)供检查脚本使用。Uxx、旧评审、旧任务工作台和旧发布说明作为历史追溯；codex-prompts 是开发任务书，不能当作当前产品保证。

正式版下载见 [v1.0](releases/v1.0.md)，此前 [3.0](releases/3.0.0.md) 是历史开发编号。历史标签不移动，最新 Windows 包通过 SOURCE_COMMIT.txt 标识构建提交。维护时运行 `python scripts/check_current_docs.py` 检查分类、链接和关键约定。
