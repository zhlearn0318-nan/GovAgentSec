# 调用关系图空白修复与验收

验证日期：2026-11-07。OpenClaw **2026.7.1-2**，没有升级、git push、修改安全模块或宿主配置。验证只读取本地既有轨迹，没有发起模型请求，没有向外部服务发送轨迹。

## 根因与修改

对 `4af42d89-727a-45cb-b1b0-5f6406699928` 的普通点选，修复前实机可渲出 26 个节点、30 条边，canvas-wrap 为 1014×640，并非 JSONL 没有事件或固定高度为零。问题出在异步状态与异常路径，不能笼统归因于截图时机：

| 原逻辑 | 后果 | 修复 |
|---|---|---|
| `selectedId` 等详情响应回来才更新；`load()` 的列表响应会无条件再次 `open()` | 刷新较慢时，旧刷新覆盖用户的新选择，并使新详情因 version 不符被丢弃 | 点选立即记录选择、显示加载状态；列表请求独立序号；刷新不得覆盖发出后产生的选择 |
| 筛选 onchange 只执行 `renderList()` | 左侧已有可选轨迹但右侧仍为空态，或仍显示已被筛掉的旧轨迹 | 筛选同步核对当前选择；选取可见完整轨迹，空列表清空详情 |
| `render()` 是未等待的 async；可选评分使用 `assessment?.quality.Q` 等不完整空值检查 | 评分子字段缺失时，清空/部分绘制后抛错，调用方收不到异常，图与时间线均缺席 | 同步绘制、可选评分空值处理、明确的字段错误状态 |
| 对比/候选回调只检查 tab 名，不检查是哪次渲染 | 离开后重回同一 Tab，旧响应仍可追加进新页面 | 渲染序号拒绝陈旧回调，卸载后不再更新 |

图和时间线共用 `traceGraph()` 与新增 `nodePresentation()`。保留明确 parent_event_id 实线与时间顺序虚线，不猜测因果。显示 model、tool、MCP、耗时和 token；防护文字明确区分 **ALLOW / BLOCK 已阻断 / BLOCK 仅观察 / REVIEW**。窄屏使用图内横向滚动，长链使用纵向滚动；图容器有最小高度，空事件和读取失败都有明确提示。

修改范围：

- `modules/govagentsec-trace/view.mjs`：选择/加载/筛选/Tab 状态、错误展示、图和时间线布局。
- `modules/govagentsec-trace/view-model.mjs`：共享显示标签；原 traceGraph 的事件和边算法不变。
- `scripts/render_real_call_graph.mjs`：显式 evidence + trace_id 输入，输出 SVG/PNG/HTML/JSON；删除硬编码目录、默认轨迹和失败时选另一条轨迹的行为。PNG 失败退出非零，不能默默当作导出成功。
- `scripts/test_real_call_graph.mjs`：真实 evidence、异步状态回归、实际 OpenClaw UI 与离线导出核对。

## 真实证据与实测结果

输入：`local-validation/trace-live-smoke/2026-11-06T14-57-21-569Z-64281652/evidence`。

trace_id：`4af42d89-727a-45cb-b1b0-5f6406699928`。该既有报告 passed=true，来自真实本地 Agent/MCP 运行，业务文档是合成公开数据，身份为本机演示身份；本次不将其称为生产 OIDC 验收。

| 数据范围 | UI / 导出结果 |
|---|---|
| 保存的冒烟 evidence | 22 节点、26 边；真实 evidence 加载到同一 UI 模块，与导出逐项一致 |
| 当前 `trace-audit` 台账及实际 OpenClaw 页面 | 26 节点、30 边；有后续 4 条任务归属/评分事件 |
| 两份记录的关系 | 当前台账前 22 条 event_hash 与保存的 evidence 完全一致；均通过哈希校验 |

验证成功，相关命令退出码均为 **0**：

- 新浏览器脚本 **13 组检查通过**：节点 ID、边、标签逐项一致；PNG 文件有效；错误 trace_id 不回退；图/时间线切换；详情；延迟刷新；筛选失败与恢复；卸载；陈旧 Tab 回调；缺少评分字段；空态；BLOCK 区分；窄屏和长链；实际 OpenClaw 页面及证据前缀。
- 原轨迹核心 **9/9 测试通过**。
- 原 `test_trace_audit_ui.mjs` **11 类交互检查通过**（含同任务对比、候选来源与联合准入状态展示）。
- 浏览器 `pageerror` 为空，`git diff --check` 通过。

产物均在 `local-validation/trace-graph-fix/`：

- `result.json`：机器可读验收报告。
- `openclaw-graph.png`：实际 Control UI 截图。
- `evidence-ui.png`、`timeline.png`：保存 evidence 的图与时间线截图。
- `export/call-graph-real.png`、`.svg`、`.html`、`.json`：22 节点 evidence 导出。
- `export-live/call-graph-real.png`、`.svg`：26 节点当前台账导出，与实际 UI 当前版本对应。

异步延迟、失败响应和空评分测试只在测试页面的 request 回调中模拟，不修改原始 JSONL 或原始冒烟报告。没有重新采集或补造事件。

## 复现命令

在仓库根目录 PowerShell 执行：

```powershell
$evidence = 'local-validation/trace-live-smoke/2026-11-06T14-57-21-569Z-64281652/evidence'
$traceId = '4af42d89-727a-45cb-b1b0-5f6406699928'

# 本地离线导出，输入也可直接指向 evidence/traces
node scripts/render_real_call_graph.mjs $evidence $traceId local-validation/trace-graph-fix/export

# evidence UI + 离线导出 + 已运行的真实 OpenClaw 页面；只读
node scripts/test_real_call_graph.mjs $evidence $traceId --live

# 不连接 OpenClaw 服务时，去掉 --live；不会将它宣称为实际宿主 UI 验收
node scripts/test_real_call_graph.mjs $evidence $traceId

# 导出当前台账（含后续归属/评分事件）
node scripts/render_real_call_graph.mjs local-validation/trace-audit $traceId local-validation/trace-graph-fix/export-live

node --test modules/govagentsec-trace/test/*.test.mjs
node scripts/test_trace_audit_ui.mjs
```

PNG 和浏览器检查使用固定宿主附带的 playwright-core 与本机 Edge，不安装新依赖。`--live` 读取本机 OpenClaw 配置中的 token，仅用于回环登录，不写入报告。离线导出不依赖运行中的网关/模型，但需本机 Edge 和固定版本附带的渲染依赖。

## 最小手工验收

1. 完整刷新已登录的 OpenClaw 页面（已打开页面的 ES module 需要重新加载）；进入“审计中心”。也可打开 `http://127.0.0.1:18789/plugin?plugin=protect-agent&id=govagentsec&section=audit`。
2. 点击包含上述 trace_id 的 `typhoon-emergency-brief / real-trace` 行。选择立即高亮，短暂显示加载后出现“调用关系图”，无须再刷新或切换 Tab。
3. 查看 ALLOW、model 与 MCP / tool 节点，滚动至链尾；点击节点可查看本地事件证据。
4. 切换“毫秒时间线”，确认事件数一致，可滚动到最后；切回图仍有节点与边。
5. 刷新列表期间再次点选轨迹，或切换任务筛选。最终右侧必须对应当前高亮项；读取失败必须显示重试入口，不能无提示空白。

离线 SVG/PNG 中的文本与 UI 共享呈现函数；两种载体尺寸不同，未声称像素布局完全相同。BLOCK 显示回归使用明确的测试投影；这条真实公开文件轨迹本身没有被伪造为 BLOCK。
