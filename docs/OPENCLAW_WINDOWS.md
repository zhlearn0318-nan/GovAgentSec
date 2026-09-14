# 单独部署 OpenClaw（Windows）

GovAgentSec 安装器用于已有 OpenClaw 的原生 Windows 环境。本说明单独安装宿主，之后再安装安全套件。

## 准备环境

安装 Node.js、Git、Python 3.12、Miniconda、Docker Desktop 与 Ollama。Docker Desktop 使用 WSL2 Linux 引擎。真实防护链目前需要 NVIDIA CUDA 显卡；本机验收使用 32 GB 内存、RTX 3070 Ti Laptop 8 GB 显存，PyTorch CUDA 12.4 运行库由套件下载，显卡驱动需兼容此运行库。宿主验收使用 Node.js 24.15.0。

可用 Windows Package Manager 安装依赖：

```powershell
winget install --id OpenJS.NodeJS.LTS --exact
winget install --id Git.Git --exact
winget install --id Python.Python.3.12 --exact
winget install --id Anaconda.Miniconda3 --exact
winget install --id Docker.DockerDesktop --exact
winget install --id Ollama.Ollama --exact
```

完成安装后重新打开 PowerShell，使 PATH 生效。Docker Desktop 首次启动可能要求启用虚拟化、WSL2 或重启 Windows；完成它的引导，确认以下命令成功：

```powershell
docker --context desktop-linux info
```

## 安装与初始化宿主

也可运行根目录的 `Setup-OpenClaw.ps1`，它安装固定版宿主并启动官方交互式引导。

本套件固定集成版本为 `2026.7.1-2`。不要直接换成 `latest`，新版本需重新验证插件 API 和安全策略接口。

```powershell
npm install -g openclaw@2026.7.1-2
openclaw onboard --install-daemon
openclaw --version
openclaw doctor
openclaw gateway status
```

在 OpenClaw 引导中填写你自己的模型提供商和 API Key。套件不提供共享密钥，也不依赖原作者的聊天记录、设备配对或账号。打开 OpenClaw 控制台，先确认普通对话可用。

OpenClaw 官方安装方法和宿主平台说明见 [官方安装文档](https://docs.openclaw.ai/install)。官方文档随版本更新，上述固定版命令用于本套件的兼容目标。

## 再安装 GovAgentSec

将仓库解压到长期保留的目录，按根目录 README 操作。插件通过绝对路径加载，安装后不要移动或删除仓库目录；迁移时应重新运行安装器更新路径。

## Docker 残留 socket 故障

如果出现 `sailor-ingest.sock`、`dockerInference` 或 `engine.sock` 的 `The file cannot be accessed by the system` 错误，可运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Repair-DockerSockets.ps1
```

脚本仅处理当前用户安装的 Docker Desktop，验证临时目录内容为零字节 socket 后，将目录改名备份并重启。它保留镜像、容器、卷与设置。对其他错误会停止，不进行恢复出厂设置。
