# 使用 Agent 安装 DeepSeek Harness 适配器

适用版本为 Windows x64 上的 GovAgentSec `1.0.0-alpha.1` 与 DeepSeek Harness `0.2.2-alpha.2`。完整前置要求、校验命令和修复步骤见[安装说明](INSTALL_DEEPSEEK_HARNESS.md)。

1. 检查 `dsh --version`、`nvidia-smi` 和安装盘可用空间。若宿主缺失，使用[固定版本的官方安装方式](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2)，确认可启动 Web 后继续。
2. 记录当前使用的 `DSH_HOME` 和启动方式。退出正在运行的 Harness，沿用原模型提供商、API、登录配置和用户工作区。
3. 下载 [GovAgentSec-DeepSeekHarness-v1.0-Online-Setup.exe（574 KiB）](https://raw.githubusercontent.com/zhlearn0318-nan/GovAgentSec/DeepseekHarness_release/GovAgentSec-DeepSeekHarness-v1.0-Online-Setup.exe)，按[安装说明](INSTALL_DEEPSEEK_HARNESS.md#一键安装)核对 SHA-256。需要手动下载运行环境时，把两个分卷放到同一目录并一并校验。
4. 运行联网安装包，确认窗口标题为「GovAgentSec · DeepSeek Harness 安装」，选定插件目录后点击「安装」。等待窗口显示结果。下载中断时使用同一目录重试。无法操作窗口时，把安装器路径和当前步骤交给用户继续。
5. 按原方式启动 Harness。打开「安全工作区」，检查「防护设置」中的组件就绪状态。已配置模型时用一条普通消息验证回复和本次防护记录。
6. 报告宿主版本、插件目录、安装状态和实际验证结果。安装失败时报告界面提示与 `setup-logs` 路径，避免复制令牌、API 密钥和用户会话内容。
