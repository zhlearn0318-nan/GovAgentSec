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
| [POST-U11-BACKLOG.md](POST-U11-BACKLOG.md) | **U12–U18 总索引与推荐顺序** | 索引 |
| [U1-U9-ACCEPTANCE.md](U1-U9-ACCEPTANCE.md) | **U1–U9 总验收（证据型，默认不改代码）** | 验收 |

用法：按 U1→U2→U3→U5→U4→U4b（可选演示身份源）→U7→**U7b**→U8→U9→U6 顺序（U7 与闸门相关，可与 U4/U4b 前后紧挨），每次把对应文件全文发给 Codex，并要求其跑文内验收命令。身份登录+任务 ACL 用 [`U10-identity-login-task-acl.md`](U10-identity-login-task-acl.md)（先设计后实现，覆盖/扩展 U4b+U7）。U10 完成后：先 [`U7b-notify-tools-live.md`](U7b-notify-tools-live.md) 把通知工具登记进现网，再 [`U11-task-acl-full-coverage.md`](U11-task-acl-full-coverage.md) 扩聊天任务与原生工具全量 ACL。全部完成后，把 [`U1-U9-ACCEPTANCE.md`](U1-U9-ACCEPTANCE.md) 全文交给 Codex 做总验收并产出报告。

### U1–U11 之后（U12–U18）

详见 [`POST-U11-BACKLOG.md`](POST-U11-BACKLOG.md)。推荐顺序：**U18 → U17 → U13 → U12 → U14 → U16 → U15**。依赖摘要：U14 依赖 U11（建议 U13）；U15 依赖 U14 新证据（建议 U16）；U12/U13 扩展 U4b/U10 而不重造身份内核；U18 为现网配置恢复底座，宜最先做。

### U19

轨迹图逐步 token（方案 B，公开钩子）：见 [U19-per-call-token-usage.md](U19-per-call-token-usage.md)。先写 docs/U19_PER_CALL_TOKEN_USAGE.md；OpenClaw 2026.7.1-2 的 model_call_ended **不暴露** per-call usage，能拿到就显示，拿不到须诚实缺失原因，禁止造假。U19 已有条件 PASS。

### U20

自建本地 HTTP usage wrapper 截获 openai-completions 回包 usage，写入轨迹逐步 token（不改内核）：见 [U20-api-usage-wrapper.md](U20-api-usage-wrapper.md)。先写 docs/U20_API_USAGE_WRAPPER.md；改 baseUrl 前按 U18 备份哈希；默认可关、loopback-only；禁止伪造 usage。
