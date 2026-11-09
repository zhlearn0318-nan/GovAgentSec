# 交给其他 AI Agent 的安装入口

将下面一句发给能操作本机 Windows 的 AI Agent：

> 请阅读并执行 https://github.com/zhlearn0318-nan/GovAgentSec/blob/main/docs/INSTALL_WITH_AGENT.md，在本机安装政安智枢正式版 v1.0；保留已有外部 API 接口和模型配置，完成安装验证并报告结果。

## 执行规程

1. 使用本机当前用户。确认 Windows x64、winget、NVIDIA CUDA 条件；不要将安装扩展为修改其他电脑或组织环境。
2. 从固定发布页 https://github.com/zhlearn0318-nan/GovAgentSec/releases/tag/v1.0 下载 `GovAgentSec-v1.0-windows-x64.zip` 与 `SHA256SUMS.txt`。核对 ZIP 的 SHA-256。不要用 main 的浮动快照代替发行包。
3. 解压到长期保留的空目录。阅读 `release-manifest.json`、`docs/WINDOWS_ONE_CLICK_INSTALL.md` 和安装脚本。先运行下面的 Plan，再运行安装；不要只写方案。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-Windows.ps1 -Plan
powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-Windows.ps1 -NoBrowser
powershell -NoProfile -ExecutionPolicy Bypass -File .\Verify.ps1
```

4. OpenClaw 固定 2026.7.1-2。已有其他版本、非标准 profile 或冲突配置必须停止并说明，不升级、不抹除配置。允许安装器在备份和哈希记录后接入受管插件。不要绕过安装器的准入、真实推理或健康检查。
5. 遇到 Windows UAC、Docker/WSL 首次确认、驱动或重启要求，告知用户所需操作，完成后复跑。不能将这类中断记为安装通过。
6. 全新安装可用本地 Ollama；外部 API 接口继续保留。若用户要接外部模型，使用 `Configure-Model.cmd` 引导用户在本机输入 Key，不让用户把真实 Key 发到对话，不把凭据带进输出。不得将审计轨迹用于外部模型评审，U20 保持默认关闭。
7. 验证成功后用 `Start-GovAgentSec.cmd` 打开系统，报告：发行版/宿主版本、工作区地址、安装命令退出码、report.json 路径、检查结果及任何需要用户完成的事项。不要回显令牌和配置全文，不 push 用户运行数据。

成功标准是安装器 report.status=passed、Verify 退出码 0；只有下载完成或页面能打开不足以宣布安装成功。业务演示身份需显式启用，不能把演示身份称为真实组织认证。
