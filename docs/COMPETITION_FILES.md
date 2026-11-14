# 比赛分支文件清单

固定对比基准：`8be8b4517dc728b7b9c999c10a18957b0e9618e0`。

共 76 个差异文件：修改 42 个，新增 34 个。文件仍按现有模块结构组织；功能说明见[比赛版差异](COMPETITION_DEMO.md)。

## 文档与归档规则

| 状态 | 文件 |
| --- | --- |
| 修改 | [.gitignore](../.gitignore) |
| 修改 | [README.md](../README.md) |
| 新增 | [docs/COMPETITION_DEMO.md](../docs/COMPETITION_DEMO.md) |
| 新增 | [docs/COMPETITION_FILES.md](../docs/COMPETITION_FILES.md) |
| 新增 | [docs/COMPETITION_VALIDATION.md](../docs/COMPETITION_VALIDATION.md) |
| 修改 | [docs/CURRENT_SYSTEM.md](../docs/CURRENT_SYSTEM.md) |
| 修改 | [docs/DOCUMENTATION_INDEX.json](../docs/DOCUMENTATION_INDEX.json) |
| 新增 | [docs/DOCUMENT_IMPORT.md](../docs/DOCUMENT_IMPORT.md) |
| 修改 | [docs/FEATURE_MAP.md](../docs/FEATURE_MAP.md) |
| 修改 | [docs/OIDC_USAGE.md](../docs/OIDC_USAGE.md) |
| 新增 | [docs/ONE_CLICK_START.md](../docs/ONE_CLICK_START.md) |
| 修改 | [docs/PRODUCT_DEMO_RUNBOOK.md](../docs/PRODUCT_DEMO_RUNBOOK.md) |
| 修改 | [docs/README.md](../docs/README.md) |
| 修改 | [docs/产品使用逻辑与模块协同.md](../docs/产品使用逻辑与模块协同.md) |

## 启动、部署与回归脚本

| 状态 | 文件 |
| --- | --- |
| 修改 | [Start-GovAgentSec.cmd](../Start-GovAgentSec.cmd) |
| 新增 | [Start-GridDemo.cmd](../Start-GridDemo.cmd) |
| 修改 | [scripts/Start-GovAgentSec.ps1](../scripts/Start-GovAgentSec.ps1) |
| 新增 | [scripts/Start-GridDemo.ps1](../scripts/Start-GridDemo.ps1) |
| 修改 | [scripts/check_current_docs.py](../scripts/check_current_docs.py) |
| 新增 | [scripts/deploy_native_grid.mjs](../scripts/deploy_native_grid.mjs) |
| 新增 | [scripts/prepare_native_grid_config.mjs](../scripts/prepare_native_grid_config.mjs) |
| 修改 | [scripts/setup_session_sandbox.mjs](../scripts/setup_session_sandbox.mjs) |
| 新增 | [scripts/test_business_adapter_startup.py](../scripts/test_business_adapter_startup.py) |
| 新增 | [scripts/test_document_import.py](../scripts/test_document_import.py) |
| 新增 | [scripts/test_document_import_ui.mjs](../scripts/test_document_import_ui.mjs) |
| 新增 | [scripts/test_grid_document_access.py](../scripts/test_grid_document_access.py) |
| 新增 | [scripts/test_grid_input_policy.mjs](../scripts/test_grid_input_policy.mjs) |
| 新增 | [scripts/test_native_grid_host_policy.mjs](../scripts/test_native_grid_host_policy.mjs) |

## 准入审计与检查点

| 状态 | 文件 |
| --- | --- |
| 修改 | [modules/aegis/demo_web/backend/install_policy_audit.py](../modules/aegis/demo_web/backend/install_policy_audit.py) |
| 新增 | [modules/aegis/demo_web/backend/tests/test_audit_cleanup_checkpoint.py](../modules/aegis/demo_web/backend/tests/test_audit_cleanup_checkpoint.py) |
| 修改 | [modules/aegis/demo_web/openclaw_plugin/aegis-admission-ui/admin_pages.js](../modules/aegis/demo_web/openclaw_plugin/aegis-admission-ui/admin_pages.js) |
| 修改 | [modules/aegis/demo_web/openclaw_plugin/aegis-admission-ui/admission_page.js](../modules/aegis/demo_web/openclaw_plugin/aegis-admission-ui/admission_page.js) |
| 修改 | [modules/aegis/demo_web/openclaw_plugin/aegis-admission-ui/security_center_page.js](../modules/aegis/demo_web/openclaw_plugin/aegis-admission-ui/security_center_page.js) |

