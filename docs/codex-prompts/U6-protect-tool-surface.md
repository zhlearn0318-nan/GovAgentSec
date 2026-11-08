# Codex 提示词 U6：行为护栏业务工具面扩样（P2）

## 角色与仓库
`F:\揭榜挂帅\GovAgentSec`，OpenClaw **2026.7.1-2**。默认不 git push。

## 背景
结果门禁与 runtime-stop 已有单测，但演示工具面偏样例。需要在 **不扩大攻击面** 的前提下，增加 2–3 条贴近政务助手的受管路径验收（仍用合成数据）。

## 目标
1. 选定 2–3 个已接入或可安全接入的工具路径（优先已有 MCP：如 `read_gov_document`、`list_notices`、受保护命令），为「注入输入 / 恶意工具返回 / 越权读」各补一条 **可自动验收** 的用例。
2. 断言：护栏阻断后任务取消、后续工具不执行、审计有原因码、不泄露原文到轨迹存储。
3. 文档：在产品使用逻辑或 UPGRADE_ROUND_VALIDATION 列出用例表。

## 约束
- fail-closed；不引入新的默认放行。
- 不接真实生产文件；只用 demo_documents / 合成回执。

## 验收命令
```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts/test_result_guard.mjs
node scripts/test_runtime_stop.mjs
# 新增用例测试文件一并运行
```

## 完成定义
新用例稳定绿、有中文用例表、无隐私回退。
