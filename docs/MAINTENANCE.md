# 维护与目录

配置变更前使用 [U18 备份与恢复演练](U18_OPENCLAW_CONFIG_RECOVERY_DRILL.md)：默认 dry-run，不修改现网、不分发完整配置。

根目录安装器是此集成发行版的部署入口；模块内原有说明、研究报告与独立演示脚本保留开发背景，不替代根目录部署流程，也不代表本发行版重新验证了历史论文数据。大型研究数据集与旧实验产物不随部署仓库提供。

| 路径 | 用途 |
| --- | --- |
| `Install.cmd` / `Install.ps1` | 已有宿主的安装与复装；`-PrepareOnly` 仅准备及校验 |
| `Setup-OpenClaw.ps1` | 单独安装固定版 OpenClaw 并进入官方引导 |
| `Verify.ps1` | 五个页面、AgentGuard 就绪和已启动模型服务检查 |
| `scripts/Verify-ZhengAn.ps1` | 四层测试汇总；默认离线必跑，`-Live` 加现网只读验证 |
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

## 四层一键验收

在仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-ZhengAn.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Verify-ZhengAn.ps1 -Live
```

入口由 `scripts/verify_zhengan.mjs` 顺序执行固定清单；每项默认超时 180 秒，可用 `-TimeoutSeconds 300` 调整。不会运行安装、升级、git push 或新 Agent 对话。临时目录仅注入子进程环境，不修改机器配置。超时终止该子进程树，继续其他检查并汇总失败。

| 层 | 默认必跑 | `-Live` 追加 |
|---|---|---|
| 行为护栏 | result guard、运行中止、Protect 插件测试、U6 政务工具面三场景（隔离本机 MCP/OPA + 合成宿主） | 固定宿主包装器的本机副本测试；结果为合成输出，不是实时模型推理 |
| 权限闸门 | 受控文档真实本地 OPA/HMAC/Wasm 测试、HTTP 隔离演示测试、身份与面板守卫 | 当前网关三个身份徽章及嵌入执行禁用态 |
| 过程台账 | trace 模块测试、工作区浏览器夹具 | 已有真实 JSONL 的审计中心及抽屉检查 |
| 经验自演进 | trajectory-governance 生命周期、审批关联、真实演进核对逻辑测试 | 现有候选发布闸与身份禁用态，只读，不确认或安装 |
| 文档索引 | 四层表、表内链接、维护入口、汇总器异常测试 | 同左 |

离线指不依赖现网网关或外部模型，并非不需要本机依赖。需 Node.js、AgentGuard `.venv`（含原 OPA/Wasm 依赖）、已安装的 Edge 和固定宿主自带 playwright-core。现网测试另需 OpenClaw 网关可达、现有 token 登录、原插件、可用的真实轨迹和候选记录。缺少程序/网关会明确跳过；脚本启动后发现 OPA、Python 包或证据缺失则按实际失败记录。不会自动下载依赖或生成假数据替代真实证据。

已安装宿主若不是 `2026.7.1-2`，预检失败并停止执行清单。缺少宿主时可运行纯代码测试，依赖宿主的项标为缺依赖。`test_task_workbench.mjs` 依赖历史 requests 文件，因此不纳入默认清单，使用可独立运行的 workspace 与关联模块测试替代。原 `Verify.ps1` 保留其在线服务/模型检查用途。

输出 `local-validation/verify/<timestamp>/report.json`、`report.md` 和逐项 `.log`；部分子脚本的固定位置报告/截图会复制进本次目录，仅收集本轮新产物。计数是脚本检查项数量，不冒充内部断言数。原脚本仍可在自己的 local-validation 目录输出材料。

退出码 **0**：选定检查全部通过；**1**：至少一项失败；**2**：选定项存在缺依赖/内部跳过，未完整验收。未指定 `-Live` 的跳过标为“不在本次范围内”，不影响离线结论。报告为这份有限清单的执行证据，不代表整个系统、生产 OIDC、模型准确率或论文阈值全部通过验收。运行示例见 [升级验收](UPGRADE_ROUND_VALIDATION.md)。

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
