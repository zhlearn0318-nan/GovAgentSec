# 政安智枢 · DeepSeek Harness

**适配器 `1.0.0-alpha.1` · DeepSeek Harness `0.2.2-alpha.2` · Windows x64**

GovAgentSec 为 DeepSeek Harness 提供本地输入和输出检查、工具调用审批、Skill 静态扫描和轨迹审计。安装后，在 Harness 聊天页打开「安全工作区」查看防护状态与记录。

[安装说明](docs/INSTALL_DEEPSEEK_HARNESS.md) · [开发验收记录](docs/HARNESS_BUNDLE_VALIDATION.md) · [OpenClaw 版本](https://github.com/zhlearn0318-nan/GovAgentSec/tree/main)

## 下载安装

安装前请准备 [DeepSeek Harness `0.2.2-alpha.2`](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2)、支持 CUDA 的 NVIDIA 显卡及驱动，并关闭正在运行的 Harness。首次安装需要联网。建议安装盘预留至少 24 GiB。

### 1. Windows 联网安装包（推荐）

下载 [GovAgentSec-DeepSeekHarness-v1.0-Online-Setup.exe（574 KiB）](https://raw.githubusercontent.com/zhlearn0318-nan/GovAgentSec/DeepseekHarness_release/GovAgentSec-DeepSeekHarness-v1.0-Online-Setup.exe)，双击打开「GovAgentSec · DeepSeek Harness 安装」窗口，选择插件目录后点击「安装」。安装器自动下载并校验缺失的 Python 运行环境和防护模型，再将插件注册到 Harness 的 `web` profile。首次安装约需下载 3.15 GiB 的 Python 运行环境，另需下载本机缺少的模型。

### 2. 使用 Agent 部署

把下面这段指令发给能操作本机 Windows 的 Agent。

```text
请按 https://github.com/zhlearn0318-nan/GovAgentSec/blob/DeepseekHarness_release/docs/INSTALL_DEEPSEEK_HARNESS_WITH_AGENT.md 安装 GovAgentSec 的 DeepSeek Harness 预览版。沿用已有的模型、API 和登录配置。安装完成后重启 Harness，验证安全工作区与防护状态，并报告结果。
```

### 3. 手动下载并校验

从[预发布页](https://github.com/zhlearn0318-nan/GovAgentSec/releases/tag/deepseek-harness-v1.0.0-alpha.1)下载 EXE、[运行环境分卷 01](https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/deepseek-harness-v1.0.0-alpha.1/govagentsec-python-1.0.0-alpha.1-cp311-win_amd64.zip.part01)、[运行环境分卷 02](https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/deepseek-harness-v1.0.0-alpha.1/govagentsec-python-1.0.0-alpha.1-cp311-win_amd64.zip.part02) 和 [SHA256SUMS.txt](https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/deepseek-harness-v1.0.0-alpha.1/SHA256SUMS.txt)。将文件放在同一目录，按[手动校验步骤](docs/INSTALL_DEEPSEEK_HARNESS.md#手动下载与校验)核对后双击 EXE。安装器会读取本地分卷，校验并合并。缺失模型仍从锁定的上游下载。

### 安装后启动

按原来的方式启动 Harness。CLI 安装可运行 `dsh web`。进入「安全工作区 → 防护设置」，查看本地防护组件的就绪状态，再发一条普通测试消息验证「防护过程」有新记录。模型和 API 仍由 Harness 自身设置管理。

这是开发预览版。EXE 未做代码签名，Windows 可能显示未知发布者提示。验收覆盖本机隔离环境，干净 Windows 和发行版宿主的端到端安装仍待验证。

[排障、修复和卸载](docs/INSTALL_DEEPSEEK_HARNESS.md#修复与卸载) · [构建与高级配置](docs/HARNESS_BUNDLE_INSTALLATION.md) · [第三方声明](THIRD_PARTY_NOTICES.md)
