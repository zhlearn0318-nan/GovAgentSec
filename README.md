# 政安智枢 GovAgentSec

**正式版 v1.0 · OpenClaw 固定 2026.7.1-2 · Windows x64**

GovAgentSec 将风险识别、行为约束、组件准入和评测审计集成到 OpenClaw：使用前检查 Skill/MCP，使用中核验输入、身份与工具动作，使用后沿轨迹审计并生成隔离候选 Skill。

[下载发布页](https://github.com/zhlearn0318-nan/GovAgentSec/releases/tag/v1.0) · [当前系统基准](docs/CURRENT_SYSTEM.md) · [使用手册](docs/产品使用逻辑与模块协同.md) · [演示流程](docs/PRODUCT_DEMO_RUNBOOK.md) · [文档索引](docs/README.md)

## 当前使用逻辑

1. 启动系统，在会话顶部或动态权限登录业务身份。身份自动应用于此工作区的对话，资料范围由服务端权限决定，无需绑定任务或勾选材料。
2. 新 Skill/MCP 先进入能力准入；任务从聊天开始，输入和工具动作经相应防护链检查。
3. 需要确认时，在会话卡片或动态权限点击“允许一次／拒绝”；查看执行回执确认最终结果。密级或受保护资源的硬拒绝不能靠批准绕过。
4. 在“查看过程”或演进审计查看横向调用图、时间线与防护记录。明确确认同任务轨迹后，本地评审、TopK、候选生成与联合准入串联进行；候选不会自动发布。

| 当前入口 | 用户用途 |
| --- | --- |
| 动态权限 | 登录、资料权限、待审批、执行回执 |
| 能力准入 | Skill/MCP 检查、准入报告、规则与人工复核 |
| 演进审计 | 调用图、时间线、对比、Q/S 评估与候选技能 |
| 安全总览 | 安全统计、实际防护状态、组件状态 |
| 防护设置 | 配置与维护、Docker/srt、演示身份源 |

演示登录有效期 **30 分钟**。admin 与 weihu 同属最高执行等级，可读取全部登记的合成资料；shenpi、jingban 为中级、基础账号；shenji 为只读审计岗位。账号说明可在登录页查看。最高账号不等于任意电脑文件访问权；详见[身份与权限](docs/OIDC_USAGE.md)。

## 四类安全能力

| 能力 | 实现 | 说明 |
| --- | --- | --- |
| 风险识别 | Protect Agent / Group1 | PIGuard、Qwen3Guard、TrustRAG，输入、工具结果和回复检查；观察与阻断按实际执行模式区分 |
| 行为约束 | AgentGuard、任务 ACL、会话沙箱 | OPA、密级/资源权限、动作摘要、一次性 HMAC 票据、审批与隔离执行 |
| 组件准入 | Aegis + Group4 | Skill/MCP 声明及代码检查，适用时 Docker 试跑，联合准入与证据 |
| 评测审计 | govagentsec-trace、trajectory-governance | 哈希链、横向调用图、本地 Q/S、候选工坊及人工发布闸 |

本机当前会话模型为 DeepSeek；**全新安装默认 Ollama，外部 API 接口保留**。会话模型和轨迹评审是两条路径，轨迹评审仅本地；外部会话模型仍会接收该会话上下文。默认 Docker，srt 可选；MCP 服务及模型 API 不自动进入会话容器。

## 下载安装

### 1. Windows 一键安装包（推荐）

下载 **[GovAgentSec-v1.0-Setup.exe](https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/v1.0/GovAgentSec-v1.0-Setup.exe)**，双击即可自动下载、校验并安装固定版 OpenClaw 和政安智枢，完成后打开系统并创建桌面快捷方式。无需预先下载源码或手动运行 PowerShell。

### 2. 使用 Agent 一键部署

把下面这段指令发给能操作本机 Windows 的 AI Agent：

```text
请阅读并执行 https://github.com/zhlearn0318-nan/GovAgentSec/blob/main/docs/INSTALL_WITH_AGENT.md，在本机安装政安智枢正式版 v1.0；保留已有外部 API 接口和模型配置，完成安装验证并报告结果。
```

### 3. 传统手动下载安装

下载 **[Windows ZIP](https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/v1.0/GovAgentSec-v1.0-windows-x64.zip)** 和 **[SHA256SUMS.txt](https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/v1.0/SHA256SUMS.txt)**，核对摘要后解压到长期保留的目录，在该目录打开 PowerShell，执行：

```powershell
# 查看安装计划
powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-Windows.ps1 -Plan
# 执行安装并检查
powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-Windows.ps1 -NoBrowser
powershell -NoProfile -ExecutionPolicy Bypass -File .\Verify.ps1
# 打开系统
.\Start-GovAgentSec.cmd
```

安装后使用 `Start-GovAgentSec.cmd` 启动，使用 `Configure-Model.cmd` 配置外部 API 和模型。完整防护需要 NVIDIA CUDA、Docker Linux 引擎；首次系统授权、Docker/WSL 设置或重启按提示完成。EXE 当前未做代码签名，Windows 可能显示发布者提示。

安装详情及故障处理见 [Windows 安装说明](docs/WINDOWS_ONE_CLICK_INSTALL.md)，验证范围见 [安装验证记录](docs/WINDOWS_INSTALLER_VALIDATION.md)。

## 启动、维护与验证

安装后双击桌面 GovAgentSec v1.0 或 `Start-GovAgentSec.cmd`。默认地址为 `http://127.0.0.1:18789/plugins/govagentsec/welcome`。业务演示源默认关闭，由管理员在防护设置开启；网关连接凭据不是业务身份。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Verify.ps1
python scripts/check_current_docs.py
```

配置变更前备份并核验摘要，不升级固定宿主。[维护说明](docs/MAINTENANCE.md) · [模型接入](docs/MODEL_ROUTING.md) · [验证索引](docs/VALIDATION.md)。安装包以 `SOURCE_COMMIT.txt` 标明构建提交；历史 v1.0 标签保持不变，发布页说明当前附件修订。

## 源码与数据

| 路径 | 用途 |
| --- | --- |
| modules/govagentsec-ui | 工作区与会话入口 |
| modules/agentguard-group2 | 身份、策略、受管工具、审批与审计 |
| modules/protect-agent-group1 | 输入/回复/工具结果防护 |
| modules/aegis、modules/supply-chain-group4 | 组件准入及联合安装策略 |
| modules/govagentsec-trace、modules/trajectory-governance | 轨迹与候选技能治理 |
| modules/session-sandbox | Docker/srt 会话隔离 |
| scripts、Setup-Windows.ps1 | 部署、维护和验证入口 |

密钥、模型权重、对话与轨迹、运行库和本机证据不随 Git 发布。下载的官方权重与依赖按锁文件管理。新增整合代码与自有模块采用 Apache-2.0，AgentGuard 保留 MIT，第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

本版不是生产 OIDC、任意工具全覆盖或自动生产发布的认证。全新 Windows 整套安装仍需实机验证；当前已验证范围及剩余限制统一见 [ACCEPTANCE_BOUNDARIES.md](docs/ACCEPTANCE_BOUNDARIES.md)。历史设计与实验只用于追溯，不替代当前操作手册。
