# 维护与目录

根目录安装器是此集成发行版的部署入口；模块内原有说明、研究报告与独立演示脚本保留开发背景，不替代根目录部署流程，也不代表本发行版重新验证了历史论文数据。大型研究数据集与旧实验产物不随部署仓库提供。

| 路径 | 用途 |
| --- | --- |
| `Install.cmd` / `Install.ps1` | 已有宿主的安装与复装；`-PrepareOnly` 仅准备及校验 |
| `Setup-OpenClaw.ps1` | 单独安装固定版 OpenClaw 并进入官方引导 |
| `Verify.ps1` | 五个页面、AgentGuard 就绪和已启动模型服务检查 |
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

许可证：新增整合代码与自有模块 Apache-2.0；AgentGuard 保留 MIT；第三方条款见根目录 THIRD_PARTY_NOTICES.md。
