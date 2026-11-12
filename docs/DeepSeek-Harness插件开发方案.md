# GovAgentSec 接入 DeepSeek Harness 插件开发方案

**文档状态**　开发设计稿，2026-11-08。首发目标为 Windows 上已有 DeepSeek Harness 的 `web` profile。当前项目记录的验证基线是源码版 `@deepseek-ai/dsh 0.2.2-alpha.2`、Node.js `26.7.0`。面向普通用户的发行版安装仍需在干净机器上验收。[现有 Harness 接入说明](./DEEPSEEK_HARNESS.md)

## 1. 交付给用户的是什么

**建议以 Harness 原生插件组合包（bundle）交付宿主集成，以一个 Windows 安装器完成整套部署。** 用户下载并双击安装器，确认正在使用的 Harness 配置和允许扫描的 Skill 目录，安装完成后按原有方式启动 Harness。聊天页出现“安全工作区”，用户可以查看防护状态、处理敏感工具审批、检查 Skill 和追溯任务轨迹。

| 发行物（拟定） | 内容 | 谁使用 |
| --- | --- | --- |
| `GovAgentSec-Setup.exe` | 签名安装器，内含预构建插件，负责环境检查、运行时准备、安装、修复和卸载 | 首次部署的普通用户 |
| `govagentsec-harness-<版本>.tgz` | 原生 Cordis 插件、bundle 清单、配置层、前端资源及所需 JS 模块 | 已统一部署运行时的管理员，也供安装器内部使用 |
| 版本化运行时及发行清单 | 固定版本的防护服务、扫描器、策略与可选 AgentGuard 组件，列出模型来源、摘要及插件兼容版本 | 由安装器管理，便于复用模型、校验和回滚 |

插件通过宿主的 profile 包管理机制注册。安装器只配置选中的 profile，模型服务由本机运行时承载。MCP 用于暴露 AgentGuard 受管工具；输入、工具结果和模型流的拦截继续使用 Cordis 生命周期。这个分工可以复用现有代码，也保留用户原有的模型提供商、登录方式和工具审批界面。[上游插件打包指南](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/docs/user/develop/basic/publish.zh.md) · [现有适配器](../integrations/deepseek-harness/index.mjs)

## 2. 首版覆盖到哪里

| 能力 | 首版拟交付 | 对使用者可见的边界 |
| --- | --- | --- |
| 输入与输出防护 | 在 `agent/pre-step` 检查输入，在 `llm/stream` 缓冲并复检输出，调用本地 PIGuard、Qwen3Guard 等现有组件 | 模型预热和输出复检会增加首次响应等待；沿用现有文本检测范围及对不支持输入的拒绝策略 |
| 工具执行 | 通过 `tools/pre-execute` 检查参数、触发宿主原生审批，通过 `tools/post-execute` 复检工具结果及检索材料 | 风险结果在返回模型前处理；工具已经产生的外部副作用只能在执行前防范 |
| Skill 供应链 | 在原生 `skill` 工具及 `/skill` 注入路径复用 Aegis、Group4 和包摘要校验，提供手动扫描与报告 | 首版承诺本地授权目录内的 Skill 使用前检查。第三方插件安装、远程加载器和 Docker 动态扫描列入第二阶段 |
| AgentGuard 权限控制 | 按需启用 AgentGuard、OPA 与 MCP；区分服务就绪、业务身份就绪和工具可用 | 组织 OIDC 身份就绪后开放受管业务工具。一次性执行票据覆盖这些受管工具；普通 Harness Shell 使用宿主审批 |
| 轨迹与受控演进 | 复用脱敏轨迹、关联图、审计校验和现有本地评审/候选生成流程 | 操作者确认任务归属；满足评审与准入条件后生成隔离候选。首版工作区展示证据，发布候选另行确认 |

上述能力已有源码适配基础。“首版拟交付”还包含脱离开发目录、使用正式安装包及重启后仍生效三项要求。[现有能力与限制](./DEEPSEEK_HARNESS.md) · [Skill 加载检查](../integrations/deepseek-harness/skills.mjs) · [轨迹采集](../integrations/deepseek-harness/trajectory.mjs)

## 3. 插件结构与运行时约定

建议的插件发布目录如下。目录表示打包产物，源码可以继续沿用现有仓库分层。

