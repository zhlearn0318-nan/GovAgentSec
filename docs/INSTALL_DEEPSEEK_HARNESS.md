# DeepSeek Harness 安装说明

GovAgentSec 适配器版本为 `1.0.0-alpha.1`。安装目标为 DeepSeek Harness 的 `web` profile。

## 安装前

- 使用 Windows 10/11 x64 和支持 CUDA 的 NVIDIA 显卡。运行 `nvidia-smi` 确认驱动能识别显卡。内存至少 8 GiB，已验收的配置使用 8 GiB 显存。
- 安装 [DeepSeek Harness `0.2.2-alpha.2`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2)。使用 Node 版 CLI 时需 Node.js `24.9.0` 或更新版本，并确认 `dsh --version` 显示所需版本。源码版请先完成构建并确认能启动 Web。
- 安装盘建议预留至少 24 GiB，包含运行环境下载、合并、解包和模型缓存。安装需要访问 GitHub 和 [模型锁定清单](../models.lock.json)中的上游地址。安装前退出 Harness。
- 保留已配置的 `DSH_HOME`。未配置时，安装器会查找已有安装记录和默认用户目录。

## 一键安装

1. 从[预发布页](https://github.com/zhlearn0318-nan/GovAgentSec/releases/tag/deepseek-harness-v1.0.0-alpha.1)下载 [GovAgentSec-DeepSeekHarness-v1.0-Setup.exe](https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/deepseek-harness-v1.0.0-alpha.1/GovAgentSec-DeepSeekHarness-v1.0-Setup.exe)。安装器未签名，可先按下方步骤核对 SHA-256。
2. 双击 EXE，选择可长期保留的插件目录。默认是 `%LOCALAPPDATA%\GovAgentSec`。
3. 点击「安装」。安装器下载并校验两份运行环境分卷，自动准备 Python 和模型，然后注册插件。若下载中断，保留相同的安装目录再试，安装器会复用已通过校验的文件或续传分卷。
4. 界面显示安装完成后，重新启动 Harness。

## 手动下载与校验

将 EXE、[分卷 01](https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/deepseek-harness-v1.0.0-alpha.1/govagentsec-python-1.0.0-alpha.1-cp311-win_amd64.zip.part01)、[分卷 02](https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/deepseek-harness-v1.0.0-alpha.1/govagentsec-python-1.0.0-alpha.1-cp311-win_amd64.zip.part02) 和 [SHA256SUMS.txt](https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/deepseek-harness-v1.0.0-alpha.1/SHA256SUMS.txt) 保存在同一目录。打开该目录下的 PowerShell，运行以下命令核对完整下载。分卷是原始字节切片，安装器会自动合并。

```powershell
& {
    $ErrorActionPreference = 'Stop'
    Get-Content -LiteralPath .\SHA256SUMS.txt | ForEach-Object {
        $expected, $file = $_ -split ' +', 2
        $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
        if ($actual -ne $expected) { throw "SHA-256 校验失败：$file" }
        Write-Output "OK $file"
    }
    .\GovAgentSec-DeepSeekHarness-v1.0-Setup.exe
}
```

两个本地分卷都通过校验时，安装器直接使用它们。缺失的防护模型仍按锁定清单下载。

## 启动与验证

1. 按原方式启动 Harness。命令行安装可运行 `dsh web`。
2. 打开聊天页的「安全工作区」，在「防护设置」或「防护过程」中确认本地检测服务就绪。
3. 用已配置的模型发送一条不含敏感信息的普通消息，确认能收到回复，且「防护过程」有当次记录。模型访问失败时在 Harness 自己的设置中检查提供商和 API。
4. 需要更详细的原生管线验证时，参照[构建与高级配置](HARNESS_BUNDLE_INSTALLATION.md#安装后验证与卸载)。

## 修复与卸载

- **找不到 Harness**。确认 CLI 版本和 PATH，使用与安装 Harness 相同的 Windows 用户。源码构建在自定义目录时，可按[高级配置](HARNESS_BUNDLE_INSTALLATION.md)传入 JS 入口。
- **CUDA 或模型检测失败**。检查 `nvidia-smi`、显存、可用磁盘空间和上游网络。安装诊断在所选目录的 `setup-logs` 下。
- **修复**。退出 Harness 后，用原安装器和同一目录重新安装。核对启动后的防护状态。
- **卸载**。退出 Harness 后运行 `.\GovAgentSec-DeepSeekHarness-v1.0-Setup.exe --uninstall`，在窗口中选择原安装目录。卸载移除受管插件配置和服务令牌，保留模型缓存和审计记录。

预览版使用本地检测模型和 Harness 原生工具审批。组织 OIDC 和 AgentGuard 业务工具需要单独配置。已验收范围见[开发验收记录](HARNESS_BUNDLE_VALIDATION.md)。
