# 正式版 v1.0 安装器验证

日期：2026-11-10。实际执行环境：当前 Windows 开发机。未在现网重装系统，未更改现网网关配置。

安装入口更新：已使用 Windows .NET Framework 编译器生成 `GovAgentSec-v1.0-Setup.exe` 并实际执行 `--check`，确认内嵌引导脚本 SHA-256 与源文件一致、未启动安装。证据为 `local-validation/releases/v1.0/exe-verification.json`。构建命令：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build_windows_installer.ps1`。EXE 当前未签名；它显示控制台进度并复用既有安装器，未新增第二套部署逻辑。此自检不代表全新机器完整安装通过。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 新配置与固定宿主 schema、已有配置/外部 API 保留、只读 Plan、宿主适配安装及恢复 | PASS，5 项 Node 测试 | `node --test scripts/test_windows_installer.mjs scripts/test_delivery_installer.mjs` |
| SHA-256、ZIP 路径穿越、残缺包拒绝、PowerShell 语法 | PASS，8 项归档检查及脚本解析 | `local-validation/bootstrap-tests/d23ea2e7-7ddf-40e7-8ada-3eed747bf9f6/report.json` |
| 官方 npm 原始 OpenClaw 2026.7.1-2 包适配 | PASS，隔离副本安装；workspace 3、resultGuard 1、deliveryUi 5 处适配 | `local-validation/windows-installer-clean-host/report.json` |
| 配置保留、身份与供应链发布回归 | PASS，7 项 Python 测试 | `python -m unittest discover -s scripts -p test_release.py` |
| 会话沙箱策略、切换与权限检查 | PASS，7 项 Node 测试 | `node --test modules/session-sandbox/test/*.test.mjs` |
| 五个主入口、权限/登录/设置与过程面板回归 | PASS，真实页面 + 合成 RPC 夹具，外部请求 0 | `local-validation/v1-release/ui/report.json` |

浏览器测试在受限进程环境下首次启动失败，随后在正常 Windows 环境复跑通过。该结果是页面交互回归，不冒充真实生产会话或全新机器安装结果。

宿主配置测试前后 SHA-256：`18190172d11927334503b0b35660d5b2c060ae9aeb7a96957d2ee2b67f4d450e`。报告不包含配置内容或真实 API Key。官方 npm 包使用 `npm pack openclaw@2026.7.1-2 --ignore-scripts` 下载后解压到 `.runtime/release-host/clean/package`，没有替换本机宿主。

## 复跑

在已有固定宿主的仓库根目录执行：

```powershell
node --test scripts/test_windows_installer.mjs scripts/test_delivery_installer.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_bootstrap.ps1
python -m unittest discover -s scripts -p test_release.py
node scripts/test_u25_workspace_ia.mjs local-validation/v1-release/ui
```

安装器真实全流程命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Setup-Windows.ps1 -NoBrowser
```

这条命令会部署软件并接入本机配置，应在目标安装机器执行。本轮没有为了测试而重装用户现网；**全新 Windows、winget/WSL/UAC 交互、全部下载和首次真实推理串联仍需干净机器验收**。不同 GPU 容量、网络代理和组织软件安装权限可能造成失败，安装报告会记录失败阶段。

外部模型入口使用固定宿主的原生 `configure --section model`，已核实源码支持 model section；没有用真实外部 Key 进行新增服务商付费调用测试。保留已有外部配置已做字节一致性测试。

发行包通过 `python scripts/build_windows_release.py local-validation/releases/v1.0` 从干净 Git 提交打包；脚本拒绝混入模型、运行日志、状态数据库和本地证据。下载包摘要另见发布页 SHA256SUMS.txt。
