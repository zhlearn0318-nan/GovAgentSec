# 高级演示账号仅保留原生动作确认

2026-11-09，按用户要求调整 `weihu`（maintenance-test）。

## 行为

- 高级演示账号的任务工具/目录扩展、参数来源审阅与 OPA `require_approval` 不再进入 GovAgentSec 双人审批队列。OpenClaw 自身的动作确认保持原样。
- 中级 `shenpi`、基础 `jingban` 的双人审批及禁自批规则不变。高级仍可审批其他账号的申请；本人的动作无需构造“自批”。
- 登录、当前任务绑定、主体归属、有效期、OPA 明确 deny、未知策略结果、路径检查、隔离适配器和一次性票据继续校验。
- 仅私有演示身份 worker 在服务端为 maintenance-test 启用该模式；要求经过 JWT 验证的演示身份、clearance=3 和管理角色。前端或工具不能传入开关；默认网关不启用。
- 原始 OPA 命中规则、工具/资源差异与参数来源继续记录，附 `approval_mode=openclaw_native_only`。不伪造审批人、用户同意或审批凭证。
- 此调整覆盖演示业务身份的执行链；独立 MCP 服务若仍采用它自己的静态身份，不会自动继承浏览器高级账号。其独立身份及拒绝规则未被全局关闭。

## 验证与部署

证据目录：`local-validation/admin-native-approval/`。

- 身份、任务契约、权限边界、三级账号测试：50 项通过。
- 实际注册 RPC 与隔离 JWT/OPA worker：8 项通过，包括高级跨范围秘密材料读取无需业务审批。
- 固定宿主审批生命周期：8 项通过；合法动作仍返回原生 `requireApproval`，拒绝/超时仍阻断。
- 现网原生确认卡片实际显示并拒绝测试自身请求：通过。0 Agent 请求、0 工具执行、0 外部请求。
- 无活动任务时重启加载。配置 SHA256 保持 `5497e4fd8840b1d3ba939c74b006612fec53c5795ba4705969a320ae16f60083`；版本保持 2026.7.1-2。没有升级、修改宿主内核或 push。

```powershell
# 仓库根目录
$env:PYTHONUTF8='1'
$env:PYTHONPATH=(Join-Path (Get-Location) 'scripts')
.\modules\agentguard-group2\.venv\Scripts\python.exe -m unittest test_demo_identity test_identity_task_acl test_task_privilege_contract test_identity_boundary test_u25_identity
node scripts/test_u25_identity_rpc.mjs local-validation/admin-native-approval/identity-rpc
node scripts/test_approval_lifecycle.mjs
$env:GOV_APPROVAL_EVIDENCE='local-validation/admin-native-approval'
node scripts/verify_approval_card_live.mjs
```

测试需要正常加载本地 Wasmtime/OPA；在受限进程中可能出现架构检测为空。首次批量测试缺少 scripts 导入路径，设置上述 PYTHONPATH 后 50 项通过。

刷新页面、重新启用演示身份源并登录 `weihu` 后，当前员工卡显示“无需另一人审批，保留 OpenClaw 原生确认”。密码未变。
