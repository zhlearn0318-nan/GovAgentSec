# Windows 一键部署（正式版 v1.0）

宿主固定 OpenClaw **2026.7.1-2**。安装入口把宿主、依赖、真实防护模型、AgentGuard、准入、轨迹插件、Docker 会话沙箱及桌面启动入口串联起来。

## 安装

1. 从 [v1.0 发布页](https://github.com/zhlearn0318-nan/GovAgentSec/releases/tag/v1.0) 下载 `GovAgentSec-v1.0-windows-x64.zip` 和 `SHA256SUMS.txt`，用 `Get-FileHash 文件名 -Algorithm SHA256` 核对压缩包摘要。
2. 解压到长期保留的目录，例如 `C:\GovAgentSec`。双击 **Setup-Windows.cmd**。
3. 按 Windows 提示完成权限授权、Docker Desktop 首次设置或必要重启；遇到这些前置条件未完成，安装会报错停止。完成后再次运行同一个入口。
4. 安装成功自动打开工作区，桌面生成 **GovAgentSec v1.0** 快捷方式。以后使用它或 `Start-GovAgentSec.cmd` 启动。

也可以下载发布页的 `Bootstrap-Windows.ps1`，检查脚本及摘要后运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Bootstrap-Windows.ps1
```

引导器从固定 `v1.0` 下载源码包，核对 SHA-256、拒绝 ZIP 路径穿越和符号链接条目，再安装到 `%LOCALAPPDATA%\GovAgentSec\v1.0`。可用 `-InstallDirectory C:\GovAgentSec` 指定不存在的目录。SHA-256 用于下载完整性检查，不是独立代码签名。

## 环境要求与安装动作

| 项目 | 行为 |
| --- | --- |
| 平台 | Windows x64、Windows PowerShell 5.1、winget；使用当前 Windows 用户安装 |
| GPU | 必须有兼容 CUDA 的 NVIDIA 显卡及驱动；最终以真实模型推理检查为准，不提供假模型或 CPU 降级冒充成功 |
| 宿主 | 缺失时安装 OpenClaw 2026.7.1-2；已有其他版本停止，不自动升级或降级 |
| Node | 缺失时使用清单固定的 24.15.0；已有版本检查宿主兼容范围 |
| 依赖 | 自动补齐 Git、Python 3.12、Miniconda、Docker Desktop、Ollama；首次下载量较大，需预留数十 GB 空间 |
| Docker | 需要可用的 Linux 容器引擎；首次 WSL2、虚拟化、许可确认和重启不能由脚本替用户决定 |
| 本地模型 | 下载 qwen2.5:7b-instruct-q4_K_M（默认会话/准入）和 qwen3:8b（本地轨迹评审），以及锁定的防护权重 |
| 服务 | 注册当前用户的网关和 AgentGuard 启动任务；系统权限不足时明确失败，按提示授权后复跑 |

新安装只监听 loopback，生成随机网关令牌，默认使用本地 Ollama。已有模型、外部 API 凭据及无关配置保留；受管插件、准入策略和会话沙箱会按本发行版配置。已有自定义 profile 或非标准 npm 安装位置请手动部署，脚本不会猜测覆盖。

## 外部 API 与模型选择

**保留外部 API 接入，不强制只用本地模型。** 双击 **Configure-Model.cmd**，在 OpenClaw 原生模型向导中配置提供商、兼容接口地址、API Key 和默认模型；已有模型也可在会话界面切换。向导调用已在固定版本源码中核实的 `openclaw configure --section model`，修改前备份配置并记录 SHA-256，之后重启网关。

用户在本机向导输入真实 Key，不要把它写进仓库、安装指令、截图或公开报告。配置外部会话模型后，正常会话请求会发往用户选定的模型服务；**安全轨迹评审始终保持本地 Ollama/启发式，不把采集的轨迹发给外部评审 API**。模型是否支持思考强度、速度档位取决于对应提供商。U20 usage wrapper 默认不开启。

## 检查与复跑

```powershell
# 仅显示计划，不安装、不改配置
powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-Windows.ps1 -Plan
# 正式安装；适合 AI Agent 或终端调用
powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-Windows.ps1 -NoBrowser
# 安装后检查
powershell -NoProfile -ExecutionPolicy Bypass -File .\Verify.ps1
```

安装报告：`local-validation/windows-install/<时间戳>/report.json`，包含当前阶段、完成步骤、配置前后摘要、备份路径及 passed/failed。退出码 0 才表示成功。失败不会静默跳过真实防护检查。重新运行会复用已下载并校验的权重及镜像，不自动清理用户资料。

默认工作区为 `http://127.0.0.1:18789/plugins/govagentsec/welcome`；使用桌面启动入口自动读取本机网关凭据。业务身份源默认关闭，需在防护设置启用演示身份源；它不是生产组织 OIDC。演示账号和权限见[身份与本人确认说明](PERSONAL_CONFIRMATION_AND_DOCUMENT_IDENTITY.md)。

常见失败：显卡/显存不足、winget 未安装、Docker 首次设置未完成、代理或模型下载失败、端口冲突、已有宿主版本不匹配、计划任务权限不足。修复报告中失败阶段后复跑，不要关掉防护以换取绿色结果。

## 备份、兼容层与边界

现有安装链会给固定宿主安装工作区 UI 与工具结果保护适配层；不是原样 OpenClaw。先备份宿主文件、配置再接入，结构不匹配即停止。`Install.ps1` 的应用阶段失败时尝试恢复配置、UI 和原 AgentGuard；软件依赖、模型下载及新建服务不会全部自动卸载。配置备份位于 `%USERPROFILE%\.openclaw\govagentsec\`，含凭据，禁止上传。

安装后不要移动目录。不要在另一 Windows 用户的身份下运行安装来替当前用户配置。切换 srt 是可选维护动作，默认仍为 Docker。安装器的真实测试范围见[安装验证记录](WINDOWS_INSTALLER_VALIDATION.md)，本版尚无全新 Windows 虚拟机从零到完成的端到端验证记录。