```text
govagentsec-harness/
├─ package.json          # 名称、入口、dsh.bundle、engines.dsh
├─ cordis.patch.yml      # 在目标 profile 注册 GovAgentSec 插件条目
├─ dist/                 # 插件入口、宿主适配、打包后的共享 JS 模块
├─ ui/                   # 安全工作区、样式、图标
└─ notices/              # 随包组件的第三方声明
```

- **宿主入口。** 以项目自有包名注册固定的插件条目 ID。在 `package.json` 的 `dsh.bundle.patch` 指向随包配置层，以 `engines.dsh` 声明实测通过的版本。复用现有的 `apply(ctx, config)`、检查钩子、审批和 owner 授权的工作区路由。使用宿主对应版本的 `@deepseek-ai/dsh-skill` 公共导出来渲染 Skill，移除对宿主源码树中 `packages/skill/skill/lib/index.js` 的路径依赖。用发行版宿主验证渲染结果和正文哈希。[现有入口](../integrations/deepseek-harness/index.mjs) · [上游 Skill 包](https://github.com/deepseek-ai/deepseek-harness/tree/ce7073d51254c26cd63b22a60835b8f948deb447/packages/skill/skill)
- **运行时发现。** 建议将程序放在当前用户的 `%LOCALAPPDATA%\GovAgentSec\releases\<版本>`，将模型存放在独立缓存。安装器为每个目标 profile 写入独立的运行配置，标明协议版本、运行时位置、扫描根目录、Skill 加载根目录、审计目录和 AgentGuard 开关。插件通过配置定位资源；构建时显式收入当前通过 `../../modules` 引用的代码、样式和扫描规则。
- **服务生命周期。** 复用现有带 Bearer 认证的回环防护服务。插件先注册拒绝策略，再启动或连接匹配版本的服务；模型加载并完成真实探测后才报告就绪。每个运行实例具有独立的端口与状态目录，以实例锁和所有权记录区分自有进程。宿主退出时仅停止本实例启动的服务，避免多开误停。AgentGuard 启用时也由该生命周期管理，使平时的 `dsh web` 启动路径可用。[当前专用启动器](../Start-DeepSeekHarness.ps1)
- **身份与故障。** 每次新部署生成本地服务令牌，令牌文件使用当前用户的 Windows 访问控制权限；浏览器仅通过 Harness 已认证接口访问状态。真实模型不可用、超时或协议不兼容时，相关操作拒绝，并在面板说明原因。业务身份缺失只影响 AgentGuard 受管业务操作。审计保留阶段、决定和脱敏关联信息。
- **模型与许可证。** 按现有模型锁文件校验权重并复用缓存。安装器按发行清单获取依赖，随包附相应声明。SimCSE 等已有单独分发约束的材料沿用从固定上游取得的方式，离线交付逐项核对可分发内容。[模型锁文件](../models.lock.json) · [第三方组件说明](../THIRD_PARTY_NOTICES_SUPPLEMENTED.md)

## 4. 一键安装、升级与卸载

| 步骤 | 安装器行为 | 成功判据 |
| --- | --- | --- |
| 1. 识别环境 | 定位已安装的 `dsh`、版本、`DSH_HOME` 和目标 profile；核对磁盘、GPU、驱动与所选组件依赖，显示下载量。提供手动选择路径的入口 | 用户能确认安装目标；兼容性检查在改动 profile 前完成 |
| 2. 准备运行时 | 在暂存目录下载并校验制品，准备独立 Python 环境，预热真实模型，验证扫描器；选装 AgentGuard 时检查 OPA 与身份配置 | 核心组件通过真实请求；选装组件有独立状态，下载中断可以重试 |
| 3. 注册插件 | 通过宿主包管理器安装本地 bundle。迁移旧部署时定位配置脚本生成的受管区块，备份并校验后只移除对应内容 | 生效配置中仅有一套 GovAgentSec 钩子，其他插件和用户配置可继续使用。[旧配置生成逻辑](../scripts/configure_deepseek_harness.py) |
| 4. 验证生效 | 用户重启目标 profile，检查实际加载的插件与运行时版本，用安全样例走一次真实工具管线和模型输出拦截 | 面板分别显示“插件已加载”“模型已就绪”“防护检查已通过”；仅在端到端检查通过后报告安装完成 |
| 5. 升级或修复 | 对 profile 加安装锁，记录已完成步骤，新版本就绪后切换。失败时按安装记录恢复上一组插件与运行时；只回退本产品的配置变更 | 重试不会重复注册，升级失败后旧版本仍能处理受保护回合 |
| 6. 卸载 | 从目标 profile 移除 bundle、回收自有服务和令牌；分别提供保留或清理审计数据与模型的选项 | 原 profile 能正常启动，其他实例继续使用的模型和服务不会被误删 |

运行时已准备好的管理员可使用宿主 CLI。下列命令演示**拟定的包名与文件名**，实际发布时替换为发行版本。

```powershell
dsh plugin --profile web add ./govagentsec-harness-1.0.0.tgz
dsh plugin --profile web remove govagentsec-harness
```

其中 `remove` 只执行宿主侧移除。整套产品的服务、模型和数据由安装器的卸载入口管理。[上游 CLI 安装与移除说明](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/docs/user/develop/basic/publish.zh.md)

## 5. 开发顺序与验收

| 里程碑 | 开发任务 | 进入下一阶段的条件 |
| --- | --- | --- |
| M1 · 可独立加载的 bundle | 建立包清单、预构建入口和资源清单；替换源码树相对路径；为宿主版本声明兼容范围 | 在只有发行版 Harness 的干净 Windows 环境安装发布用 `.tgz`，普通 `dsh web` 可以加载插件与工作区 |
| M2 · 可移植运行时 | 解耦机器路径，接入模型缓存、扫描根目录、服务凭据、实例状态和 AgentGuard 身份配置；让验证脚本能够指向安装后的组件 | 在中文或含空格的安装路径下通过正常与风险样例；关闭服务后仍能观察到预期拒绝 |
| M3 · 用户可安装的首版 | 交付签名安装器、发行清单、旧配置迁移、升级与卸载；在另一台干净机器用最终下载件验收 | 下列首版场景逐项通过，并记录宿主版本、插件版本、运行时版本及通过的能力 |
| M4 · 完整供应链准入 | 新增受控安装入口，对隔离区内的制品运行适用的 Aegis、Group4、Cisco 或 Docker 检查，审批后按相同摘要安装 | 能证明被扫描、批准和实际安装的是同一制品。分别验证原生插件页、CLI 与其他加载器，发布说明逐项列出能强制执行准入的入口 |

**首版必测场景**

1. **用户原有环境。** 已有模型提供商、第三方插件和自定义 `DSH_HOME` 的用户完成安装、重启和卸载，原配置可继续工作。
2. **真实防护链。** 正常文本通过；测试注入被阻断；用户取消审批后敏感工具的函数体没有执行；受污染工具结果无法进入模型；风险输出在首个文本片段发出前被截住。
3. **Skill 与轨迹。** 原生 `skill` 和 `/skill` 分别验证允许、需复核、拒绝及目录越界。被扫描的包在加载前发生变化时拒绝。可从工作区定位该次轨迹并验证完整性。
4. **组件异常。** 模型缺失、服务超时、端口被占用时显示具体组件及恢复方法；没有组织身份时区分 AgentGuard 存活和业务请求被拒绝。
5. **安装可靠性。** 中断下载可续装，重复安装没有双重钩子，旧 overlay 迁移保留其他配置。模拟升级失败可恢复旧版本，多实例卸载互不影响。

现有验证脚本可复用其用例与断言。首版发行验收须额外覆盖**安装后的真实产物和用户平时的启动方式**，并至少有一次真实对话验证工作区与审批体验。[防护管线验证](../scripts/verify_deepseek_harness.mjs) · [轨迹验证](../scripts/verify_harness_trajectory.mjs)

## 6. 发布渠道

首发交付签名 Windows 安装器、预构建 `.tgz`、校验摘要、兼容性清单和升级说明。后续可将同一 bundle 发布到 npm，或向团队提供 HTTPS 插件索引，供已准备好运行时的用户通过 Harness 插件页发现和安装。对应上游版本需要先启用实验性的自定义插件索引，并手动添加索引源。[上游插件索引说明](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/docs/user/guide/plugin-market.zh.md)
