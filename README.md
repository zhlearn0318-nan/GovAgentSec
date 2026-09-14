# 政安智枢 GovAgentSec

将输入防护、运行时安全、供应链准入和技能安全测评整合到 OpenClaw 的一个控制台入口。

Windows 集成发行版。已在原生 Windows、OpenClaw `2026.7.1-2` 上完成整套安装、真实模型推理、联合准入与五个控制台页面验收，详见 [验收记录](docs/VALIDATION.md)。

| 模块 | 功能 | 源码 |
| --- | --- | --- |
| Aegis | Skill / 插件安装前审计、Docker 隔离扫描、报告、规则和 MCP 准入 | `modules/aegis` |
| AgentGuard | 工具调用策略、审批、一次性执行票据与审计 | `modules/agentguard-group2` |
| 输入防护链 | PIGuard、Qwen3Guard、TrustRAG 检测与 OpenClaw 生命周期保护 | `modules/protect-agent-group1` |
| 安全测评与审计 | Skill 文档、权限和代码行为检查 | `modules/supply-chain-group4` |

## 安装目标

Windows、已有 OpenClaw `2026.7.1-2`、Python 3.12、Miniconda、Git、Docker Desktop Linux 引擎、Ollama 与 NVIDIA CUDA 显卡。验收硬件为 32 GB 内存、RTX 3070 Ti Laptop 8 GB 显存；这不是最低配置承诺。安装包含多个隔离 Python 环境、约 3 GB 防护权重、4.7 GB Ollama 模型及 CUDA 安装缓存，请预留充足磁盘空间。宿主模型提供商由用户自行配置。

尚未安装 OpenClaw？先按 [独立 Windows 部署说明](docs/OPENCLAW_WINDOWS.md) 操作。

## 一键安装

下载本仓库 ZIP 并解压到长期保留的目录，或执行：

```powershell
git clone https://github.com/zhlearn0318-nan/GovAgentSec.git
cd GovAgentSec
.\Install.cmd
```

也可直接双击 `Install.cmd`。安装器检查并通过 winget 补齐缺失的应用，下载固定版本 Python 依赖、官方模型权重、OPA 和沙箱镜像，完成真实推理与准入检查后接入 OpenClaw。首次 Docker/WSL2 初始化、Windows 权限提示或系统重启需按系统提示完成，再重新运行安装器；模型提供商凭据需自行填写。

权重保存在本地 `models/`，不放进 Git 仓库。下载支持重试及权重断点续传；复装复用校验通过的文件和已有固定摘要镜像。

也可以先生成配置供检查：

```powershell
.\Install.ps1 -PrepareOnly
```

安装器保留无关插件、MCP 和模型配置，在 OpenClaw 状态目录的 `govagentsec/` 下备份配置与控制台入口。发现不属于 Aegis 的现有安装策略时停止。它注册当前用户登录时启动的 AgentGuard 任务，防护服务由网关管理；安装后不要移动仓库目录。安装完成后刷新 OpenClaw 控制台，选择“政安智枢 GovAgentSec”。也可直接打开 `http://127.0.0.1:18789/plugins/govagentsec/panel`（若修改了网关端口，请替换端口）。

```powershell
.\Verify.ps1
```

首次启动会等待模型预热。安装失败会尝试恢复配置、控制台入口和原 AgentGuard 服务，报错中给出备份位置；修复原因后重新运行。详细组件结构与维护入口见 [维护说明](docs/MAINTENANCE.md)。

## 官方模型来源

具体提交和权重 SHA-256 记录在 `models.lock.json`：

- [PIGuard](https://huggingface.co/leolee99/PIGuard)
- [Qwen3Guard-Gen-0.6B](https://huggingface.co/Qwen/Qwen3Guard-Gen-0.6B)
- [SimCSE](https://huggingface.co/princeton-nlp/sup-simcse-bert-base-uncased)
- [TrustRAG](https://github.com/HuichiZhou/TrustRAG)

TrustRAG 当前接入官方第一阶段聚类与 n-gram 过滤，不代表论文中全部可选流程。模型冒烟测试仅验证真实推理与接口工作，不代表安全检测准确率。

## 数据与配置

不分发作者的密钥、令牌、聊天记录、上传文件、审计数据库或已安装 Skill。新部署的历史记录从空开始。当前 AgentGuard 集成使用本机回环地址和演示身份，面向本机操作；多用户远程部署需要单独配置身份认证。

界面内嵌使用 OpenClaw 的 `trusted` 模式，加载这套本地插件页面。动态代码扫描仍使用禁止联网、只读根文件系统、非特权用户的 Docker 容器。
