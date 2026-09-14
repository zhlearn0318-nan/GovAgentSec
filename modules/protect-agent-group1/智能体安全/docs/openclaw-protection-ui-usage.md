# OpenClaw 防护侧栏使用说明

## 打开

访问 `http://127.0.0.1:18789/`。首次应用或浏览器仍显示旧页面时，按 `Ctrl+F5` 强制刷新。

防护面板位于左侧“会话”列表下方、设置区域上方。面板只展示输入检查、策略决策、工具审查、输出复检的阶段状态、风险等级与结果，不展示对话原文、工具参数、会话标识或令牌。

OpenClaw 会将聊天钩子和面板 HTTP 路由运行在不同实例中。插件通过项目根目录的 `.protect-agent-ui-state.json` 同步一份仅含白名单字段的原子快照；不要把该文件改成存放对话内容的日志。

## 重新安装

OpenClaw 更新可能覆盖 `dist/control-ui/index.html`。更新后如果面板消失，重新执行：

```powershell
& "D:\桌面\Protect_agent\智能体安全\integrations\openclaw\plugin\install-control-ui.ps1"
& "D:\OpenClaw\npm\openclaw.ps1" gateway restart --wait 15s
```

安装脚本是幂等的：已经安装时不会重复添加，并在每次实际修改前创建时间戳备份。

## 卸载 UI

```powershell
& "D:\桌面\Protect_agent\智能体安全\integrations\openclaw\plugin\install-control-ui.ps1" -Uninstall
& "D:\OpenClaw\npm\openclaw.ps1" gateway restart --wait 15s
```

这只移除侧栏加载标记，不会删除 Protect Agent 插件或安全配置。
