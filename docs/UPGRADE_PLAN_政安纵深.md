# 政安纵深 · 下一轮升级方案（给 Codex 开发用）

日期：2026-11-07  
基线：已合入 `main`（`4e24831`），宿主锁定 **OpenClaw 2026.7.1-2**  
产品叙事：**行为护栏 / 权限闸门 / 过程台账 / 经验自演进**

## 1. 目标与非目标

### 目标（本轮要变强的）
1. **Aegis 深链/安装前阻断可演示**：评委点开安装或深链时，能看到清晰中文阻断原因与审计回执，而不是含糊 401 或空白页。
2. **过程台账常驻工作区**：调用图、同任务对比、候选车间在工作台/审计中心一键可达，少依赖脚本目录。
3. **经验自演进发布闸 UI**：人工确认 → 双门控结果 → 联合准入 → **明确不自动安装** 的证据链一眼可读。
4. **身份边界可讲清**：继续默认禁用开发身份；补「缺 OIDC 时的产品态说明 + 可选本地受控演示开关」的完整文档与 UI 文案，避免被当成已完成生产身份。
5. **四层一键验收**：`Verify.ps1`（或新脚本）输出一份四层报告，方便现场复检。

### 非目标（禁止）
- 升级 OpenClaw 超过 `2026.7.1-2`
- 把轨迹原文/评分证据发给外部 API（含 DeepSeek）
- 自动安装候选 Skill / 把 `admission_passed` 当成 release
- 用 HTML/Pillow/自绘假表替代真实系统 UI
- 为演示伪造 Hook 事件或补造缺失工具开始事件
- `git push`（除非用户另下指令）；本轮默认只改代码与本地文档

## 2. 现状摘要（已有，勿重复造轮）

| 层 | 已有能力 | 主要缺口 |
| --- | --- | --- |
| 行为护栏 | 结果门禁 fail-closed、阻断取消后续工具、工作区防护覆盖 | 业务工具面用例偏少；流式终审仍非完整发送前门控（见 DELIVERY_ACCEPTANCE P2） |
| 权限闸门 | `read_gov_document`、中文文档门禁面板、票据防重放 | 生产 OIDC 未接；缺参数 provenance / 任务级最小权限契约；工具面未全罩（见 U7） |
| 过程台账 | JSONL、哈希链、调用图、UI 冒烟 | 入口与工作台粘合、空图/孤儿事件的产品文案、现场一键复检 |
| 经验自演进 | 真实六轨迹→TopK→联合准入 | 发布闸 UI、人工确认步骤产品化、候选车间状态机可视化 |

参考文档：`docs/README.md`、`docs/DELIVERY_ACCEPTANCE.md`、`docs/REAL_MULTI_TRACE_EVOLUTION.md`、`docs/TRACE_DELIVERY_VALIDATION.md`、`docs/CONTROLLED_DOCUMENT_VALIDATION.md`、`docs/openclaw-workspace.md`。

## 3. 工作包与优先级

| ID | 名称 | 优先级 | 预估 | Codex 提示词 |
| --- | --- | --- | --- | --- |
| U1 | Aegis 深链与安装前阻断可演示 | P0 | 0.5–1 天 | `codex-prompts/U1-aegis-deep-link-admission.md` |
| U2 | 过程台账常驻工作区 | P0 | 1 天 | `codex-prompts/U2-trace-workspace-embed.md` |
| U3 | 经验自演进发布闸 UI | P0 | 1 天 | `codex-prompts/U3-evolution-release-gate-ui.md` |
| U4 | 身份边界产品态文案与守卫 | P1 | 0.5 天 | `codex-prompts/U4-identity-product-guardrails.md` |
| U5 | 四层一键验收报告 | P1 | 0.5 天 | `codex-prompts/U5-four-layer-verify.md` |
| U6 | 行为护栏业务工具面扩样 | P2 | 0.5–1 天 | `codex-prompts/U6-protect-tool-surface.md` |
| U7 | 权限闸门 SOTA 补强（来源门/最小权限契约/受管面） | P0 | 1–1.5 天 | `codex-prompts/U7-behavior-constraint-sota.md` |
| U8 | 会话 API + 安全评审本地双轨 | P0 | 0.5–1 天 | `codex-prompts/U8-session-api-local-review.md` |
| U9 | 会话沙箱双引擎 Docker+srt 与切换入口 | P0 | 2–4 天 | `codex-prompts/U9-sandbox-network-isolation-demo.md` |

建议开发顺序：**U1 → U2 → U3 → U5 → U4 → U7 → U8 → U6**（U7 可与 U4 连续做，优先于 U6）。每完成一个工作包，用该提示词末尾「验收命令」跑通后再开下一个。

## 4. 统一验收标准（所有工作包共用）

1. 固定宿主 `2026.7.1-2`；改动后网关可重启加载，不破坏已有工作区入口。
2. 所有用户可见文案中文；禁止乱码；关键路径可截真实 UI。
3. 自动化测试：新增/改动模块必须有可重复脚本；退出码非 0 即失败。
4. 隐私：轨迹默认 hash；审计不存 document 正文 / prompt 原文。
5. 在 `docs/` 追加本轮短验收记录（可合并进既有 VALIDATION 或新建 `docs/UPGRADE_ROUND_VALIDATION.md`）。
6. 不做 git push；不改无关大重构。

## 5. 给用户的用法

对每个工作包，把对应 `docs/codex-prompts/U*.md` **全文**发给 Codex（可加：`在 F:\揭榜挂帅\GovAgentSec 仓库根目录执行；完成后用提示词里的验收命令自测并报告结果`）。  
本文件是总览；实现细节以各 U*.md 为准。