## 身份、权限与资料

| 状态 | 文件 |
| --- | --- |
| 新增 | [modules/agentguard-group2/demo_documents/grid_curves.csv](../modules/agentguard-group2/demo_documents/grid_curves.csv) |
| 新增 | [modules/agentguard-group2/demo_documents/grid_other.txt](../modules/agentguard-group2/demo_documents/grid_other.txt) |
| 新增 | [modules/agentguard-group2/demo_documents/grid_records.json](../modules/agentguard-group2/demo_documents/grid_records.json) |
| 修改 | [modules/agentguard-group2/enforcement/adapters.py](../modules/agentguard-group2/enforcement/adapters.py) |
| 新增 | [modules/agentguard-group2/enforcement/document_library.py](../modules/agentguard-group2/enforcement/document_library.py) |
| 修改 | [modules/agentguard-group2/enforcement/documents.py](../modules/agentguard-group2/enforcement/documents.py) |
| 修改 | [modules/agentguard-group2/enforcement/gateway.py](../modules/agentguard-group2/enforcement/gateway.py) |
| 修改 | [modules/agentguard-group2/enforcement/task_policy.py](../modules/agentguard-group2/enforcement/task_policy.py) |
| 修改 | [modules/agentguard-group2/identity/chat_acl.py](../modules/agentguard-group2/identity/chat_acl.py) |
| 修改 | [modules/agentguard-group2/identity/demo_provider.py](../modules/agentguard-group2/identity/demo_provider.py) |
| 新增 | [modules/agentguard-group2/identity/document_access.py](../modules/agentguard-group2/identity/document_access.py) |
| 修改 | [modules/agentguard-group2/identity/tool_catalog.py](../modules/agentguard-group2/identity/tool_catalog.py) |
| 修改 | [modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/chat-acl.mjs](../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/chat-acl.mjs) |
| 修改 | [modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs](../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs) |
| 修改 | [modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/index.js](../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/index.js) |
| 修改 | [modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/openclaw.plugin.json](../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/openclaw.plugin.json) |

## 轨迹评测与电网发布

| 状态 | 文件 |
| --- | --- |
| 修改 | [modules/govagentsec-trace/evidence-packs.mjs](../modules/govagentsec-trace/evidence-packs.mjs) |
| 修改 | [modules/govagentsec-trace/evolution.mjs](../modules/govagentsec-trace/evolution.mjs) |
| 新增 | [modules/govagentsec-trace/grid-release.mjs](../modules/govagentsec-trace/grid-release.mjs) |
| 修改 | [modules/govagentsec-trace/local-judges.mjs](../modules/govagentsec-trace/local-judges.mjs) |
| 修改 | [modules/govagentsec-trace/openclaw.plugin.json](../modules/govagentsec-trace/openclaw.plugin.json) |
| 修改 | [modules/govagentsec-trace/register.mjs](../modules/govagentsec-trace/register.mjs) |
| 修改 | [modules/govagentsec-trace/store.mjs](../modules/govagentsec-trace/store.mjs) |
| 修改 | [modules/govagentsec-trace/test/core.test.mjs](../modules/govagentsec-trace/test/core.test.mjs) |
| 新增 | [modules/govagentsec-trace/test/grid-release.test.mjs](../modules/govagentsec-trace/test/grid-release.test.mjs) |
| 修改 | [modules/govagentsec-trace/test/local-judges.test.mjs](../modules/govagentsec-trace/test/local-judges.test.mjs) |
| 修改 | [modules/govagentsec-trace/view.mjs](../modules/govagentsec-trace/view.mjs) |

## 工作区与资料界面

