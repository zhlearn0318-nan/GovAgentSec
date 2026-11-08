# Codex 提示词 U5：四层一键验收报告

## 角色与仓库
`F:\揭榜挂帅\GovAgentSec`，OpenClaw **2026.7.1-2**。默认不 git push。

## 背景
验收脚本分散（trace 单测、gov_document、workspace、result-guard、evolution…）。现场需要一条命令生成四层汇总报告。

## 目标
1. 扩展 `Verify.ps1` 或新增 `scripts/Verify-ZhengAn.ps1`：
   - 分层运行（行为护栏 / 权限闸门 / 过程台账 / 经验自演进 + 文档索引检查）
   - 每层：通过/失败/跳过（跳过须写明缺依赖，如网关未启动）
   - 输出 `local-validation/verify/<timestamp>/report.json` + `report.md`（中文）
2. 离线可跑的子集默认必跑；需网关的 live 测试用开关 `-Live` 才启用。
3. 失败时退出码非 0；报告含复现命令。
4. 在 `docs/README.md` 与 `MAINTENANCE.md` 挂入口；`UPGRADE_ROUND_VALIDATION.md` 附一份成功报告路径示例。

## 建议纳入的离线命令（可按现有路径微调）
- `node --test modules/govagentsec-trace/test/*.test.mjs`
- `node scripts/test_result_guard.mjs` / `test_runtime_stop.mjs`
- `node scripts/test_task_workbench.mjs` / `test_workspace_ia.mjs`
- `agentguard .venv python scripts/test_gov_document.py` + panel 测试
- `node scripts/test_real_evolution.mjs`
- 检查 `docs/README.md` 存在且含四层表

## 验收命令
```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-ZhengAn.ps1
# 或你扩展后的 Verify.ps1
```

## 完成定义
一键报告生成、退出码正确、文档已挂链接。
