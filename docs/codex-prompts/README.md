# Codex 提示词目录（政安纵深升级）

总方案：[`../UPGRADE_PLAN_政安纵深.md`](../UPGRADE_PLAN_政安纵深.md)

| 文件 | 工作包 | 优先级 |
| --- | --- | --- |
| [U1-aegis-deep-link-admission.md](U1-aegis-deep-link-admission.md) | Aegis 深链与安装前阻断 | P0 |
| [U2-trace-workspace-embed.md](U2-trace-workspace-embed.md) | 过程台账常驻工作区 | P0 |
| [U3-evolution-release-gate-ui.md](U3-evolution-release-gate-ui.md) | 经验自演进发布闸 UI | P0 |
| [U4-identity-product-guardrails.md](U4-identity-product-guardrails.md) | 身份边界产品态 | P1 |
| [U4b-oidc-demo-identity.md](U4b-oidc-demo-identity.md) | 演示身份源（非组织 OIDC，可演示闸门） | P1 |
| [U5-four-layer-verify.md](U5-four-layer-verify.md) | 四层一键验收 | P1 |
| [U6-protect-tool-surface.md](U6-protect-tool-surface.md) | 行为护栏工具面扩样 | P2 |
| [U7-behavior-constraint-sota.md](U7-behavior-constraint-sota.md) | 权限闸门 SOTA 补强（来源门/契约/受管面） | P0 |
| [U7b-notify-tools-live.md](U7b-notify-tools-live.md) | **U7 通知工具进现网 toolFilter / 受管名单** | P0 |
| [U8-session-api-local-review.md](U8-session-api-local-review.md) | 会话 API + 安全评审本地双轨 | P0 |
| [U9-sandbox-network-isolation-demo.md](U9-sandbox-network-isolation-demo.md) | 会话沙箱双引擎 Docker+srt 与切换 | P0 |
| [U10-identity-login-task-acl.md](U10-identity-login-task-acl.md) | 业务身份登录 + 任务级 ACL/审批（先设计后实现；扩展 U4b+U7） | P0 |
| [U11-task-acl-full-coverage.md](U11-task-acl-full-coverage.md) | **任务 ACL 全量覆盖（聊天自动 scope + 原生工具；依赖 U7b）** | P0 |
| [U12-org-oidc-or-demo-boundary.md](U12-org-oidc-or-demo-boundary.md) | **组织 OIDC 配置位 /「仅演示」口径（项1）** | P0 |
| [U13-per-user-execution-delegate.md](U13-per-user-execution-delegate.md) | **UI 逐用户执行委托（项2）** | P0 |
| [U14-judge-chat-acl-regression.md](U14-judge-chat-acl-regression.md) | **评委聊天 ACL 回归路径（项3；依赖 U11）** | P0 |
| [U15-judge-demo-reel-script.md](U15-judge-demo-reel-script.md) | **评委成片讲稿与四层硬镜头打包（项4）** | P1 |
| [U16-evolution-gate-demo-stability.md](U16-evolution-gate-demo-stability.md) | **自演进门控演示稳定性与降级（项5）** | P1 |
| [U17-u8-live-activation-boundary.md](U17-u8-live-activation-boundary.md) | **U8 现网激活边界：会话 API vs 本地评审（项6）** | P1 |
| [U18-openclaw-config-recovery-drill.md](U18-openclaw-config-recovery-drill.md) | **openclaw.json 备份/哈希/一键恢复演练（项7）** | P0 |
| [U19-per-call-token-usage.md](U19-per-call-token-usage.md) | **轨迹图逐步 token（per-call usage；先设计后实现）** | P1 |
| [U20-api-usage-wrapper.md](U20-api-usage-wrapper.md) | **自建 API 包装层采逐步 token（不改内核；先设计后实现）** | P0 |
| [U21-judge-user-full-critique.md](U21-judge-user-full-critique.md) | **评委+用户全面体验批判 / 发布会演示流 / 登录与 IA 设计（默认只文档）** | P0 |
| [U22-login-task-bind-approval-path.md](U22-login-task-bind-approval-path.md) | **独立登录页＋当前任务绑定＋审批主路径＋清理 UI 工程话术（先设计后开发）** | P0 |
| [U23-approval-graph-sandbox-fp.md](U23-approval-graph-sandbox-fp.md) | **审批进图/同屏关联＋Docker 默认稳演示＋输入防护误报（先设计后开发）** | P0 |
| [POST-U11-BACKLOG.md](POST-U11-BACKLOG.md) | **U12–U18 总索引与推荐顺序** | 索引 |
| [U1-U9-ACCEPTANCE.md](U1-U9-ACCEPTANCE.md) | **U1–U9 总验收（证据型，默认不改代码）** | 验收 |

