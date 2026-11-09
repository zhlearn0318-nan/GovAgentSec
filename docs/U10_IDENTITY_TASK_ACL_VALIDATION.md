# U10 身份与任务权限验收

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

**结论：五个切片完成，可按合成数据与非生产身份演示。** 组织 OIDC 未接，不代表生产发布或全工具任务 ACL 完成。

## 顺序与结果

先写 [IDENTITY_TASK_ACL_DESIGN.md](IDENTITY_TASK_ACL_DESIGN.md)，阶段 A 六项自检通过，再实现。L1 扩展 U4b，L2 扩展 U7；未另建身份源或闸门。

| 切片 | 结果 |
| --- | --- |
| 1 身份与徽章 | 审计只读身份；现有进程内 RS256 演示选人；默认关闭、非生产标识 |
| 2 角色与策略 | 同一 Verifier/OPA；经办、财务、处长、审计分权；伪造角色、网关 token、自批拒绝 |
| 3 任务 scope | registry 目录 URI 树 + 工具集合；范围外不列为可用，读前硬 DENY；只可收紧 |
| 4 审批与票据 | 显式申请服务端原动作；审批授权 60 秒/执行票据 30 秒；主体/任务/动作/范围绑定、一次核销 |
| 5 验证与恢复 | 12 条命令 exit 0；真实 UI 8 张 PNG；演示源关闭、配置哈希不变 |

