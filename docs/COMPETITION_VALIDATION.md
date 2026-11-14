# 比赛电网演示版验证

日期：2026-11-14。对比基准 `origin/main@8be8b45`。验证使用隔离临时目录，不清理现有业务数据，不发起付费模型对话，也不重新发布现有 Skill。

## 本轮结果

| 检查 | 结果 | 覆盖范围 |
| --- | --- | --- |
| Node 核心回归 | 128/128通过 | 原生电网工具与报告、轨迹、本地评审、候选发布、轨迹治理、输入规则、身份会话 |
| Python 业务回归 | 16/16通过 | 文件申请/审批、授权过期、任务范围、受管读取、防重放、资料导入删除、启动数据持久性 |
| Aegis 检查点 | 2/2通过 | 保留链、内容篡改、缺失事件、检查点范围和后续追加 |
| 固定宿主工具策略 | 通过 | 两项电网工具有效，额外 exec 工具仍不可调用 |
| Windows 安装引导回归 | 通过 | checksum解析、二进制响应、路径穿越、不完整安装包及PowerShell语法 |
| 资料库浏览器回归 | 通过 | 私有 worker、真实 OPA、管理员导入删除、账号切换、低权限拒绝、表单轮询稳定性 |
| 离线分析 | 通过 | 120条记录、3个缺失值，四类结果各1个计量点；两处受管样本副本字节一致 |
| 文档、语法与提交检查 | 通过 | 25份文档登记、26个文档链接与契约检查；17个Python、31个JS、6个JSON、2个PowerShell文件解析；差异空白检查 |
| Protect Agent 扩展回归 | 38/41通过 | 另3项在原始 main 快照中同样失败，详见下方 |

Python 首次在执行沙箱内运行时，OPA 出现 Windows DLL 重定位错误（WinError 623）。相同测试在正常执行环境中全部通过，没有用 mock 替换策略求值。

## 已有失败与适用范围

把 `8be8b45` 导出到独立目录后执行同一组41项 Protect Agent 测试，得到同样的3项失败：

| 测试 | 原因 |
| --- | --- |
| `ui-routes.test.mjs` 的状态页快照检查 | 旧测试签发 capability 时未提供现有接口要求的业务身份，抛出 `BUSINESS_IDENTITY_REQUIRED` |
| `ui-routes.test.mjs` 的只读 HEAD 检查 | 同上 |
| `test_runtime_stop.mjs` 的审批超时检查 | 旧断言期望 `approval_pending`，当前事件为 `approval_requested` |

本轮未为归档任务改动上述通用测试和行为；不能将完整仓库测试描述为全部通过。其他仍引用 `emergency_plan` 等旧台风登记资料的历史测试不代表电网分支的现行资料契约；比赛版业务回归以本页命令为准。

## 复跑命令

在仓库根目录执行；运行依赖由安装脚本准备。Python 测试需要真实 OPA 和 AgentGuard 依赖，Aegis 检查点测试另需 pytest。

```powershell
node --test modules/grid-native/native.test.mjs modules/govagentsec-trace/test/*.test.mjs modules/trajectory-governance/test/*.test.mjs scripts/test_grid_input_policy.mjs scripts/test_u22_identity_session.mjs

$env:PYTHONUTF8='1'
$env:PYTHONPATH="$PWD/scripts"
.\modules\agentguard-group2\.venv\Scripts\python.exe -m unittest -v test_grid_document_access test_document_import test_business_adapter_startup

$env:PYTHONPATH="$PWD/modules/aegis/demo_web"
python -m pytest modules/aegis/demo_web/backend/tests/test_audit_cleanup_checkpoint.py -q

node scripts/test_native_grid_host_policy.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_bootstrap.ps1
python scripts/check_current_docs.py
git diff --check
```

仅验证离线分析、无需宿主：

```powershell
python modules/grid-demo/analysis.py --output-dir local-validation/grid-analysis
```

资料库浏览器测试使用私有身份 worker、临时资料库和本机 Edge，不操作现有演示资料：`node scripts/test_document_import_ui.mjs`。完整现场链按[操作脚本](../modules/grid-demo/README.md)人工复跑，会新增授权、会话、候选和发布记录，本轮未执行。

## 证据存放与未覆盖项

本机日志和修改前副本在 `local-validation/competition-branch-20261114/`，原始配置、令牌和运行记录不上传。待提交文件检查未发现私钥块、常见API令牌格式、运行数据库或大体积媒体文件。公开结果以本页摘要和可复跑测试为依据。

未重新验收空白 Windows 全新安装、Docker 冷启动下载、srt 完整路径及实时模型全链。新机器需要自行准备会话模型和真实防护模型，并从基线 Skill 生成自己的真实轨迹。
