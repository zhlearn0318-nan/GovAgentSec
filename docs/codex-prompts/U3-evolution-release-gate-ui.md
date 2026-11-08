# Codex 提示词 U3：经验自演进发布闸 UI

## 角色与仓库
`F:\揭榜挂帅\GovAgentSec`，OpenClaw **2026.7.1-2**。轨迹评审默认本地模型；**禁止**把轨迹内容发给外部 API。候选 **禁止自动安装**。默认不 git push。

## 背景
后端已能：多轨迹 → 安全门控 → TopK → 公共步骤候选 → Aegis+Group4 联合准入（良性 pass / 毒技能 block），见 `docs/REAL_MULTI_TRACE_EVOLUTION.md`。缺口是 **产品态发布闸**：评委需要在 UI 上看到「人工确认 → 评分/隔离原因 → 准入结果 → 仍停留在 skill-workshop，未安装」。

## 目标
1. 在审计中心/候选车间增加（或完善）**发布闸面板**，至少展示：
   - 参与轨迹数、安全通过数、隔离数、TopK 列表（任务名/分数/隔离原因）
   - 候选 Skill 摘要（instruction-only，无秘密）
   - 联合准入结果：`allow` / `block` + 原因摘要
   - 状态机固定：**draft → scored → admitted_allow|admitted_block →（仅人工）ready_for_review**；**永远没有 auto_installed**
   - 醒目文案：`admission_passed ≠ 发布/安装`
2. **人工确认**动作：点击后只写审计回执（谁、何时、确认了哪条候选），不触发安装；若当前无组织身份，则按钮禁用并说明需 OIDC/管理员身份（与 U4 对齐）。
3. 毒技能/低质量样本在 UI 中可见为隔离或 block，不得被一键发布。
4. 自动化：
   - 用现有 `local-validation/real-evolution/.../report.json` 或 demo fixture 驱动 UI/单元测试
   - 断言：无 `install` API 调用；状态机无 auto_installed；block 候选确认按钮不可用或确认后仍不安装
5. 文档：更新 `TRACE_SCORING_AND_EVOLUTION.md` 或 `REAL_MULTI_TRACE_EVOLUTION.md` 增加「UI 发布闸」一节；写入 `UPGRADE_ROUND_VALIDATION.md`。

## 约束
- 归纳器保持确定性公共步骤；不要为 UI 临时改分规则。
- 不调用云模型做评审。
- 不把 workshop 候选拷进正式 skills 目录。

## 建议改动区域
- `modules/govagentsec-trace/evolution.mjs`、`view.mjs`
- `modules/trajectory-governance/workshop.mjs`、`releases.mjs`、`ui.mjs`
- `scripts/evolve_real_demo.mjs`、`scripts/test_real_evolution.mjs`、新建 `scripts/test_evolution_release_gate_ui.mjs`

## 验收命令
```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node --test modules/govagentsec-trace/test/*.test.mjs modules/trajectory-governance/test/*.test.mjs
node scripts/test_real_evolution.mjs
# 你新增的 UI 测试：
# node scripts/test_evolution_release_gate_ui.mjs
```
手动：打开候选车间 → 看见 TopK 与 allow/block → 确认按钮不安装 → 文案含 admission_passed ≠ 发布。

## 完成定义
发布闸 UI + 测试证明不安装 + 文档更新。
