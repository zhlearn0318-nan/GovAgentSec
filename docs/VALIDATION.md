# Windows 发行验收

2026-09-15，在独立整理的发行目录安装到已有 OpenClaw，并实际重启网关验收。环境：原生 Windows、OpenClaw 2026.7.1-2、Node.js 24.15.0、32 GB 内存、RTX 3070 Ti Laptop 8 GB 显存、Docker Linux 引擎 29.7.2。

| 检查 | 结果 |
| --- | --- |
| 输入防护 Python 测试 | 198 passed |
| 输入防护插件测试 | 27 passed |
| Aegis 页面与上传测试 | 19 passed |
| v2 沙箱安全配置测试 | 8 passed |
| 发布配置保留与 Group4 提示注入回归 | 5 passed |
| Docker 真实五场景 | 5 / 5，无容器残留 |
| v2 Python / Node / Shell 正常执行 | 全部 ALLOW |
| Aegis 固定 Skill／插件扫描及审计链 | 通过，4 条审计链有效 |
| 实际 Aegis＋Group4 联合策略进程 | 正常 Skill／插件 allow，注入 Skill／高风险插件 block |
| AgentGuard／OPA 与 MCP 只读调用 | ready，协议调用成功 |
| AgentGuard 递归停止与重启 | 两端口均释放，重启 ready |
| 完整安装与网关重启 | 成功，五个控制台页面 HTTP 200 |
| 已安装防护服务 | 正常输入 ALLOW，注入输入 BLOCK |
| 登录自启动任务 | 当前用户、Limited 权限注册成功 |
| 完整依赖复装与 PrepareOnly | 通过，11 项配置 dry-run 有效 |
| PIGuard、Qwen3Guard、SimCSE 官方权重 | 固定提交与 SHA-256 校验通过 |
| 三个真实防护模型 | GPU 推理通过 |
| 本地 Ollama 语义审查 | 在防护服务运行时返回 malicious 及对应特征码 |

PIGuard 冒烟样例分数：正常文本 0.000023838，直接注入文本 0.999944925；Qwen3Guard 对正常问题返回 Safe；TrustRAG 四段材料保留掩码为 `[true, true, true, false]`。这些是接口与推理验收样例，不是准确率评测。

本轮修复了 Docker 临时 socket 故障、缺失模型、AgentGuard 必需策略/WASM 源文件、中文路径和 PowerShell UTF-8 读取、模型预热等待、OPA 孙进程清理及 Python 应用别名遮蔽。安装失败测试中配置与控制台文件已恢复；进程树修复后独立验证了停止、端口释放及重新启动。

限制：本次验证覆盖本机的独立环境构建、已有宿主安装和复装，未在一台全新 Windows 虚拟机上复现系统重启与首次 WSL2 初始化，也未实际注销或重启 Windows 来触发登录任务。原始机器日志保存在不提交的 `local-validation/`，其中可能包含本机路径。远程多用户部署、所有攻击覆盖率、完整 TrustRAG 论文流程均不在此次验收范围内。
