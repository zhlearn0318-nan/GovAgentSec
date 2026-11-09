# 当前验证索引

更新：2026-11-10。此页区分当前核对与历史验收，不用过去的 PASS 代表当前所有服务及业务均通过。

## 本轮只读核对

| 项目 | 结果 | 本机证据 |
| --- | --- | --- |
| 本地与 GitHub main | 核对起点同为 86c7054，工作区干净 | GitHub API commits/main 与本地 rev-parse |
| 宿主与插件来源 | OpenClaw 2026.7.1-2；六个项目插件目录均指向本仓库 | local-validation/docs-sync/20261110/runtime-summary.json |
| 网关 / AgentGuard / OPA / Ollama | HTTP 探测均 200，仅代表检查时点 | 同上 |
| 当前页面 | 五入口、总览/设置分区、登录守卫、无手动绑定入口通过 | local-validation/docs-sync/20261110/deployment/report.json |
| 现网配置 | 检查前后哈希一致 | 同上 config_unchanged=true |
| 文档 | 当前说明、源码约定、链接和分类检查 | scripts/check_current_docs.py；本轮报告写入 local-validation/docs-sync/20261110/docs-check.json |

页面检查未登录业务账号、未开启演示源、未发送聊天或外部模型请求，也没有审批或修改系统配置。本轮不是新一轮安全攻击集、完整生产链或模型准确率测试。

## 复跑当前检查

```powershell
python scripts/check_current_docs.py
node scripts/verify_u25_current_workspace.mjs local-validation/docs-sync/recheck
```

页面脚本要求当前网关可访问，且演示源关闭；它不会为通过测试而关闭用户已启用的身份源。若源已启用，报告应按前置条件解释，不覆盖用户状态。完整在线服务检查可执行 Verify.ps1，但不要把健康检查等同完整业务验收。

## 专项证据

| 范围 | 记录 |
| --- | --- |
| Windows 安装器、配置保留、ZIP/EXE | [WINDOWS_INSTALLER_VALIDATION.md](WINDOWS_INSTALLER_VALIDATION.md) |
| 自动会话身份、撤销和隔离短链 | [AUTOMATIC_CHAT_IDENTITY.md](AUTOMATIC_CHAT_IDENTITY.md) |
| 本人确认、最高资料权限、待办/回执分区 | [PERSONAL_CONFIRMATION_AND_DOCUMENT_IDENTITY.md](PERSONAL_CONFIRMATION_AND_DOCUMENT_IDENTITY.md) |
| 固定宿主事件字段 | [TRACE_HOOK_VERIFICATION.md](TRACE_HOOK_VERIFICATION.md) |
| 历史真实短链与多轨迹 | [TRACE_LIVE_SMOKE.md](TRACE_LIVE_SMOKE.md)、[REAL_MULTI_TRACE_EVOLUTION.md](REAL_MULTI_TRACE_EVOLUTION.md) |
| 本地对抗标定与评分公式 | [LOCAL_JUDGE_CALIBRATION.md](LOCAL_JUDGE_CALIBRATION.md)、[TRACE_SCORING_AND_EVOLUTION.md](TRACE_SCORING_AND_EVOLUTION.md) |
| Docker/srt 覆盖 | [SESSION_SANDBOX_DEMO.md](SESSION_SANDBOX_DEMO.md) |
| 早期 Windows 集成验收 | [2026-09-15 历史记录](history/VALIDATION_20260915.md)，不再作为当前状态 |

全新 Windows 完整安装、真实组织 OIDC、生产文件与完整业务产物、持续稳定性尚需独立验收。报告边界统一见 [ACCEPTANCE_BOUNDARIES.md](ACCEPTANCE_BOUNDARIES.md)。
