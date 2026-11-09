# U18 → U17 → U13 → U12 → U14 → U16 → U15 总交付

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

2026-11-08，七项按上述顺序完成，**各自定义的验收范围内全部 PASS**。每项先完成设计自检，再实现并保存证据。OpenClaw 保持 **2026.7.1-2**；未 push、未提交真实密钥、未向外部 API 发送轨迹。

## 设计与证据索引

所有路径以 `F:\揭榜挂帅\GovAgentSec` 为根。

| 项目 | 结果 | 设计文档 | 本轮报告 / 证据目录 |
| --- | --- | --- | --- |
| U18 配置恢复 | PASS | [U18_OPENCLAW_CONFIG_RECOVERY_DRILL.md](U18_OPENCLAW_CONFIG_RECOVERY_DRILL.md) | [drill-report.json](../local-validation/u18-openclaw-recovery-drill/2026-11-08T07-11-24-921Z/drill-report.json) |
| U17 双轨现网边界 | PASS | [U17_U8_LIVE_ACTIVATION_BOUNDARY.md](U17_U8_LIVE_ACTIVATION_BOUNDARY.md) | [report.json](../local-validation/u17-u8-activation-boundary/2026-11-08T07-13-16-791Z/report.json) |
| U13 逐用户委托 | PASS | [U13_PER_USER_EXECUTION_DELEGATE.md](U13_PER_USER_EXECUTION_DELEGATE.md) | [report.json](../local-validation/u13-per-user-delegate/2026-11-08T07-30-32-129Z/report.json) |
| U12 组织身份边界 | PASS | [U12_ORG_OIDC_OR_DEMO_BOUNDARY.md](U12_ORG_OIDC_OR_DEMO_BOUNDARY.md) | [report.json](../local-validation/u12-oidc-boundary/2026-11-08T07-34-47-317Z/report.json) |
| U14 聊天审批路径 | PASS | [U14_JUDGE_CHAT_ACL_REGRESSION.md](U14_JUDGE_CHAT_ACL_REGRESSION.md) | [report.json](../local-validation/u14-judge-chat-acl/2026-11-08T08-06-40-970Z/report.json) |
| U16 演进稳定性 | PASS | [U16_EVOLUTION_GATE_DEMO_STABILITY.md](U16_EVOLUTION_GATE_DEMO_STABILITY.md) | [report.json](../local-validation/u16-evolution-gate-stability/2026-11-08T08-17-16-950Z/report.json) |
| U15 讲稿与四层素材 | PASS | [U15_JUDGE_DEMO_REEL_SCRIPT.md](U15_JUDGE_DEMO_REEL_SCRIPT.md) | [report.json](../local-validation/u15-demo-reel/2026-11-08T08-23-17-228Z/report.json) |

## 交付结果

- **U18**：私有备份、前后哈希约束和恢复脚本；本轮恢复独立克隆文件，现网配置未做 live 改写。
- **U17**：明确当前会话默认 `deepseek/deepseek-flash` 与本地评审分离。模型协议冒烟是本地 mock，未声称云端账号连通性通过。
- **U13/U12**：逐页身份委托可撤销，换人撤销旧委托，保留其他页面委托；只读审计员不能执行。演示源、开发身份或缺失 MFA 不能显示组织身份已启用；提供正式组织接入检查与 runbook，未连接真实 IdP。
- **U14**：真实聊天自动 scope、P014 越权零读取、D105 禁自批、另一审批人通过真实页面授权、一个 read 工具成功、重放读取不增加。三个真实 Agent 运行均正常结束，五张截图。模型响应为本地确定性夹具。原生 read 内部读取两次，不伪称只有一次底层文件访问。
- **U16**：六组检查全部通过；九条合成断网样本 **5 pass / 4 quarantine**，评分有差异及缺失。误开外部评审、运行时端点篡改、云代理权重和重定向均拒绝。现网确认禁用、候选未安装。隔离 loader 的合成发布/更新/回滚测试单独记录，不是现网安装。
- **U15**：五分钟讲稿、四层硬镜头与来源清单；21 个文件逐一校验复制哈希，排除 8 项失败/空白基线材料。无新录或重剪 MP4，旧片保留为历史版本。

## 本轮发现并修复的根因

真实聊天回归发现，固定宿主启动与 Agent 预热会分别注册插件。原来 UI RPC 和 Agent Hook 各自创建身份 worker，导致 UI 已绑定但聊天拿不到 scope。现在同一网关进程共用身份桥及其运行关联表；关闭时清理关联。仍沿用 U4b/U10/U11 的 JWT、OPA、scope、动作摘要及一次性票据，没有另造策略内核。

