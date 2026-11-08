# U1–U11 之后补强包（U12–U18）

对应「完成 U1–U11 后仍需补足」的 1–7 项。均为 **先设计后实现/交付** 的 Codex 提示词；不替代 U1–U11 已验收能力。

| 项 | 提示词 | 一行目标 |
| --- | --- | --- |
| 1 | [U12-org-oidc-or-demo-boundary.md](U12-org-oidc-or-demo-boundary.md) | 组织 OIDC 配置位/runbook +「仅演示」强制口径与检查 |
| 2 | [U13-per-user-execution-delegate.md](U13-per-user-execution-delegate.md) | UI 逐用户执行委托：按人持有 Bearer，开/关执行与服务端一致 |
| 3 | [U14-judge-chat-acl-regression.md](U14-judge-chat-acl-regression.md) | 固化评委路径「聊天越权→审批→单次放行」+ 新绿证 |
| 4 | [U15-judge-demo-reel-script.md](U15-judge-demo-reel-script.md) | 四层各 1 硬镜头讲稿/镜头表/证据打包进评委演示素材 |
| 5 | [U16-evolution-gate-demo-stability.md](U16-evolution-gate-demo-stability.md) | 自演进门控稳定：轨迹不出域、无 OIDC/断网降级与检查 |
| 6 | [U17-u8-live-activation-boundary.md](U17-u8-live-activation-boundary.md) | 澄清会话 API vs 本地评审现网边界，防评委追问混淆 |
| 7 | [U18-openclaw-config-recovery-drill.md](U18-openclaw-config-recovery-drill.md) | openclaw.json 备份/哈希/一键恢复演练 |

## 推荐执行顺序

**U18 → U17 → U13 → U12 → U14 → U16 → U15**

| 顺序 | 包 | 依赖说明 |
| --- | --- | --- |
| 1 | U18 | 无强依赖；先于后续可能改现网的操作，建立恢复能力 |
| 2 | U17 | 依赖已有 U8 落地；文档/检查固化，默认不改配置 |
| 3 | U13 | 依赖 U4b/U10 演示身份；补委托链 |
| 4 | U12 | 依赖 U4b/U10；以「仅演示」口径为主，A 真接仅 runbook；与 U13 互补不重复造内核 |
| 5 | U14 | **依赖 U11**（及建议 U13）；固化聊天 ACL 评委路径 |
| 6 | U16 | 依赖 U3/U8；与 U17 边界一致下做演进稳定性 |
| 7 | U15 | **依赖 U14 新闸门证据**；建议 U16 话术已定；最后对齐成片 |

## 与已有包边界（勿重复造轮）

- **U4b/U10**：身份签发、演示源、任务 ACL 内核 → U12/U13 只做口径与委托，不新造 Verifier。
- **U11**：聊天/原生全量 ACL → U14 只固化评委回归，不重写策略引擎。
- **U7b**：通知工具进现网与备份范例 → U18 泛化恢复演练，不重做通知登记。
- **U8**：模型双轨已实现 → U17 澄清现网边界；U16 专测演进不出域。
- **U3/U9**：发布闸与双沙箱不在本系列重做。