| 状态 | 文件 |
| --- | --- |
| 修改 | [modules/govagentsec-ui/demo-identity.mjs](../modules/govagentsec-ui/demo-identity.mjs) |
| 修改 | [modules/govagentsec-ui/identity-session.mjs](../modules/govagentsec-ui/identity-session.mjs) |
| 修改 | [modules/govagentsec-ui/library-summary.mjs](../modules/govagentsec-ui/library-summary.mjs) |
| 修改 | [modules/govagentsec-ui/workspace.mjs](../modules/govagentsec-ui/workspace.mjs) |

## 原生电网工具、分析与样本

| 状态 | 文件 |
| --- | --- |
| 新增 | [modules/grid-demo/README.md](../modules/grid-demo/README.md) |
| 新增 | [modules/grid-demo/analysis.py](../modules/grid-demo/analysis.py) |
| 新增 | [modules/grid-demo/data/curves.csv](../modules/grid-demo/data/curves.csv) |
| 新增 | [modules/grid-demo/data/manifest.json](../modules/grid-demo/data/manifest.json) |
| 新增 | [modules/grid-demo/data/records.json](../modules/grid-demo/data/records.json) |
| 新增 | [modules/grid-demo/prepare_data.py](../modules/grid-demo/prepare_data.py) |
| 新增 | [modules/grid-native/native.test.mjs](../modules/grid-native/native.test.mjs) |
| 新增 | [modules/grid-native/register.mjs](../modules/grid-native/register.mjs) |
| 新增 | [modules/grid-native/skills/grid-anomaly-diagnosis/SKILL.md](../modules/grid-native/skills/grid-anomaly-diagnosis/SKILL.md) |
| 新增 | [modules/grid-native/view.mjs](../modules/grid-native/view.mjs) |

## 电网输入防护

| 状态 | 文件 |
| --- | --- |
| 新增 | [modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/grid-input-policy.mjs](../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/grid-input-policy.mjs) |
| 修改 | [modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/register.mjs](../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/register.mjs) |

## 本地保留、未上传

以下19个脚本保留原路径并由精确忽略规则排除。它们绑定本机历史、录制版本或实验现场，不属于克隆后启动系统的依赖。

| 文件 | 用途 |
| --- | --- |
| `scripts/check_aegis_grid_live_ui.mjs` | 绑定现场记录的UI/会话检查 |
| `scripts/clean_aegis_grid_history.py` | 一次性历史清理 |
| `scripts/clean_identity_business_history.py` | 一次性历史清理 |
| `scripts/clean_native_grid_business_residuals.mjs` | 一次性历史清理 |
| `scripts/clean_native_grid_host_history.py` | 一次性历史清理 |
| `scripts/clean_native_grid_remaining.mjs` | 一次性历史清理 |
| `scripts/clean_native_grid_scoped.mjs` | 一次性历史清理 |
| `scripts/experiment_u7_ablation.py` | U7实验过程 |
| `scripts/grid_video_audit.mjs` | 本机录屏及剪辑 |
| `scripts/native_grid_live.mjs` | 绑定现场记录的UI/会话检查 |
| `scripts/native_grid_ui_authorization.mjs` | 绑定现场记录的UI/会话检查 |
| `scripts/native_grid_ui_check.mjs` | 绑定现场记录的UI/会话检查 |
| `scripts/record_grid_video.mjs` | 本机录屏及剪辑 |
| `scripts/render_grid_login_hold.py` | 本机录屏及剪辑 |
| `scripts/render_grid_readable.py` | 本机录屏及剪辑 |
| `scripts/render_grid_short.py` | 本机录屏及剪辑 |
| `scripts/render_grid_video.py` | 本机录屏及剪辑 |
| `scripts/test_aegis_cleanup_ui.mjs` | 绑定现场记录的UI/会话检查 |
| `scripts/test_native_grid_library_ui.mjs` | 绑定现场记录的UI/会话检查 |

模型、凭据、运行库、数据库、会话轨迹、报告与仓库外展示材料也不上传。修改前副本及原始清单存于本机 `local-validation/competition-branch-20261114/before/` 和 `before-manifest.json`。
