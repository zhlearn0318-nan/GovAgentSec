# 会话执行沙箱：Docker / srt

宿主固定 **OpenClaw 2026.7.1-2**。U9 新增原生会话执行隔离，默认 Docker；不是 Aegis 安装前沙箱，也不代替 AgentGuard 的策略、审批与票据。

## 页面怎么用

打开 OpenClaw → **防护设置**→ **会话沙箱引擎**。页面显示当前引擎、安装就绪状态和限制。管理员可以选择 Docker 或 sandbox-runtime (srt)。等待保存完成，结束正在运行的任务，再新建会话。切换不迁移已经启动的进程。

当前默认 Docker，宿主提权旁路关闭。切换通过已登录网关 RPC 完成：读取需 `operator.read`，修改需 `operator.admin`。接口只接受 `engine: docker|srt`，拒绝其他参数；目标未就绪、配置校验失败或检测到并发修改时不保存。

选择 srt 后先确认冷启动提示，点击“确认切换 srt”才保存；“保留当前引擎”或 Escape 取消。首次/冷启动可能数十秒至数分钟，可能超过业务委托期限；这段等待来自执行环境准备，不代表模型一直推理。切换不自动续权或重试。U23 专项只验真实页面确认/取消与默认 Docker 保持；不冒充重新完成两引擎 OS 隔离验收。

## 实际隔离范围

| 项目 | Docker | srt 0.0.81（Windows Alpha） |
| --- | --- | --- |
| 执行接线 | 固定宿主原生 `docker` 后端 | 插件通过公开 `registerSandboxBackend` 注册 `srt`；原生 exec 调用其 `buildExecSpec` |
| 命令语法 | Linux shell | PowerShell，编码后交给 srt 隔离子进程 |
| 文件读取 | 只挂载独立会话工作区；不挂载用户原工作区 | 原生受限账户，明确拒绝 protected、settings、用户 .ssh 与 .openclaw/.env |
| 写入 | `/workspace` 只读；允许在容器 `/tmp` 的 64 MB tmpfs 写入 | 允许写独立会话工作区；不允许写外部路径，`.git` 禁写 |
| 网络 | `network=none` | 空域名允许列表 + Windows WFP 出网约束；普通直连测试被拒绝 |
| 加固 | 非特权、UID 1000、cap-drop ALL、只读根、512 MB、128 PID、1 CPU | 上游 Windows 账户/受限令牌/ACL/WFP；没有宣称与容器资源限制等价 |
| 性能 | 本机原生 exec 对照为亚秒级 | 本机一轮启动权限检查约 104 秒，多工具调用明显更慢，适合对比演示 |

固定宿主的 `workspaceAccess=none` 会将独立工作区挂成只读，不能把它误当可写目录。Docker 生成结果放 `/tmp`，容器移除后消失；这不是已经实现的生产文件交付方案。原生 write/edit 还受宿主工具策略限制；srt 的 exec 可写其独立工作区。

**srt 已实测存在上游 `anonymous-loopback` 残余限制：主动使用匿名模拟令牌的程序可能访问回环监听端口。** `allowRead` 也不是全盘读取白名单，未被明确拒绝且系统本就可读的路径仍可能可读。安装使用 `--skip-profile-grant`，不广泛授予用户主目录读取权限。产品页提供引擎优缺点介绍，完整边界在本文保留；不要把 srt Windows 演示解释成恶意代码的完整隔离保证，默认保留 Docker。

隔离作用于原生 exec 和文件工具。网关中的模型 API、插件自身进程及 MCP 服务不在这个容器中。已获准的 AgentGuard 五个独立 MCP 工具、工作区 gov_read_document 和供应链扫描工具仅保留既有授权；不新增其他工具授权、不改 MCP toolFilter，不绕过 OPA/审批/一次性票据。沙箱中的模型请求仍由网关处理；本轮测试不发送聊天，不调用任何外部模型，也不上传轨迹。

## 安装和部署

