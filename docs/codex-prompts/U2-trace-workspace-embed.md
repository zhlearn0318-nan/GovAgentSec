# Codex 提示词 U2：过程台账常驻工作区

## 角色与仓库
仓库 `F:\揭榜挂帅\GovAgentSec`，OpenClaw **2026.7.1-2** 锁定。禁止把轨迹原文发外部 API。默认不 git push。

## 背景
`govagentsec-trace` 与 `trajectory-governance` 已具备 JSONL、调用图、对比、候选。工作区文档（`docs/openclaw-workspace.md`）已设计「任务与轨迹 / 审计中心」入口，但现场仍易落到脚本目录或空图状态说不清。需要把过程台账 **产品化嵌进工作区**，并处理好空态/孤儿事件。

## 目标
1. 工作区一级路径稳定可达（刷新、折叠侧栏、顶栏仍在）：
   - 当前任务详情：过程图 + 防护/审批摘要
   - 审计中心：搜索/筛选；同任务对比；候选记录入口
2. **空态与降级文案**（中文，真实数据驱动）：
   - 无事件：说明如何产生轨迹（启用插件、跑一次受管工具），禁止假节点
   - 宿主缺工具开始事件导致的恢复/孤儿：明确「证据不足，已隔离/不可入选」，禁止静默补造事件（与 `REAL_MULTI_TRACE_EVOLUTION` / `test_real_evolution` 一致）
3. 默认日常视图 **不混入** 本地合成测试；需显式开关「包含本地合成测试」。
4. 自动化：扩展或新增 `scripts/test_trace_audit_ui.mjs` / `test_workspace_ia.mjs` 覆盖：入口可达、空态文案、测试过滤、对比深链。
5. 文档：`docs/openclaw-workspace.md` 与 `docs/UPGRADE_ROUND_VALIDATION.md` 更新入口 URL 与截图目录约定（截图可放到 `local-validation/trace-ui/`，勿堆桌面）。

## 约束
- 隐私模式保持 hash；UI 不得为了好看展示 prompt/参数原文。
- 不升级宿主；不重写整套 UI 框架；在现有 `govagentsec-ui` / trace 面板上增强。
- 演示文件默认写 `local-validation/` 或 `F:\揭榜挂帅\评委演示素材\`，不要写用户桌面。

## 建议改动区域
- `modules/govagentsec-ui/workspace.mjs`、`shell.mjs`
- `modules/govagentsec-trace/view.mjs`、`view-model.mjs`、`register.mjs`
- `modules/trajectory-governance/native-view.mjs`、`workbench.mjs`
- `scripts/install_openclaw_workspace.mjs`、`scripts/test_trace_audit_ui.mjs`、`scripts/test_workspace_ia.mjs`

## 验收命令
```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node --test modules/govagentsec-trace/test/*.test.mjs
node scripts/test_workspace_ia.mjs
node scripts/test_trace_audit_ui.mjs
```
手动：登录工作区 → 顶栏「任务与轨迹」→ 有图任务可见边；无事件任务见空态说明；对比深链与按钮一致。

## 完成定义
入口稳定、空态诚实、测试通过、文档更新、输出文件变更列表与演示路径。