用法：按 U1→U2→U3→U5→U4→U4b（可选演示身份源）→U7→**U7b**→U8→U9→U6 顺序（U7 与闸门相关，可与 U4/U4b 前后紧挨），每次把对应文件全文发给 Codex，并要求其跑文内验收命令。身份登录+任务 ACL 用 [`U10-identity-login-task-acl.md`](U10-identity-login-task-acl.md)（先设计后实现，覆盖/扩展 U4b+U7）。U10 完成后：先 [`U7b-notify-tools-live.md`](U7b-notify-tools-live.md) 把通知工具登记进现网，再 [`U11-task-acl-full-coverage.md`](U11-task-acl-full-coverage.md) 扩聊天任务与原生工具全量 ACL。全部完成后，把 [`U1-U9-ACCEPTANCE.md`](U1-U9-ACCEPTANCE.md) 全文交给 Codex 做总验收并产出报告。

### U1–U11 之后（U12–U18）

详见 [`POST-U11-BACKLOG.md`](POST-U11-BACKLOG.md)。推荐顺序：**U18 → U17 → U13 → U12 → U14 → U16 → U15**。依赖摘要：U14 依赖 U11（建议 U13）；U15 依赖 U14 新证据（建议 U16）；U12/U13 扩展 U4b/U10 而不重造身份内核；U18 为现网配置恢复底座，宜最先做。

### U19

轨迹图逐步 token（方案 B，公开钩子）：见 [U19-per-call-token-usage.md](U19-per-call-token-usage.md)。先写 docs/U19_PER_CALL_TOKEN_USAGE.md；OpenClaw 2026.7.1-2 的 model_call_ended **不暴露** per-call usage，能拿到就显示，拿不到须诚实缺失原因，禁止造假。U19 已有条件 PASS。

### U20

自建本地 HTTP usage wrapper 截获 openai-completions 回包 usage，写入轨迹逐步 token（不改内核）：见 [U20-api-usage-wrapper.md](U20-api-usage-wrapper.md)。先写 docs/U20_API_USAGE_WRAPPER.md；改 baseUrl 前按 U18 备份哈希；默认可关、loopback-only；禁止伪造 usage。

### U21

评委 + 政务一线用户双角色全面体验与批判（发布会级演示流、完整使用逻辑、登录页/IA 设计、验收边界剥离到独立文档）：见 [U21-judge-user-full-critique.md](U21-judge-user-full-critique.md)。

- **本轮默认只交付文档**：`docs/JUDGE_USER_FULL_CRITIQUE.md`、`docs/PRODUCT_UX_LOGIN_AND_DEMO_FLOW.md`、`docs/ACCEPTANCE_BOUNDARIES.md` + `local-validation/u21-judge-critique/<timestamp>/`。
- **禁止改产品代码**；登录页与前端 IA 实现列入 backlog，由 **U22** 实现。
- 用户四模块（风险识别—行为约束—组件准入—评测审计）须与政安纵深四层做映射表，勿混名；Aegis 准入沙箱 ≠ U9 会话 Docker/srt。

### U22

按 U21 结论实现发布会主路径（**Codex 先设计后开发**）：见 [U22-login-task-bind-approval-path.md](U22-login-task-bind-approval-path.md)。

- 先写 `docs/U22_LOGIN_TASK_BIND_APPROVAL.md`（基于 `PRODUCT_UX_LOGIN_AND_DEMO_FLOW.md` 细化），自检通过再编码。
- 范围：独立登录页（演示身份源）→ 当前任务绑定（免手填 session key）→ 审批主路径（对治 T04）→ 清理 UI 工程话术；边界只留 `ACCEPTANCE_BOUNDARIES.md`。
- 复用 U4b/U10/U13；不接真组织 OIDC；不重做 U9；U20 wrapper 默认关；改 `openclaw.json`（如演示默认 Docker）前按 U18 备份哈希。
- 证据：`local-validation/u22-login-approval-path/<timestamp>/`；对照 U21 Top 阻碍 T01/T04 必须改善，T09 进图或诚实降级。

### U23

承接 U22 剩余边界与 U21 T02/T03/T09（**Codex 先设计后开发**）：见 [U23-approval-graph-sandbox-fp.md](U23-approval-graph-sandbox-fp.md)。

- 先写 `docs/U23_APPROVAL_GRAPH_SANDBOX_FP.md`，自检通过再编码。
- 范围：原生审批尽量进轨迹/调用图（或同屏强关联，禁止假闭环）；演示默认 Docker，srt 可切但须冷启动/耗时提示；降低演示主路径输入误报，真注入仍可拦。
- 真组织 OIDC 非目标（仅 runbook 指针）；不 patch 内核；U20 默认关；改 `openclaw.json` 前按 U18 备份哈希。
- 证据：`local-validation/u23-approval-graph-sandbox-fp/<timestamp>/`。
