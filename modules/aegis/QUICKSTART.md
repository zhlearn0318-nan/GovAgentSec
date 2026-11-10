# Aegis 集成版快速使用

在 GovAgentSec 仓库根目录完成安装，进入“能力准入”即可使用本组件。安装步骤见[Windows 安装说明](../../docs/WINDOWS_ONE_CLICK_INSTALL.md)。

维护时确认 Docker Linux 引擎、扫描器隔离环境和本地语义模型就绪；检查接口见[API 合约](demo_web/docs/API_V1_CONTRACT.md)。扫描失败或依赖缺失不能解释为准入通过。

测试样例在 fixtures 和 demo_web/demo_samples，均用于隔离回归，不直接安装到生产。
