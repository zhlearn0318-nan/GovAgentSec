# 使用与维护文档

公开仓库只保留系统源码、安装程序、运行样例、回归测试及必要说明。开发任务书、阶段方案、内部评审和实验过程记录不在本目录发布。

## 开始使用

| 文档 | 用途 |
| --- | --- |
| [比赛电网演示版](COMPETITION_DEMO.md) | 与远端主分支的差异、首次部署、文件归档范围 |
| [比赛版验证](COMPETITION_VALIDATION.md) | 本次回归结果、复跑命令及已知限制 |
| [电网操作脚本](../modules/grid-demo/README.md) | 资料授权、分析报告、评测与技能发布演示 |
| [一键启动](ONE_CLICK_START.md) | 已安装系统的服务检查与启动 |
| [当前系统](CURRENT_SYSTEM.md) | 版本、五个入口、身份与资料权限 |
| [下载安装](WINDOWS_ONE_CLICK_INSTALL.md) | EXE、Agent、手动 ZIP 三种方式 |
| [Agent 自动安装](INSTALL_WITH_AGENT.md) | 复制给其他 AI Agent 的部署指令 |
| [使用逻辑](产品使用逻辑与模块协同.md) | 登录、能力准入、执行、审批、审计与候选 |
| [登录和权限](OIDC_USAGE.md) | 演示账号、30分钟登录、资料授权和确认 |
| [资料导入](DOCUMENT_IMPORT.md) | 上传资料、设置密级、持久保存与受控读取 |
| [功能地图](FEATURE_MAP.md) | 四类安全能力及页面职责 |
| [通用版演示参考](PRODUCT_DEMO_RUNBOOK.md) | 原 v1.0 流程；本分支使用上方电网操作脚本 |

## 配置、维护与接口

| 文档 | 用途 |
| --- | --- |
| [模型接入](MODEL_ROUTING.md) | 外部会话 API 与本地轨迹评审 |
| [维护说明](MAINTENANCE.md) | 启停、备份、检查与故障处理 |
| [独立宿主部署](OPENCLAW_WINDOWS.md) | 固定版本宿主的高级手动部署 |
| [会话沙箱](SESSION_SANDBOX_DEMO.md) | Docker/srt 范围与配置 |
| [轨迹事件](TRACE_HOOK_VERIFICATION.md) | 固定宿主钩子、载荷与采集边界 |
| [评分与候选](TRACE_SCORING_AND_EVOLUTION.md) | Q/S、TopK、证据与生成契约 |
| [自动会话身份](AUTOMATIC_CHAT_IDENTITY.md) | 自动授权、撤销与接口 |
| [确认与文档工具](PERSONAL_CONFIRMATION_AND_DOCUMENT_IDENTITY.md) | 本人确认、回执、受管读取与测试 |
| [验证方法](VALIDATION.md) | 自检命令及覆盖范围 |
| [安装器验证](WINDOWS_INSTALLER_VALIDATION.md) | 安装检查与尚未验证的条件 |
| [能力边界](ACCEPTANCE_BOUNDARIES.md) | 身份、保护、数据及发布限制 |
| [版本说明](releases/v1.0.md) | 当前发行内容 |

## 四层检查入口

| 层 | 对应能力与说明 |
| --- | --- |
| 行为护栏 | 风险识别：[系统说明](CURRENT_SYSTEM.md) |
| 权限闸门 | 行为约束：[身份和权限](OIDC_USAGE.md) |
| 过程台账 | 评测审计：[轨迹接口](TRACE_HOOK_VERIFICATION.md) |
| 经验自演进 | 候选技能：[评分契约](TRACE_SCORING_AND_EVOLUTION.md) |

在仓库根目录运行 `scripts/Verify-ZhengAn.ps1` 汇总选定回归；运行 `python scripts/check_current_docs.py` 检查产品说明和本地链接。原始轨迹、凭据与本机测试结果不随源码分发。
