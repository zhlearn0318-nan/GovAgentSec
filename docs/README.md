# GovAgentSec 文档索引

本目录是当前仓库版本的说明与验收材料入口。对外产品名仍为 **政安智枢 GovAgentSec**；演示与评委叙事统一主题为 **政安纵深**（四层能力）。

锁定宿主：**OpenClaw `2026.7.1-2`**（未经确认不要升级）。

## 快速入口

| 文档 | 用途 |
| --- | --- |
| [../README.md](../README.md) | 产品总览、安装与模块说明 |
| [OPENCLAW_WINDOWS.md](OPENCLAW_WINDOWS.md) | 独立部署 OpenClaw（Windows） |
| [MAINTENANCE.md](MAINTENANCE.md) | 组件结构与维护入口 |
| [VALIDATION.md](VALIDATION.md) | 已验证功能与验收边界 |
| [产品使用逻辑与模块协同.md](产品使用逻辑与模块协同.md) | 使用前 / 使用中 / 使用后流程 |
| [DELIVERY_ACCEPTANCE.md](DELIVERY_ACCEPTANCE.md) | 身份、交付与验收边界 |

## 政安纵深 · 四层能力对照

| 中文名 | 原模块名 | 作用 | 主要文档 |
| --- | --- | --- | --- |
| 行为护栏 | Protect Agent / Group1 | 提示注入、内容安全、工具结果与输出检查 | [产品使用逻辑与模块协同.md](产品使用逻辑与模块协同.md) |
| 权限闸门 | AgentGuard | 受管工具策略、审批、执行票据；政务受管读文件演示 | [CONTROLLED_DOCUMENT_IMPLEMENTATION.md](CONTROLLED_DOCUMENT_IMPLEMENTATION.md)、[CONTROLLED_DOCUMENT_VALIDATION.md](CONTROLLED_DOCUMENT_VALIDATION.md) |
| 过程台账 | Trace / trajectory-governance | 会话轨迹、调用关系图、审批与准入证据关联 | [TRACE_IMPLEMENTATION_PLAN.md](TRACE_IMPLEMENTATION_PLAN.md)、[TRACE_DELIVERY_VALIDATION.md](TRACE_DELIVERY_VALIDATION.md)、[TRACE_CALL_GRAPH_VALIDATION.md](TRACE_CALL_GRAPH_VALIDATION.md)、[TRACE_LIVE_SMOKE.md](TRACE_LIVE_SMOKE.md)、[TRACE_HOOK_VERIFICATION.md](TRACE_HOOK_VERIFICATION.md) |
| 经验自演进 | Skill 自演进 | 质量+安全双门控，候选 Skill 隔离归纳与联合准入 | [TRACE_SCORING_AND_EVOLUTION.md](TRACE_SCORING_AND_EVOLUTION.md)、[REAL_MULTI_TRACE_EVOLUTION.md](REAL_MULTI_TRACE_EVOLUTION.md)、[LOCAL_JUDGE_CALIBRATION.md](LOCAL_JUDGE_CALIBRATION.md) |

## OpenClaw 工作区与任务台

| 文档 | 用途 |
| --- | --- |
| [openclaw-workspace.md](openclaw-workspace.md) | 原生工作区使用与部署 |
| [task-workbench.md](task-workbench.md) | 任务工作台 |
| [trajectory-development.md](trajectory-development.md) | 轨迹能力开发说明 |
| [WORD_TASK_INVESTIGATION.md](WORD_TASK_INVESTIGATION.md) | Word 任务排查记录 |

## 安全边界（必读）

- 轨迹安全评审默认走**本地模型**；不要把轨迹原文发给外部 API。
- `govagentsec-trace` 默认仅保存脱敏后的内容哈希与事件元信息，不保存 prompt / 参数 / 输出原文。
- 联合准入通过（`admission_passed`）不等于自动发布或安装；候选落在隔离车间，仍需 Aegis + Group4 复核。
- 演示身份（如 `loopback_static_dev`）仅用于本机验收，不代表生产 OIDC。
- 不把密钥、令牌、聊天记录、上传文件、审计库或已装 Skill 打进发行包。

## 相关源码入口

- `modules/protect-agent-group1` — 行为护栏
- `modules/agentguard-group2` — 权限闸门（含政务文档演示）
- `modules/govagentsec-trace` / `modules/trajectory-governance` — 过程台账与演进
- `modules/aegis` / `modules/supply-chain-group4` — 供应链与 Skill 专项检查
- `modules/govagentsec-ui` — 统一工作区界面

演示录屏与评委成片不在本仓库，统一放在本机 `F:\揭榜挂帅\评委演示素材\`。
