# Codex 提示词 U9：会话执行沙箱双引擎（Docker + srt）与切换入口

## 角色与仓库
`F:\揭榜挂帅\GovAgentSec`，OpenClaw **2026.7.1-2**（禁止升级宿主）。默认不 git push。
目标：会话级文件/网络隔离**同时落地两套引擎**——OpenClaw **Docker sandbox** 与 **anthropics/sandbox-runtime（srt）**，并在产品里提供**可切换入口**，方便对比演示效果后选用。不宣称已对等厂商全量 runtime。

## 已有基础（勿混淆）
- Aegis **准入**沙箱 v2（Skill 安装前 Docker 试跑）已有；本包做的是**会话执行**沙箱。
- `Ensure-DockerReady.ps1`、`verify_sandbox_v2.py` 保留作回归。
- 当前会话 `agents.defaults.sandbox` 可能未启用，需本包打开 Docker 引擎配置。

## 产品决策（已定，非可选）
1. **引擎 A：Docker** — OpenClaw `sandbox.backend=docker`，会话工具进容器。
2. **引擎 B：srt** — 安装并接入 `@anthropic-ai/sandbox-runtime`，高危执行（至少 exec/shell 类）经 srt 施加 OS 级文件+网络限制。**必须安装进系统并验收，不得只写文档。**
3. **切换入口（必做）**：工作台或防护设置提供「会话沙箱引擎」选择：`Docker` / `sandbox-runtime (srt)`（可用内部 id：`docker` | `srt`）。切换后对新会话/新工具调用生效；当前引擎状态醒目展示；切换写审计。
4. 默认引擎可先设 `docker`；允许用户改选 `srt` 做对比，不删任一引擎。
5. `tools.elevated` 等宿主机旁路：演示配置关闭或切换到沙箱引擎时明确禁用/标红。

## 目标

### A. Docker 会话沙箱（P0）
1. 按 2026.7.1-2 本地文档启用 `agents.defaults.sandbox`（backend=docker，mode/scope 适合全会话演示）。
2. 网络默认拒绝或等价 hardening；workspace 最小挂载；参数精神对齐 Aegis v2（非特权、cap_drop、只读根、限资源）。
3. 仓库只提交示例配置片段与文档；本机 openclaw.json 修改前 backup，密钥不入库。

### B. srt 安装与接入（P0，强制）
1. 在本机/项目约定位置安装 sandbox-runtime（npm 全局或仓库托管的可复现安装脚本，如 `scripts/Ensure-SrtReady.ps1`）。
2. Windows：按上游说明完成可用安装；若某能力受限，**在 UI 与文档标明限制**，但仍须提供可运行的最小封装（例如 `srt --settings ... -- echo` 与一次越界读失败），不得因「可选」跳过。
3. 接线：受管 exec（或 OpenClaw exec 包装）在引擎=`srt` 时必须经 srt；settings 含 allowWrite/denyRead/allowedDomains 演示策略，与 Docker 演示剧本对齐。
4. 安装与版本写入 `docs/SESSION_SANDBOX_DEMO.md` 与验收报告。

### C. 切换入口（P0）
1. UI：单选 Docker / srt；显示当前引擎、就绪状态（Docker 引擎是否健康、srt 是否可执行）。
2. 配置落盘位置明确（插件配置或 govagentsec 状态文件）；切换 API/RPC 需鉴权，与现有工作台身份边界一致。
3. 自动化：测试切换两种引擎后，各自跑通「越界失败 / 界内成功」或等价探针。

### D. 统一演示剧本（P0）
同一案例在两种引擎下各跑一遍（合成数据）：
- 越界路径或非白名单出网 → 失败/阻断 + 可解释回执
- 允许集合同对照 → 成功
证据目录：`local-validation/session-sandbox/<timestamp>/`，按 `engine=docker|srt` 分子目录。

### E. 文档与验收
- `docs/SESSION_SANDBOX_DEMO.md`：双引擎安装、切换、限制、与 Aegis 准入沙箱区别
- 更新 `SESSION_SANDBOX_PLAN.md`、`UPGRADE_ROUND_VALIDATION.md`
- 脚本：`Ensure-DockerReady.ps1`、`Ensure-SrtReady.ps1`（新建）、`test_session_sandbox_docker.mjs`、`test_session_sandbox_srt.mjs`（或合并带 `--engine`）

## 非目标
- 不升级 OpenClaw；不拆除 Aegis 准入沙箱
- 不自研内核；不夸大「已完全对等 Claude」
- 默认不 git push

## 验收命令
```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Ensure-DockerReady.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Ensure-SrtReady.ps1
.\modules\aegis\.runtime_skill\python.exe .\scripts\verify_sandbox_v2.py --output .\local-validation\sandbox-check-u9
node scripts\test_session_sandbox_docker.mjs
node scripts\test_session_sandbox_srt.mjs
# 含切换入口的 UI/配置测试（实现后补齐真实文件名）
```

## 完成定义
- Docker 与 srt **均已安装并可在会话路径触发**
- UI 可切换且状态可见；两套引擎都能跑通同一演示剧本
- 文档与自动化齐全；准入沙箱回归不破