该修复由 U14 真实聊天验收及 [最后一轮 U10/U11 回归](../local-validation/identity-task-acl-full/2026-11-08T08-10-27-770Z/report.json) 验证。网关已重启加载，重启后 [逐用户委托页面复测](../local-validation/post-u11-delivery/2026-11-08-final/delegate-live/delegate-live-report.json) PASS，初始与结束均为演示源关闭。

## 现网状态

- 地址：`http://127.0.0.1:18789/`；最终 HTTP 200，唯一监听进程 PID 21652。
- 配置 SHA-256 前后相同：`310882218addee02ff560b4ebe4026227a3b95388c40f387bb055a71b770da9e`。
- [最终启动与哈希证据](../local-validation/post-u11-delivery/2026-11-08-final/activation/final-health.json)。后台启动器与 no-respawn 尝试未达到可用状态，已替换为持续进程；没有把失败启动记录算作通过。
- 不改现网模型、toolFilter 或安全阈值；没有安装本轮候选。演示源当前关闭。

## 复跑命令

在仓库根目录运行：

```powershell
node scripts/drill_openclaw_config_recovery.mjs
node scripts/verify_u8_activation_boundary.mjs
node scripts/verify_per_user_delegate.mjs
node scripts/verify_oidc_demo_boundary.mjs
node scripts/verify_judge_chat_acl.mjs
node scripts/verify_evolution_gate_demo.mjs
node scripts/package_judge_demo_u15.mjs
```

U14/U16 需要现有网关、Edge、本地 OPA 和相应沙箱环境；脚本失败非零退出。U15 打包脚本验证本说明列出的已验收来源，不自动选取未知“最新”报告。

## 素材入口

- [仓库素材索引](U15_JUDGE_DEMO_PACK.md)。
- 材料盘讲稿：`F:\揭榜挂帅\评委演示素材\成片\GovAgentSec-政安纵深-U15-讲稿.md`。
- 素材包：`F:\揭榜挂帅\评委演示素材\验收与证据\u15-four-layer-shots-2026-11-08T08-23-17-228Z\`；其中 `manifest.json` 记录来源与 SHA-256，`scan-report.json` 记录排除项。没有复制原始 JSONL、完整配置或秘密票据。

## 仍存在的限制

1. 组织 OIDC 未接入；演示身份与合成 MFA 不能用于生产验收。发布闸通过不等于安装或生产发布。
2. Windows SRT 实测一个原生 read 耗时数分钟，且不是完美 OS 隔离。本轮聊天重放实际先命中 **G204 过期**；TTL 内 G206/并发一次核销由 U10/U11 另证。五分钟讲解使用已验证截图，不承诺冷启动链路五分钟结束。
3. Group1 将一条含“政企真实文件”的合成说明误判为政治敏感并真实中止了 Agent。该失败报告保留，未降低防护阈值；本轮 ACL 稳定样本使用中性的合成库存文本。**没有声称这类误报已修复。**
4. U14 使用确定性本地模型夹具；U16 断网样本是合成标定。行为护栏与原始调用图主镜头是历史真实运行证据，演进组件截图使用真实证据副本；均在讲稿与 manifest 中分别标注，不统称为本轮真实模型生产 E2E。
5. 当前网关由持续进程运行，不是本轮新建的 Windows 持久服务；若宿主进程结束，需要按既有启动方式重启。U18 的恢复演练只恢复克隆，未进行现网 live 恢复。

## 主要变更文件

| 范围 | 文件 |
| --- | --- |
| 身份与聊天共享状态 | `modules/agentguard-group2/identity/demo_provider.py`、`identity/chat_acl.py`；运行插件 `demo-identity.mjs`、`chat-acl.mjs` |
| 身份 UI 与边界 | `modules/govagentsec-ui/demo-identity.mjs`、`identity-status.mjs`；`scripts/check_identity.py` |
| 备份与汇总基础 | `scripts/lib/config-recovery.mjs`、`lib/backlog-evidence.mjs`；backup/restore/drill/test_config_recovery 脚本 |
| 验收入口 | 上述七条复跑命令对应脚本；`test_per_user_delegate.py`、`test_per_user_delegate_live.mjs`、`check_oidc_demo_boundary.py`、`test_oidc_demo_badge.mjs` |
| 真实聊天夹具 | `scripts/test_judge_chat_live.mjs`、`scripts/fixtures/u14-read-counter/`；计数插件只加载隔离测试网关 |
| 演进降级 | `scripts/test_evolution_gate_degradation.mjs`、`test_evolution_release_gate_live.mjs` 的时间戳输出 |
| 文档 | 七份设计、本文、U15 素材索引，以及 MAINTENANCE、MODEL_ROUTING、OIDC_USAGE、OIDC_DEMO_OPTIONS、DELIVERY_ACCEPTANCE、REAL_MULTI_TRACE_EVOLUTION 的相关补充 |

工作树原有大量未提交改动，本轮未重置、未大规模格式化，也没有提交或推送远端。
