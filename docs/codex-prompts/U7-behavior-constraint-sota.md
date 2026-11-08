# Codex 提示词 U7：权限闸门（行为约束）SOTA 对齐补强

## 角色与仓库
`F:\揭榜挂帅\GovAgentSec`，OpenClaw **2026.7.1-2**（禁止升级宿主）。默认不 git push。
产品层名：**权限闸门**（原 AgentGuard / 行为约束模块）。

## 背景
闸门已有：动态授权、动作快照、一次性票据、防重放、`read_gov_document` 密级演示、中文门禁面板、开发身份默认关。
评测与体验上仍偏「动作摘要 + 审批」，弱于 SOTA 的 **参数来源约束 / 任务级最小权限 / 受管工具面覆盖**。
本包对齐（思想吸收，禁止整仓替换）：
- ToolFence / PACE：敏感参数必须有可信 provenance（用户输入或已批快照），禁止纯来自不可信工具回执的值直达高危调用（within-tool 注入改参）
- Progent：任务级 privilege policy；运行中只允许单调收紧，扩权必须显式审批
- EMNLP ToolGuards：策略片段编译为调用前确定性守卫（可继续落 Rego / Python 校验）
- GoPlus AgentGuard OpenClaw 钩子契约：`before_tool_call` 失败默认拒绝；优先走宿主原生审批通道
- **不做**完整 CaMeL Dual-LLM 解释器重写（可在文档写「对照上界」，不进本包交付范围）

参考：`docs/CONTROLLED_DOCUMENT_VALIDATION.md`、`docs/DELIVERY_ACCEPTANCE.md`、`docs/产品使用逻辑与模块协同.md`、`modules/agentguard-group2/`。

## 目标（按优先级实现，可分 commit，但一次交付要可演示）

### A. 参数来源门（P0，核心）
1. 为工具调用参数引入轻量 **provenance 标签**：至少区分 `user` / `approved_snapshot` / `tool_untrusted` / `unknown`。
2. 对敏感参数白名单强制校验（至少覆盖）：
   - `document_id` / 路径类
   - 外发类（若已有或本包新增受管工具）：收件人、URL
   - 命令/金额类字段（若工具面已有）
3. 规则：**高危工具**的敏感参数不得仅来自 `tool_untrusted`/`unknown`；违规 → fail-closed 阻断或升格审批，写审计原因码（中文可展示）。
4. 补 **注入改参** 自动化用例：工具名合法、参数被「邮件/网页回执」污染 → 必须拦；用户明文授权的同参 → 可放行或走既有审批。

### B. 受管工具面扩罩（P0）
1. 盘点工作区可见工具：标出「已接入闸门 / 未受控」。
2. 至少再收 1–2 个高危或政务相关动作到受管 MCP（合成数据即可），与现有 `read_gov_document` 并列演示。
3. 未受控工具：工作台/任务详情醒目标红「未受 AgentGuard 闸门」；禁止在文档里宣称全工具已托管。

### C. 任务级最小权限契约（P1）
1. 任务开始（或首次敏感工具前）生成 **本任务允许工具集合**（可从用户意图 + 默认角色模板推导；可用本地规则，勿外发轨迹）。
2. 运行中：集合只可收紧，不可静默扩权；扩权 → 待审批。
3. UI：待审批/任务页展示当前契约摘要；审批通过后写入一次性票据作用域。

### D. 审批 UX 与身份边界（P1，衔接 U4）
1. 待批卡片展示：动作摘要、**参数 provenance 污点**、与契约差异、票据 TTL。
2. 无 OIDC：执行类保持禁用（已有则加固）；演示身份必须标「非生产」；禁止网关管理员令牌冒充业务审批。

### E. 文档与验收
1. 新增 `docs/BEHAVIOR_CONSTRAINT_SOTA_UPGRADE.md`：写清对齐了哪些论文思想、本包做了/没做（明确不做完整 CaMeL）。
2. 更新 `docs/UPGRADE_ROUND_VALIDATION.md` 与产品使用逻辑中「行为约束」小节。
3. 自动化测试全部可重复、退出码非 0 即失败。

## 约束
- fail-closed；禁止新增默认放行旁路。
- 轨迹/审计不存公文正文、prompt 原文；敏感内容哈希或脱敏。
- 不把轨迹发给外部 API；评审默认本地。
- 不升级 OpenClaw；不替换为 GoPlus 整仓；只吸收钩子与策略思想。
- 不用假 UI；演示走真实面板/MCP。
- 默认不 git push。

## 建议改动落点（可按仓库实际结构调整）
- `modules/agentguard-group2/`：策略、票据、OPA/校验、provenance
- OpenClaw 插件/`before_tool_call` 适配层：失败拒绝、审批回执
- 受管 MCP：`read_gov_document` 旁扩展工具
- 工作台 UI：未受控标记、契约与污点展示
- `scripts/test_*.py` / `scripts/demo_*.py`：注入改参 + 契约单调性

## 验收命令（实现后补齐真实文件名，至少包含下列意图）
```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_gov_document.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_boundary.py
# 本包新增（名称可自定，但必须存在且绿）：
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_param_provenance.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_task_privilege_contract.py
```

## 完成定义
- 注入改参用例稳定失败→阻断；用户授权路径可演示通过或合规审批
- 至少 1 个新受管工具或等价受控路径 + 未受控标记可见
- 任务权限契约可展示且不可静默扩权
- 文档写明 SOTA 对齐边界；相关测试全绿