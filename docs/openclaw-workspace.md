# OpenClaw 原生安全工作区

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

## 2026-11-07 · U2 过程台账常驻

当前入口以本节为准：顶栏常驻 **任务与轨迹 / 审计中心 / 防护设置**，侧栏折叠后仍可见；断线时任务按钮保留并提示等待连接。任务抽屉优先使用 `govagentsec-trace` 的 JSONL 图，与审计中心共用视图；按当前会话过滤，未关联会话不会猜选其他任务。新插件不可用时明确提示降级到旧版任务记录。

- **当前任务**：顶栏“任务与轨迹”，或点击工作台任务行。显示真实调用图、毫秒时间线、防护判定/审批事件计数、字段缺失及哈希链状态；处理审批仍走“待审批”原入口。
- **审计中心**：`/plugin?plugin=protect-agent&id=govagentsec&section=audit`。支持标题/任务/轨迹 ID 搜索、状态及 task_key 筛选。
- **指定轨迹**：上述 URL 加 `&trace=TRACE_ID`。日常视图默认不显示 synthetic-fixture、controlled-validation、integration-test 和明确 purpose=test 的记录，需勾选“包含本地合成测试”。
- **同任务对比**：勾选至少两条已确认同 task_key 的轨迹，点“对比所选轨迹”；地址记录 `section=compare&tab=compare&trace_id=ID1&trace_id=ID2`，可复制并刷新恢复。合成测试不会因 URL 指定而自动开启，需显式勾选后重新选择。
- **候选记录**：审计中心“候选 Skill”，可用 `section=audit&tab=candidates` 直达。候选仍保持原准入/发布边界。

无事件时提示启用 `govagentsec-trace`、运行一次受管工具后刷新，不添加示意节点。孤儿结果会明确提示“证据不足，当前轨迹不可入选”，说明缺少工具开始事件；评审仍由原规则隔离，页面不伪造已完成评审。审批数为采集到的事件数，0 不代表无需审批或全部通过。

抽屉调用图单独适配窄宽度，首个节点无需横向滚动即可看到；长链纵向滚动，点节点查看哈希证据。源隐私模式保持 hash，不为展示恢复 prompt、参数或输出原文。

实机截图与报告：`local-validation/trace-ui/u2-live/`；隔离 UI 回归：`local-validation/trace-ui/`；工作区导航回归：`local-validation/workspace-ia/`。不写桌面。复现与结果见 [U2 验收](UPGRADE_ROUND_VALIDATION.md)。

2026-11-05。此版本替代原来的宣传式总览，将日常操作放进 OpenClaw 宿主导航。对话、准入、审批和证据不再通过多层模块首页串联。

## 使用路径

| 要做的事 | 从哪里进入 | 直接得到什么 |
| --- | --- | --- |
| 开始一天的工作 | 左侧「工作台」 | 待审批、最近对话任务、实际防护覆盖；桌面首屏无需滚动 |
| 检查并安装 Skill | 左侧「能力接入」 | 上传与准入结果并列，扫描后按原流程安装 |
| 接入 MCP | 能力接入 → MCP 接入 | 配置表单与准入结果，不再经过模块首页 |
| 处理敏感动作 | 左侧「待审批」 | 参数、来源、原因；可信关联请求在任务面板处理 |
| 查看任务过程 | 顶栏「任务与轨迹」或点击任务行 | 过程图、风险与审批、执行证据 |
| 搜索历史或比较两次运行 | 左侧「任务轨迹」 | 搜索和状态筛选；运行对照与候选记录按需展开 |
| 检查防护或修改策略 | 顶栏「防护设置」 | 实际覆盖和维护入口 |

顶栏入口不再依赖聊天组件，可在主页面切换、导航折叠、窄屏时使用。快捷键为 Ctrl+Shift+G，Esc 关闭；打开、关闭不会清空聊天草稿。断开网关时入口保持可见并显示等待连接。

「工作台」只列最近的 OpenClaw 对话记录；受控验收夹具仍可在轨迹页查询并明确标记。当前工作台索引提供最近 100 条，完整历史与两次运行对照保留原入口。

## 交互和视觉取舍

- 固定一级导航，系统工具保留折叠菜单；防护浮卡并入实际覆盖区域。
- 取消主页面标语、品牌大图、滚动宣传内容与重复模块卡片。浅灰背景、深青操作色、小标题、细边框用于紧凑操作界面。
- 日常工作台、审批队列、历史列表是原生插件视图，通过当前网关连接读取记录，不另开网页登录。
- 复用已有准入、规则和维护表单的执行逻辑，嵌入时启用紧凑样式：隐藏重复品牌头、导航与流程说明，保留参数、判决、执行按钮和日志。
- 详情面板在聊天中为对话留出宽度；在管理页覆盖右侧，避免把任务列表挤窄。调用图按面板宽度适配，仍可放大查看。
- 审批完成后刷新工作台待办和导航计数；刷新不代替服务端策略复验。

## 部署与恢复

前提：本机已启用轨迹插件及相关防护模块。源码更新后重启网关加载新只读 RPC，再执行：

```powershell
node scripts/install_trajectory_view.mjs
node scripts/install_openclaw_workspace.mjs
```

首次适配保存 `.gov-workspace-backup`，修改宿主外壳、插件视图注册表和入口 HTML。入口会针对旧 OpenClaw 缓存中的这两个适配资源执行一次迁移，避免普通刷新继续使用旧布局；不清空对话或登录存储。

```powershell
node scripts/install_openclaw_workspace.mjs --restore
```

恢复回本轮适配前的宿主资源。当前验证宿主为 OpenClaw 2026.7.1-2；升级后重新运行适配器，结构不兼容时停止。产品改造通过可维护的源码模块与窄范围宿主适配实现，尚未形成独立打包的 OpenClaw 发行版。

没有更改执行审批文件、插件对话权限、网关鉴权或嵌入页面沙箱模式。iframe 隔离模式继承当前宿主配置，未因紧凑布局而放宽。

## 验证

```powershell
node --test modules/trajectory-governance/test/*.test.mjs scripts/test_workspace_release.mjs scripts/test_ui_release.mjs modules/aegis/demo_web/openclaw_plugin/aegis-admission-ui/security_center_page.test.js
node scripts/test_openclaw_workspace.mjs
node scripts/test_trajectory_chat.mjs
node scripts/test_trajectory_native.mjs
node scripts/test_task_live.mjs --reuse
```

本轮 58 项组件与回归测试通过。真实浏览器检查覆盖：原生首屏、四个主入口、前进后退、详情侧栏、准入表单、报告、侧栏折叠、手机布局、草稿保留、旧缓存替换和脚本错误。

真实历史 MCP 任务的审批证据再次读取验证通过；隔离页面连接本机 AgentGuard 的合成测试付款确认了审批及执行回执、审批更新通知。未执行真实资金支付，也未重新安装用户的 Skill。截图与报告保存在忽略目录 `local-validation/workspace-ui`。

## 保留的能力边界

输入与最终回复钩子尚未授权、工具结果仅观察、实际 Skill 版本未知等情况照实展示。管理界面重做不等于补齐这些后端防护。未能与轨迹可信关联的旧审批请求，进入原审批页面处理，不猜测所属会话。
