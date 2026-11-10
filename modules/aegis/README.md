# Aegis 组件准入引擎

GovAgentSec 的 Skill、MCP 与扩展供应链检查组件。安装、账号与产品入口以 [系统使用说明](../../docs/CURRENT_SYSTEM.md) 为准，完整部署使用仓库根目录安装器。

## 运行职责

- 静态与语义分析：结合固定版本 Cisco 扫描器、自研上下文规则及本地模型。
- 动态检查：对适用的 Python、Node.js、Shell 入口在受限 Docker 中试跑。
- 归一化证据与准入决策：ALLOW、REVIEW、BLOCK、UNKNOWN 按实际策略解释。
- Skill 安装继续经过 Aegis + Group4 联合策略；检查通过不等于组件已安装或服务已经连接。

## 主要目录

| 路径 | 用途 |
| --- | --- |
| demo_web/backend | HTTP 接口、扫描、规则、报告与准入服务 |
| demo_web/openclaw_plugin/aegis-admission-ui | OpenClaw 能力准入页面 |
| demo_web/tools | 扫描器、动态验证与复现工具 |
| fixtures | 合成安全/恶意样例和回归输入，不是部署技能 |
| bootstrap_runtimes.ps1 | 固定扫描器运行环境 |

接口见 [API 合约](demo_web/docs/API_V1_CONTRACT.md)。系统安装依赖、模型及 Docker 由根目录脚本管理，不需要克隆另一个 Aegis 仓库。开发阶段方案和实验过程记录已移出本产品仓库；这里保留实际引擎、样例、测试和接口。

许可证与第三方来源见 [LICENSE](LICENSE)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)，安全报告方式见 [SECURITY.md](SECURITY.md)。
