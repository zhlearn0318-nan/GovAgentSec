# Spec: OpenClaw 内嵌防护过程

## Objective

在本机 OpenClaw 2026.7.1-2 的聊天侧栏底部展示 Protect Agent 的真实运行状态。面板需要呈现输入检测、策略判断、工具审查和输出复检，但不得把提示词、工具参数、会话标识或认证信息发送到浏览器。

## Tech Stack

- OpenClaw 本地插件 API：运行钩子与 `registerHttpRoute`
- 原生 JavaScript / CSS：通过轻量加载脚本挂载到现有 `.sidebar-shell__body`
- Node.js 内置测试运行器：状态存储与插件契约测试

## Commands

- 插件测试：`cd integrations/openclaw/plugin && npm test`
- 语法检查：`node --check register.mjs && node --check guard-events.mjs`
- OpenClaw 检查：`openclaw status`

## Project Structure

- `integrations/openclaw/plugin/guard-events.mjs`：脱敏的有界运行状态与跨运行实例原子快照
- `integrations/openclaw/plugin/ui/`：侧栏注入脚本和样式
- `integrations/openclaw/plugin/register.mjs`：钩子埋点与只读 HTTP 路由
- `integrations/openclaw/plugin/test/`：状态与注册契约测试
- OpenClaw 安装目录的 `dist/control-ui/index.html`：仅增加一个带版本标记的脚本标签，并保留备份

## Code Style

```js
store.beginRun(runKey);
store.completePhase(runKey, "input", {
  status: "passed",
  riskLevel: result.riskLevel,
});
```

使用小写阶段 ID、明确状态枚举、不可变浏览器快照；所有外部值先归一化，UI 只用 `textContent`。

## Testing Strategy

- 单元测试覆盖状态转换、容量限制和脱敏输出。
- 插件测试覆盖路由注册、跨实例状态同步、放行、拦截、失败关闭和输出复检。
- Playwright 在真实 `127.0.0.1:18789` 页面验证挂载位置、折叠交互和控制台错误。

## Boundaries

- Always：只返回脱敏元数据；共享快照严格按字段白名单重验；限制状态数量；HTTP 响应禁止缓存与 MIME 嗅探；修改安装文件前备份。
- Ask first：修改 OpenClaw 安装目录和重启 Gateway。
- Never：暴露 token、提示词、工具参数、模型输出或原始会话 ID；修改压缩后的 OpenClaw 主 bundle。

## Success Criteria

- 用户打开真实 OpenClaw 聊天页即可在左栏下方看到“防护过程”。
- 发送消息时面板反映真实插件钩子阶段，安全结果和拦截结果可区分。
- OpenClaw 侧栏收起时面板不会破坏布局。
- 插件全量测试通过，浏览器控制台无新增错误。
- OpenClaw 更新覆盖补丁时可通过仓库内安装脚本重新应用。

## Open Questions

- 当前 OpenClaw 没有第三方侧栏 UI 注册 API，因此采用可恢复的 `index.html` 加载点；升级 OpenClaw 后需要重新应用。
