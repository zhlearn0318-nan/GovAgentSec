# 一键启动政安智枢

适用于已安装的本机系统，OpenClaw 固定为 **2026.7.1-2**。

## 使用

在项目根目录双击 **Start-GovAgentSec.cmd**。无需先手动打开 Docker 或运行沙箱配置脚本。请用安装系统的同一个 Windows 账号运行。

命令行等价操作：

```powershell
# 在本分支仓库目录执行
.\Start-GovAgentSec.cmd
```

仅启动和检查、不打开浏览器：

```powershell
.\Start-GovAgentSec.cmd -NoBrowser
```

## 自动执行的步骤

1. 检查固定版本、现有配置和 Node。
2. Docker 模式下运行 `Ensure-DockerReady.ps1` 与 `setup_session_sandbox.mjs`，缺少镜像时按现有固定摘要构建；实际执行一个非 root、无网络、只读根目录的临时容器。
3. 检查或启动 Ollama。
4. 检查或启动 AgentGuard 和 OPA，并确认 `/readyz` 返回就绪。
5. 复用已运行的网关；未运行则启动。沙箱配置有变化时重启网关，等待真正的 `/readyz`，并检查已启用的 Protect Agent。
6. 打开工作区，登录令牌仅由本机入口传递，不打印到控制台或报告。

已有配置选择 srt 时保持 srt，检查其安装状态，不自动切换 Docker。srt 分支不代表进行了完整的运行时 WFP 测试。当前显式自定义 `OPENCLAW_CONFIG_PATH` 或 `OPENCLAW_STATE_DIR` 的环境会停止，避免现有标准用户启动辅助脚本操作错误配置。

## 重复运行与配置

- 已就绪的服务直接复用。无配置变化时不主动重启网关。
- 沙箱配置已满足要求时不重写、不产生重复备份，也不覆盖已有合成测试文件。
- 需要写入沙箱配置时，先备份原配置并核对 SHA-256。外部模型及 API 配置保留。
- 不升级 OpenClaw，不自动清空 Docker 数据或修改注册表。

## 结果与故障

每次运行保存：`local-validation/startup/<时间戳-进程号>/report.json`。

报告记录成功与否、失败阶段、服务检查结果、配置前后哈希和是否调用浏览器打开入口；不保存令牌和对话内容。失败返回退出码 1，双击入口会保留窗口供查看。

| 失败位置 | 检查方式 |
| --- | --- |
| Docker 未就绪 | 在同一 Windows 账号下打开 Docker Desktop，查看其具体错误；脚本不会自动重置数据 |
| 沙箱镜像下载或构建 | 检查网络和 Docker Linux 引擎，再运行入口 |
| AgentGuard | 查看 `modules/agentguard-group2/live-runtime/logs` |
| 网关 | 检查计划任务 `OpenClaw Gateway`；首次安装未完成时先完成安装 |
| Protect Agent | 查看防护服务日志、CUDA 和模型加载情况，脚本不会将未就绪当作成功 |

服务就绪检查不发送业务对话，不消耗外部模型调用；也不等同于所有业务功能的端到端验收。

## 本机验证记录（2026-11-13）

| 场景 | 结果 | 本地报告 |
| --- | --- | --- |
| 已运行系统重复启动，`-NoBrowser` | 退出码0，复用网关，配置哈希不变 | `local-validation/startup/20261113-112107-38316/report.json` |
| 停止网关后通过新脚本启动 | 退出码0，启动计划任务，等待网关及防护就绪 | `local-validation/startup/20261113-112237-48144/report.json` |
| 自定义配置标记的失败路径 | 子进程按预期退出1，在配置读取和修改前停止 | `local-validation/startup/20261113-112339-10444/report.json` |
| 默认双击等价命令，自动打开浏览器 | 退出码0，六阶段通过，配置哈希不变 | `local-validation/startup/20261113-112429-51080/report.json` |

以上成功运行均真实执行了 Docker 临时容器，并检查 AgentGuard、Ollama、网关和 Protect Agent。PowerShell 解析、Node语法检查和改动文件空白检查通过。测试发现 Windows PowerShell 环境下 `Get-FileHash` 可能不可用，启动入口已改用 .NET SHA-256。

这次没有关闭 Docker/重启整台电脑，也没有验证全新安装缺镜像的下载路径或 srt 切换；测试范围为当前已安装环境的重复启动与网关停止后启动。