## 复跑与证据

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts/verify_identity_task_acl.mjs
```

前置：OpenClaw **2026.7.1-2** 的本机网关 18789 已加载本仓库 runtime-security/UI 插件；AgentGuard venv、OPA、Wasmtime、Edge 可用。旧进程未加载新 RPC 时重启固定版本网关，不升级。若已有活动演示，live 会失败，避免关闭他人活动。

证据目录：[2026-11-08T05-58-38-522Z](../local-validation/identity-task-acl/2026-11-08T05-58-38-522Z/README.md)，目录时间为 UTC。

- [report.json](../local-validation/identity-task-acl/2026-11-08T05-58-38-522Z/report.json)：阶段 A、命令、退出码、日志与耗时。
- [live-report.json](../local-validation/identity-task-acl/2026-11-08T05-58-38-522Z/live-report.json)：source=real-openclaw-ui-rs256-opa-task-acl，passed=true，synthetic_data=true，production_oidc=false。
- `01—08 PNG`：默认关闭、经办身份、A 范围、B 拒绝、申请、处长放行、审计只读、关闭恢复。
- `identity-audit.jsonl`：脱敏业务回执，无正文、Bearer、私钥。

| 命令（AGPY=modules/agentguard-group2/.venv/Scripts/python.exe） | 结果 |
| --- | --- |
| AGPY scripts/test_identity_boundary.py | exit 0，9 项 |
| python scripts/check_identity.py | exit 0，仍报告组织配置缺口 |
| AGPY scripts/test_task_privilege_contract.py | exit 0，10 项 |
| AGPY scripts/test_param_provenance.py | exit 0，10 项 |
| AGPY scripts/test_identity_task_acl.py | exit 0，10 项 |
| AGPY scripts/test_demo_identity.py | exit 0，9 项 |
| node scripts/test_demo_identity_rpc.mjs | exit 0 |
| AGPY scripts/test_gov_document.py | exit 0，10 项 |
| node scripts/test_panel_access.mjs | exit 0 |
| node scripts/test_workspace_ia.mjs | exit 0 |
| node scripts/test_identity_live.mjs | exit 0 |
| node scripts/test_task_acl_live.mjs | exit 0 |

另补跑 `node scripts/test_demo_identity_live.mjs`，exit 0：原 U4b 通知/付款双人审批、拒绝和关闭恢复仍通过。补充报告在同一证据目录 `u4b-regression/live-report.json`，与 U10 主报告分开保存。

## 真实页面证据

同一 task_id：`demo-acl-ef90c687bf834baaa53f8f6a8c169c9c`。

1. 绑定 govdoc://demo/public/ 与 file.read，可用列表只有 emergency_plan。
2. A 读取成功，底层 read_count=1。
3. B 读取 P014 DENY，read_count 仍为 1；显式申请转 pending；自批 D105，仍为 1。
4. approver-test 批准 B，read_count=2；相同审批重放 A409、executed=false，仍为 2。前后 scope digest 相同，基础权限未扩大。
5. auditor-test 保持已登录，只读台账；关闭演示源恢复默认关闭。

专项另覆盖：未经申请不能审批、D004/D005 不可借审批绕过、非规范 URI 与未登记 ID、工具越界、收紧后旧票据失效、动作篡改、票据过期、授权过期、并发审批/票据重放、OPA 故障。拒绝断言检查真实底层 read_count。

网关为加载新 RPC 重启一次，仍运行 2026.7.1-2。配置前后 SHA-256 均为 `0b6a24718f17312c9ab5aaa1d9f344b0508dbfc70ff8784681266875acbe3374`。未修改网关配置、未升级、未 push、未发送模型消息或外发轨迹。恢复字段 demo_disabled_after_run=true、config_unchanged=true。

## 文件与接口

| 文件 | 改动 |
| --- | --- |
| modules/agentguard-group2/enforcement/task_policy.py | U7 增目录范围、scope digest、显式扩权与单调收紧 |
| modules/agentguard-group2/enforcement/gateway.py | 原执行审计补身份来源和 scope digest |
| modules/agentguard-group2/service/app.py | 原可信契约入口接目录；扩权申请仍进入原 invoke/resolve |
| modules/agentguard-group2/identity/demo_provider.py | 同一 worker 扩展任务操作、只读审计和安全回执 |
| modules/agentguard-group2/identity/keycloak/agentguard-realm.json | auditor-test / audit_reader，无生产密钥 |
| modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs | 原 RPC 扩展三个任务操作与参数白名单 |
| modules/govagentsec-ui/demo-identity.mjs | 原卡片增绑定、DENY/申请、审批与台账 |
| modules/govagentsec-ui/workspace.mjs | 审计已登录显示只读，不提示重新登录 |
| scripts/test_identity_task_acl.py | 10 项真实本地链路专项 |
| scripts/test_task_acl_live.mjs | 真实页面、截图、回执与恢复检查 |
| scripts/verify_identity_task_acl.mjs | 一键必跑/回归与报告 |
| scripts/test_demo_identity_rpc.mjs、test_demo_identity_live.mjs | 既有测试适配新增 RPC/身份数量 |
| docs/IDENTITY_TASK_ACL_DESIGN.md | 先行设计与阶段 A 自检 |
| docs/OIDC_USAGE.md、OIDC_DEMO_OPTIONS.md、DELIVERY_ACCEPTANCE.md、UPGRADE_ROUND_VALIDATION.md | 当前用法、边界与验收状态 |

现有 govagentsec.demoIdentity 下新增（均另需业务 Bearer）：

| RPC | 参数 |
| --- | --- |
| task_create | directory：A/B；服务端生成 task_id，绑定 file.read |
| task_read | task_id、document_id；不能传路径/角色/密级/票据 |
| task_escalate | request_id；只能引用当前经办已有越界拒绝快照 |

管理 RPC 仍要求 operator.admin；业务身份另由 Verifier 校验。审批沿用 resolve。task_contract_authenticated 增可选 resource_prefixes，省略保留旧 U7 行为，显式空数组拒绝所有文件。目录仅支持规范 govdoc URI。request_task_expansion_authenticated 是可信服务内部方法，不新增 MCP 扩权工具。

## 五句演示话术

1. 组织身份源尚未接入，当前是演示身份源（非生产）。
2. 演示 JWT 校验与生产共用同一内核，网关登录不等于业务身份。
3. 经办任务只绑定目录 A 和必要工具，目录 B 越权读取在执行前拒绝。
4. 经办显式申请后，由另一处长批准原动作，短期票据只放行一次且不能自批。
5. 审计身份只读台账，关闭演示源后执行与审批恢复禁用。

限制：管理员选合成用户不是生产 SSO/MFA；逻辑目录不是全盘 ACL。聊天自动 scope 与原生工具执行前 ACL 后续扩展见 [U11 验收](U11_TASK_ACL_FULL_VALIDATION.md)，其中区分允许、硬拒绝及尚无模型 E2E 的证据边界；本篇保留 U10 当时的合成目录验收口径。U9 会话沙箱与 Aegis 准入未变。未做真实组织 IdP 联调。
