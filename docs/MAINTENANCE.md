# 维护与目录

根目录安装器是此集成发行版的部署入口；模块内原有说明、研究报告与独立演示脚本保留开发背景，不替代根目录部署流程，也不代表本发行版重新验证了历史论文数据。大型研究数据集与旧实验产物不随部署仓库提供。

| 路径 | 用途 |
| --- | --- |
| `Install.cmd` / `Install.ps1` | 已有宿主的安装与复装；`-PrepareOnly` 仅准备及校验 |
| `Setup-OpenClaw.ps1` | 单独安装固定版 OpenClaw 并进入官方引导 |
| `Verify.ps1` | 五个页面、AgentGuard 就绪和已启动模型服务检查 |
| `scripts/Ensure-DockerReady.ps1` | 检查或启动 Docker Linux 引擎；每次探测有超时 |
| `Start-Docker.cmd` | 可双击的启动入口；启动持续失败且匹配已知 socket 错误时执行受限恢复 |
| `scripts/build_config.py` | 生成保留无关配置的安装批次 |
| `scripts/verify_admission.py` | 真实联合准入进程的四个固定样例 |
| `scripts/verify_real_models.py` | 独立 GPU 模型冒烟；已有 GPU 服务运行时优先用 Verify.ps1 |
| `models.lock.json` | 官方模型提交、文件校验和与 TrustRAG 来源 |
| `requirements-protect-lock.txt` | 已验证防护环境的完整包版本 |
| `modules/aegis/bootstrap_runtimes.ps1` | 两个固定 Cisco 扫描器源码与隔离环境 |
| `modules/agentguard-group2/live-runtime` | 本机策略状态、票据密钥、日志与进程记录，不提交 |
| `hooks/supply-chain-security` | 网关启动标记；实际安装检测由联合准入策略完成 |

更换仓库目录后重新运行安装器。更新 OpenClaw 会替换它的控制台文件，因此更新后需要重新安装入口，并重新验证兼容性。当前发行版固定宿主版本；不要把新版本宿主直接视为已兼容。

服务维护（在仓库根目录）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\modules\agentguard-group2\stop_agentguard_live.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\modules\agentguard-group2\start_agentguard_live.ps1
openclaw gateway restart
powershell -NoProfile -ExecutionPolicy Bypass -File .\Verify.ps1
```

凭据由目标机器重新生成，历史业务数据从空开始。备份位于 OpenClaw 状态目录下的 `govagentsec`；不要把此目录、模型目录、运行日志或宿主配置加入 Git。

Docker 单独检查与恢复（使用安装 Docker Desktop 的 Windows 账户，在仓库根目录运行）：

2026-10-11 本机将 Docker Desktop 4.90.0 升级到官方 4.94.0（Engine 29.8.2）后，原生连续重启三次均通过，每次容器安全检查 40/40，Python、Node、Shell 沙箱均成功；正常退出、备份后重新启动也通过。正常使用可直接启动 Docker Desktop；`Start-Docker.cmd` 和 socket 恢复脚本保留为备用。该结果适用于本机已完成的启停验证，不等同于所有 Windows 环境均已修复。备份时务必按当前 `settings-store.json` 中的实际数据位置取文件，不能只按历史目录名推断。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Ensure-DockerReady.ps1
# 仅当出现 The file cannot be accessed by the system 的 socket 启动错误时使用：
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Ensure-DockerReady.ps1 -RepairSockets
# 实际执行 Python、Node、Shell 沙箱，使用新的目录保留每次证据：
.\modules\aegis\.runtime_skill\python.exe .\scripts\verify_sandbox_v2.py --output .\local-validation\sandbox-check-new
```

恢复脚本先等待正常启动；引擎已健康时直接返回。只有错误匹配且临时目录全部为零字节 socket 重解析点时才备份目录并重启 Docker。该操作会中断 Docker Desktop，请在容器工作完成后使用；不会删除镜像、卷或虚拟磁盘。路径或内容检查失败时停止，不应使用清空 Docker 数据的方法绕过检查。受限执行账户可能看不到当前用户的 Docker 安装，此时应在宿主 PowerShell 验证，不能仅凭受限环境的 `CLI_NOT_FOUND` 判断未安装。

许可证：新增整合代码与自有模块 Apache-2.0；AgentGuard 保留 MIT；第三方条款见根目录 THIRD_PARTY_NOTICES.md。
