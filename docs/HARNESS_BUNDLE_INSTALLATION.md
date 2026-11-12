# DeepSeek Harness bundle 开发版

面向用户的下载、安装与排障见[安装说明](./INSTALL_DEEPSEEK_HARNESS.md)。本文用于管理员和维护者从源码构建、部署。`release.json` 的 `source` 字段记录 GovAgentSec 版本和构建提交。

Harness 宿主仍固定为 `0.2.2-alpha.2`，适配器仍为 `1.0.0-alpha.1` 开发版。该安装器交付 Harness 已接入的防护、扫描、轨迹和工作区能力；上游 OpenClaw 的业务登录、本人确认、沙箱切换等宿主专属流程按本文与接入说明界定。现有部署保持正式 OIDC 待配置，相关业务工具继续拒绝执行；本次未启用演示身份。

实现依据：[插件开发方案](./DeepSeek-Harness插件开发方案.md)。版本 `1.0.0-alpha.1`，精确限定宿主 `0.2.2-alpha.2`。当前交付用于开发验收；安装器未签名，未完成发行版宿主和另一台干净 Windows 的验收。

## 构建与安装

### 生成 GitHub 预发布附件

先按[准备模型与独立 Python](#准备模型与独立-python)生成运行环境。在仓库根目录运行以下命令，将 `<模型缓存目录>` 换成通过锁定清单验证的目录。

```powershell
python scripts/build_harness_release.py `
  --output .runtime/harness-preview `
  --python-artifact .runtime/harness-python/govagentsec-python-1.0.0-alpha.1-cp311-win_amd64.zip `
  --model-root '<模型缓存目录>' `
  --runtime-download-base 'https://github.com/zhlearn0318-nan/GovAgentSec/releases/download/deepseek-harness-v1.0.0-alpha.1'
.\installer\harness\Build-Setup.ps1 -Release .runtime\harness-preview `
  -OutputName GovAgentSec-DeepSeekHarness-v1.0-Setup.exe
```

创建指向构建提交的同名预发布标签，上传 EXE、两个 `.zip.partNN` 分卷，以及包含这三个文件 SHA-256 的 `SHA256SUMS.txt`。安装器内嵌分卷名称、大小与摘要，安装时会逐卷校验，再校验合并后的 ZIP。

### 一键安装（推荐）

使用 `.runtime/harness-release/GovAgentSec-OneClick.exe`：关闭 Harness，双击 EXE，选择**插件安装路径**，点击“安装”，等待完成后重新启动 Harness。安装路径是唯一配置项；它是 GovAgentSec 文件的存放位置，不要求选择 Harness 的程序目录。

该 EXE 内置独立 Python 和 38 个冻结依赖，约 3.15 GiB，可单独复制使用，无须附带 zip 或安装本机 Python。安装器自动查找已安装的 Harness `0.2.2-alpha.2`，使用 `DSH_HOME`（如已设置）或发现的原安装记录，注册到 `web` profile。支持 PATH 中的 CLI/npm 安装与常规源码安装；无法识别宿主时会明确报错。现有模型文件只有摘要匹配时才复用，缺失的锁定文件自动下载；首次安装需保持网络连接。建议所选磁盘至少预留 16 GB 空间。

界面在后台执行校验、环境准备、模型检查和注册，显示当前进度；失败后可重试。只改写本产品标记的配置块。更换安装路径后的注册失败会恢复上一份 bundle 和配置。用户、宿主内置及自定义 Skill 目录自动识别；项目技能目录随 Harness 当前工作目录确定。自动目录模式未声明完整的全局加载根清单，因此候选技能发布保持禁用。

单文件构建命令（先按下文生成完整的 Python 制品与 release）：

```powershell
.\installer\harness\Build-Setup.ps1 -Release .runtime\harness-release `
  -OutputName GovAgentSec-OneClick.exe -Standalone
```

安装器仅在点击“安装”后导出内置运行环境，打开窗口时不解压大文件。安装诊断位于所选目录的 `setup-logs`。下文为管理员及开发者的高级部署方式。

在仓库根目录运行：

```powershell
python scripts/build_harness_release.py
.\installer\harness\Build-Setup.ps1 -Release .runtime\harness-release
```

输出位于 `.runtime/harness-release`：原生 `.tgz`、防护服务源码运行时、`release.json`、`GovAgentSec-Setup.exe` 和 SHA-256 文件。完整构建还包含独立 CPython 与离线 wheels 的 zip。包内收录 JS 依赖闭包、工作区资源、扫描规则与第三方声明；不包含权重、现有凭据或宿主源码。发行元数据精确声明宿主版本；安装依照 [Harness 官方组合包协议](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/docs/user/develop/basic/publish.zh.md)，通过宿主 CLI 注册固定的 `govagentsec-security` 条目。

非单文件构建仍可将小安装器与 `govagentsec-python-1.0.0-alpha.1-cp311-win_amd64.zip` 放在同一目录。普通界面同样只要求安装路径。安装器校验制品后用其中的 CPython 引导，离线创建产品专有 venv；不会更新原 Python 或修改 PATH。该制品约 3.15 GiB，依赖安装后连同缓存约需 9 GiB 空间。它是经过安装 RECORD 校验的开发快照，不冒充上游原始 wheel 的发布证明。

需要指定 CLI、profile、扫描目录等高级参数时，使用下述 CLI 或 `Advanced-Harness.ps1 -ConfigFile <配置文件>`。普通用户无须填写这些参数。环境检查自动合并同盘空间需求，并验证宿主版本、GPU、驱动和真实组件；缺失文件从锁定上游获取并校验。

CLI 同样可以安装或修复。以下路径为示例，请换成本机路径：

```powershell
python .runtime/harness-release/harness_setup.py install `
  --release .runtime/harness-release `
  --dsh-cli 'C:/Harness/bin.js' `
  --python 'C:/GovRuntime/Scripts/python.exe' `
  --scanner-python 'C:/Scanner/Scripts/python.exe' `
  --model-root 'C:/Models' `
  --trustrag-module 'C:/Models/TrustRAG/defend_module.py' `
  --scan-root 'C:/Skills' --loader-root 'C:/Skills'
```

原生可执行文件使用 `--dsh C:/Harness/dsh.exe`；JS 入口使用 `--dsh-cli`。不通过 Shell 拼接执行参数。`--dsh-home` 和 `--profile` 指定安装目标；默认沿用 `DSH_HOME`，profile 为 `web`。自有程序位于 `%LOCALAPPDATA%/GovAgentSec/releases/<版本>-<摘要>`，每个 profile 的配置、令牌和状态按完整目标路径分别保存。

`repair` 使用相同参数，恢复未完成事务后重试。安装使用 profile 锁、暂存资源和摘要校验；注册关闭依赖脚本与自动 peer 安装。旧配置仅替换带有 `BEGIN/END GOVAGENTSEC MANAGED INTEGRATION` 标记的部分，保留其他配置。模型和扫描器探测、宿主兼容检查在切换配置前完成。升级失败重新注册上一份 bundle 并恢复本产品配置，不整份覆盖用户 profile。

安装返回 `restart_required`。随后按原方式运行 `dsh web`；插件先注册拒绝门禁，再启动本实例的服务并执行真实模型请求。无服务、协议不符、非真实模式和无效运行配置均拒绝相关操作。每次启动分配独立回环端口和实例目录；宿主通过 Cordis effect 回收本实例进程和锁。异常终止可能留下无存活进程的所有权记录，安装器仅查询进程状态，绝不按记录中的 PID 终止进程。

## 准备模型与独立 Python

完整离线制品的构建命令：

```powershell
python scripts/build_harness_python.py `
  --protect-python 'C:/VerifiedProtect/Scripts/python.exe' `
  --scanner-python 'C:/VerifiedScanner/python.exe'
python scripts/build_harness_release.py `
  --python-artifact .runtime/harness-python/govagentsec-python-1.0.0-alpha.1-cp311-win_amd64.zip `
  --model-root 'C:/VerifiedModelCache'
.\installer\harness\Build-Setup.ps1 -Release .runtime\harness-release
```

直接依赖在 `installer/harness/runtime-roots.json` 中冻结，完整闭包及每个 wheel 的摘要位于 zip 内 `python-runtime.json` 与 `wheelhouse/requirements.lock`。构建逐文件验证原安装 RECORD，重新生成 wheel RECORD，移除安装器生成的脚本包装和 `direct_url.json` 中的开发机路径，保留模块、数据及许可证。CPython 快照仅收入标准解释器文件，不收入原 `site-packages`。格式遵循 [wheel 规范](https://packaging.python.org/en/latest/specifications/binary-distribution-format/)；安装使用 [pip 哈希检查模式](https://pip.pypa.io/en/stable/topics/secure-installs/)、离线 wheel 与依赖一致性检查，不运行源码构建。

本次冻结的是实际已验证环境：CPython 3.11.9、PyTorch 2.7.1+cu128、Transformers 4.55.4、NumPy 2.2.6、Pydantic 2.13.5 等 38 个分发包。旧 `requirements-protect-lock.txt` 保留供原部署参考，不作为新制品的实际依赖声明。构建和安装均未升级原环境的依赖。

CLI 可用随包引导解释器或本机任一 CPython 3.11 执行安装：

```powershell
python scripts/harness_setup.py preflight `
  --release .runtime/harness-release --dsh-cli 'C:/Harness/bin.js' `
  --managed-python-artifact .runtime/harness-release/govagentsec-python-1.0.0-alpha.1-cp311-win_amd64.zip `
  --model-root 'C:/GovModels' --prepare-models `
  --scan-root 'C:/Skills' --loader-root 'C:/Skills'
# 预检后将 preflight 改为 install；升级/修复使用 repair。
```

预检仅报告状态，不创建安装目录或修改 profile；失败时阻止准备组件与注册插件。受管 Python 的资源清单摘要锚定到 `release.json`，缓存文件也会重新校验。完整环境已保留在产品目录时，修复可以使用缓存，卸载也不要求重新下载 Python zip。受管服务和扫描器隔离外部 `PYTHONHOME`、`PYTHONPATH` 和用户 site-packages。

模型缓存与运行时分开，按 `models.lock.json` 校验每个文件。可从固定上游下载，网络中断后重新执行会复用已完成文件及 `.partial` 的断点。原缓存中只有摘要匹配的文件可复用；原缓存不会被改写。

```powershell
python scripts/prepare_harness_runtime.py --models 'C:/GovModels' --reuse-models 'C:/ExistingModels'
```

不指定 `--reuse-models` 则下载到新缓存。TrustRAG 也从锁定 commit 获取并核验；SimCSE 依赖其原始来源，不随安装器重新分发权重。下载者需要核对所选模型许可。

管理员另有经过审查的 wheelhouse 时，可加 `--venv`、`--python`、`--wheelhouse`、`--requirements` 创建独立环境。requirements 必须带每个依赖的完整哈希；准备中断后可按同一锁文件重试，锁文件发生变化则需创建新版本环境。可选 AgentGuard 仍需要自己的依赖、OPA 和正式组织身份；核心 38 包制品不包括 AgentGuard 的独立业务运行环境。

## AgentGuard

CLI 的 `--agentguard-config` 接受本机 JSON：

```json
{
  "enabled": true,
  "pythonPath": "C:/AgentGuard/Scripts/python.exe",
  "opaBinary": "C:/AgentGuard/opa.exe",
  "ticketSecretFile": "C:/AgentGuard/ticket-secret.txt",
  "serviceConfigFile": "C:/AgentGuard/service.json",
  "oidcTokenFile": "C:/AgentGuard/user-token.txt"
}
```

文件中的机密只以路径提供，应由当前用户 ACL 保护。服务配置使用现有 AgentGuard OIDC issuer、audience 和策略选项。每次启动分配独立 AgentGuard/OPA 端口、审计和票据状态，并禁用开发身份。缺少 `oidcTokenFile` 时仅启动基础服务，不注册业务 MCP；工作区继续区分基础依赖就绪与正式身份就绪。AgentGuard 失败不会开放未经授权的业务工具，也不会关闭文本与 Skill 防护。业务工具仍需组织端配置及独立验收。

## 安装后验证与卸载

`verify_harness_release.mjs` 使用安装 profile 中解析出的 bundle、已启动实例的 `owner.json` 和宿主公共包，在真实模型上验证原生工具管线：

```powershell
node scripts/verify_harness_release.mjs `
  --profile-dir 'C:/User/.dsh/profiles/web' `
  --host-entry 'C:/Harness/bin.js' `
  --config 'C:/User/AppData/Local/GovAgentSec/profiles/目标摘要/runtime.json' `
  --owner 'C:/User/AppData/Local/GovAgentSec/profiles/目标摘要/state/instances/host-进程号/owner.json' `
  --output 'C:/GovEvidence/pipeline.json'
```

它不会调用外部业务模型。安全工具放行、未审批工具不执行、风险输入与输出的真实检测分别断言；输出流必须在第一个片段前阻断。验证报告保持 `interactiveAcceptancePassed: false`；操作者仍需在真实聊天中确认工作区、审批取消、原生 Skill、`/skill`、轨迹归属与候选隔离体验。管线测试不能替代干净机器发行验收。

关闭目标 profile 后卸载：

```powershell
python scripts/harness_setup.py uninstall --dsh-cli 'C:/Harness/bin.js' --profile web
# 或运行开发版安装器：GovAgentSec-Setup.exe --uninstall
```

仅移除目标 profile 的 bundle、受管配置及服务令牌，保留模型、审计和共享发行目录。当前无自动删除共享模型或审计的选项；需要清理时按各 profile 的引用记录人工处理。profile 的 `.govagentsec-install.lock` 若因异常退出残留，应先核对其中安装进程确已退出，再删除该锁并执行 `repair`。

## 正式发行前仍需完成

- 在另一台干净 Windows 上验收独立 CPython、完整 wheelhouse、GPU 驱动及低磁盘/中断场景；当前这些能力已在本机隔离部署中验证，不能代替跨机器验收。
- 使用代码签名证书构建并验证签名安装器；开发版不冒充已签名发行物。
- 在另一台干净 Windows 上，使用发行版 Harness 和最终下载件，完成真实聊天、重启、多实例、故障与回滚场景。
- 按方案 M4 继续覆盖第三方插件安装、远程加载器及动态沙箱；当前强制准入仅覆盖已适配的本地原生 Skill 加载路径。