在安装 OpenClaw 的 Windows 用户下执行（srt 初次设置可能需要系统管理员确认）。只使用本机合成数据。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Ensure-DockerReady.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Ensure-SrtReady.ps1
node scripts/setup_session_sandbox.mjs
openclaw gateway restart
```

- srt 固定依赖 `@anthropic-ai/sandbox-runtime@0.0.81`，仓库托管 package-lock；安装到 `modules/session-sandbox/node_modules`。其原生安装器配置 srt 专用 Windows 账户和 WFP，非仅下载命令行文件。
- `Ensure-SrtReady.ps1 -CheckOnly` 只核对版本及账户状态。页面的“可用”表示安装就绪；每次实际执行仍由上游做 WFP 行为检查，不将安装状态冒充隔离测试结果。
- 专用 Dockerfile 固定 Node 基础镜像 digest。安装脚本首次构建 `govagentsec-session:node20-v1`；已有镜像直接复用，`--build` 强制重建。镜像包含 Node 和 shell，不宣称已安装 Python 或办公软件。
- 安装脚本核对宿主版本、验证配置，写入前在 `%USERPROFILE%\.openclaw` 备份 `openclaw.json.before-session-sandbox-install-*`。配置示例在 `config/session-sandbox.example.json`，没有密钥。
- 实际配置位于 `%USERPROFILE%\.openclaw\openclaw.json`。新增插件 `govagentsec-session-sandbox`；`agents.defaults.sandbox.mode=all`、`scope=session`；禁用 elevated，exec 强制 sandbox，文件工具 workspaceOnly。
- 配置/审计根：`%USERPROFILE%\.openclaw\govagentsec\session-sandbox`。下有 settings、Docker workspaces、protected（合成保护文件），以及仅记录引擎、时间、管理权限标识与配置哈希的 `switch-audit.jsonl`。srt 工作区单独使用 **仓库根 `.runtime/session-sandbox/workspaces`**：未授予主目录读取权限的受限账户无法进入 `.openclaw`，因此不把其工作区放在主目录。只授予具体会话子目录读写，不授予仓库或用户主目录读取；`.runtime` 已被 Git 忽略。切换逐次备份原配置。
- 引擎不可执行时失败，不自动回退宿主 shell。srt 不支持 PTY 或自定义环境变量；文件桥同样经 srt 执行。broker 与上游 CLI 使用同一进程作为 holder，OpenClaw 超时终止后由上游原生作业机制终止隔离子进程。

## 复跑验收

```powershell
node --test modules/session-sandbox/test/*.test.mjs
node scripts/test_session_sandbox_docker.mjs
node scripts/test_session_sandbox_srt.mjs
# 复核安装配置使用的专用 srt 工作区、相对路径与隔离
node scripts/test_session_sandbox_installed.mjs
# 真页面切换 + 每次切换后的原生工具隔离探针；最后恢复 Docker
node scripts/test_session_sandbox_ui.mjs --probe
# 单独复验页面，省去耗时的 srt 重复启动
node scripts/test_session_sandbox_ui.mjs
# 原准入沙箱回归，output 请使用未存在的目录
.\modules\aegis\.runtime_skill\python.exe scripts/verify_sandbox_v2.py --output local-validation/sandbox-check-u9-rerun
```

证据保存在 `local-validation/session-sandbox/<UTC timestamp>/`，按 docker / srt / ui 分目录。UI 联合测试把两引擎证据放到同一个 ui 目录下；保存 PNG 和 report.json。失败退出非零并保留 error；不静默跳过。

探针直接调用固定版 `resolveSandboxContext` 和原生 `createExecTool`，再检查同一后端的文件桥与网络约束。使用合成文件，未调用 LLM；`source=real-openclaw-sandbox-context` 不代表新生成了真实模型会话。引用的 bundle 文件名和导出均按固定宿主核对，版本不匹配拒绝安装。

成功判据：原生 exec 输出标记；界内读写成功；越界读写失败；非白名单 TCP 连接失败；文件桥界内可读、界外拒绝。Docker 另核对实际 HostConfig，而非只看配置字符串。srt 回执为 EPERM/EACCES；Docker 中未挂载文件返回 ENOENT、只读写入 EROFS、断网 ENETUNREACH。

## 代码与接口

| 文件 / 接口 | 职责 |
| --- | --- |
| `modules/session-sandbox/index.mjs`、`openclaw.plugin.json` | 注册原生 srt 后端、管理员 RPC、禁止宿主旁路的 before_tool_call 钩子 |
| `policy.mjs`、`service.mjs` | 最小隔离配置、就绪检查、备份、校验、切换与审计；保留已有更严格白名单 |
| `backend.mjs`、`runner.mjs` | 原生 exec 规格与文件桥；只生成 srt 隔离执行，不设置宿主降级分支 |
| `probe.mjs`、`test/policy.test.mjs` | 真实运行探针、配置与越界单测 |
| `Dockerfile`、`package.json`、`package-lock.json` | 固定镜像与 srt 版本 |
| `modules/govagentsec-ui/workspace.mjs` | 工作台、设置页共用切换卡片；失败显示原因并恢复原选中项 |
| `govagentsec.sandbox.status` | 无参数，返回 current、mode、elevated_disabled、engines 和范围说明，不返回密钥或完整配置 |
| `govagentsec.sandbox.select` | 仅 `{ "engine": "docker" }` 或 `{ "engine": "srt" }`，返回 saved/effective；网关校验管理员权限 |

运行路径：原生 OpenClaw 工具策略 → 原 before_tool_call 安全钩子和旁路拒绝 → exec 选择的后端 → Docker 或 srt 原生隔离 → 原工具结果检查/轨迹采集。MCP 工具继续沿 AgentGuard 链执行，不能据此声称所有 MCP 进程都已进入容器。

## 排障与恢复

- Docker 未启动：运行 Ensure-DockerReady；专用镜像缺失运行 setup。不要为通过测试开放网络或挂宿主 Docker socket。
- srt 安装未完成：运行 Ensure-SrtReady；账户存在但 WFP 行为检查失败时保持失败，不降级为宿主执行。Windows 首次 ACL 设置耗时较长，超时会明确失败。
- srt 提示 `SRT_WORKDIR_UNAVAILABLE`：工作目录无法进入，命令不会执行。使用本包配置的 `.runtime/session-sandbox/workspaces`，不要为了让主目录工作区可用而扩大主目录授权。
- 工具提示越界或只读：这是策略生效。Docker 使用 `/tmp` 做写入对照，不放宽用户原工作区挂载。
- 页面未显示：确认插件已启用并重启网关，刷新防护设置；未登录或非管理员不能切换。
- 回退本包配置时，关闭正在运行的演示任务，将安装前的明确备份原样恢复后重启网关。不要从其他机器复制含密钥的配置，不把本机备份提交进仓库。卸载 srt 原生账户/WFP 按上游卸载说明操作，不能仅删 node_modules。

上游实现说明：[anthropics/sandbox-runtime](https://github.com/anthropics/sandbox-runtime)。本仓库没有宣称复现 Claude 全量运行时，也没有将本轮合成探针作为生产政企验收完成证明。
