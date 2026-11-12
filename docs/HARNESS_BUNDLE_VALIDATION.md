# Harness bundle 开发验收记录

日期：2026-11-08。开发版 `1.0.0-alpha.1`，宿主源码构建版 `0.2.2-alpha.2`，Node `26.7.0`，Windows，RTX 5060 Laptop 8 GiB。

已完成：

- 独立 tgz 解包到中文及空格路径后导入，逐资源核验 SHA-256；制品不包含模型、令牌或仓库外相对引用。
- 通过真实 `dsh plugin --profile web add` 安装，合成配置中恰好一个 `govagentsec-security`；关闭依赖脚本与自动 peer 安装。
- 在隔离 DSH_HOME 下，用普通 `dsh web --no-open --port 3097` 加载包，插件自动创建实例并启动真实模型服务。运行时位于中文、含空格的专用临时目录。
- 使用锁定模型副本验证真实输入、工具结果和输出请求；安装后的 Aegis + Group4 扫描器用合成公开 Skill 完成探测。
- 安装后实际 package + 公共 Harness 原生执行器验证：正常工具放行、未审批敏感函数体不执行、风险输入拒绝、安全输出放行、风险输出在首片段前拒绝。
- 实际 Cordis Context 正常 dispose 后，自有真实模型服务关闭，实例所有权记录回收。Windows 强制终止进程树可能留下无存活进程的记录，后续修复只查询进程，不按 PID 终止进程。
- 实际宿主 CLI 卸载后无 GovAgentSec 钩子，空 profile 仍保留 YAML 数组并能正常合成；模型与审计保留。
- 自动回归覆盖：重复安装、旧配置精确迁移、模拟升级失败恢复、卸载、恶意归档路径与链接、进程存活只读检查、协议不兼容、真实模式探测、实例锁及无效配置拒绝策略。

本地证据：`.runtime/harness-package-smoke/pipeline.json`、`lifecycle.json` 和 `after-uninstall.yml`。该目录只用于测试；未改动用户现有 Harness profile。安装器源码可编译成 Windows exe，当前产物未签名。

回归命令：

```powershell
python -m unittest discover -s integrations/deepseek-harness/test -p 'test_*.py'
node --test integrations/deepseek-harness/test/*.test.mjs
# 在 modules/protect-agent-group1/智能体安全 中：
python -m unittest discover -s tests/integrations -p test_openclaw_sidecar.py
node --test integrations/openclaw/plugin/test/*.test.mjs
```

Harness 回归：62 项 Node 测试通过；Python 16 项执行、15 项通过，1 项因当前 Windows 无符号链接创建权限而跳过。共享 OpenClaw 客户端：28 项 Node 测试通过；sidecar：17 项 Python 测试通过。Windows 受限沙箱会拒绝原子重命名和回环套接字，相关测试在正常用户进程权限下执行后通过。

尚未完成：签名、干净 Windows 发行验收、完整离线 Python 制品、完整安装器硬件预检、正式组织 OIDC、真实业务模型聊天与所有首版人工场景。不得据此声明 M1/M2/M3 的全部发行验收已通过。M4 按设计属于后续阶段。

## 2026-11-09：独立运行时与安装前预检

本轮补齐上一节列出的核心离线 Python 制品和硬件预检。生成含 CPython 3.11.9、38 个冻结依赖及逐资源摘要的 `govagentsec-python-1.0.0-alpha.1-cp311-win_amd64.zip`，大小 3,380,547,751 字节。原防护环境和扫描器环境均未修改；构建时校验源安装 RECORD，新的 wheel 明确标为开发快照，不声明是上游原始发布件。

实测通过：

- Windows PowerShell 5.1 在 Python 输入为空、无已安装产品环境的条件下，从校验后的 zip 引导 CPython 并完成只读预检；没有创建选定安装目录或修改 profile。
- GPU 型号、驱动、RAM、分卷可用空间、合并后的空间需求和缺失模型下载量可见。测试机 GPU 为 RTX 5060 Laptop、驱动 591.74、显存 8151 MiB；新 Python 环境及缓存预计需约 9 GB。模型缓存已有完整校验文件时，报告下载量为 0。
- 在新的中文及含空格目录离线创建 venv，执行哈希锁安装及 `pip check`。标准库来自随包 CPython，PyTorch、Pydantic、NumPy、PyYAML 均来自新 venv；确认 CUDA 可用。
- 新环境真实输入、工具结果、输出及安装后 Skill 扫描器探测通过。未调整防护阈值或模型策略。
- 故意设置无效 `PYTHONHOME`、`PYTHONPATH` 后，缓存修复和普通 `dsh web --no-open --port 3107` 仍能使用受管环境。原始 Python zip 路径不存在时，修复复用锚定到发行清单的本地缓存。
- 安装后的原生工具管线验证通过：安全工具放行、未审批函数体不执行、风险输入拒绝、安全输出放行、风险输出在首片段前拒绝。
- 实际 Cordis dispose 停止自有模型服务并回收实例锁；随后通过 Windows PowerShell 安装入口，在原始 zip 路径不存在且 Python 输入为空时完成卸载。卸载后 profile 正常合成，钩子数为 0，残留测试 sidecar 为 0；模型、审计与共享运行时保留。
- 新增覆盖 RECORD 篡改、wheel 依赖闭包、zip 越界/链接/Windows 路径别名、缓存清单篡改、同卷空间合并、断点大小估算、准备中断重试与预检失败不写配置。

本轮回归：Harness 的 Node 测试 62 项通过、共享 OpenClaw Node 测试 28 项通过；Python 集成测试 29 项执行，28 项通过，1 项因 Windows 符号链接权限跳过；新受管环境中的 sidecar 协议/HTTP 测试 17 项通过。合计 **135 项通过，1 项权限跳过**。

证据位于 `.runtime/harness-managed-smoke/`：`preflight.json`、`environment.json`、`install-result.json`、`repair-result.json`、`pipeline.json`、`lifecycle.json`、`uninstall-result.json` 和 `after-uninstall.yml`；Windows 5.1 入口预检证据位于 `.runtime/harness-managed-ui-check/result.json`。

剩余发行条件：真实代码签名证书、另一台干净 Windows、发行版宿主和真实聊天/全部首版人工场景的验收。AgentGuard 的独立依赖及正式组织身份不包含在核心 38 包制品中，M4 保持后续阶段。`release.json` 继续标记为 development，生产安装器构建仍受签名及干净环境验收条件约束。

## 2026-11-09：EXE 启动目录访问拒绝修复

用户双击安装器时报告系统 Temp 下的解压目录访问被拒绝。原 EXE 引导器只使用一个临时目录；此前验证覆盖了安装脚本与防护管线，但没有完整覆盖 EXE 的实际界面启动入口。

修复后按系统 Temp、当前用户 LocalAppData 缓存、安装器所在目录的缓存依次尝试解压。仅回退到当前用户可写位置，不修改系统目录 ACL，也不请求管理员权限。所有目录均不可写时会提供尝试路径；后续 PowerShell 界面启动失败时保存独立诊断日志。新增 `--diagnose` 仅测试 EXE 解压引导，且可构建明确命名的 `GovAgentSec-Setup-fixed.exe`。

回归证据：在测试专用目录实际设置当前用户只读 ACL，验证自动回退；另覆盖路径是文件、全部目录不可写的情形。实际运行修复版 EXE，观察到“GovAgentSec · DeepSeek Harness 安装”窗口并正常关闭，退出码 0，期间未执行安装。证据位于 `.runtime/harness-release/bootstrap-ui-verification.json` 及 `bootstrap-diagnose.txt`。Python 离线制品内容未变，可继续使用。

## 2026-11-09：单路径一键安装器

新增 `GovAgentSec-OneClick.exe`：普通界面仅有一个可编辑的安装路径，原生 Windows 控件枚举和实际窗口截图已确认。Python 制品作为经过 SHA-256 校验的 EXE 附加数据，用户点击安装后才导出；安装器可从只有一个 EXE 的目录启动。资源访问被拒绝时沿用引导缓存回退，Python 引导缓存则直接放在用户选择的安装目录。

自动识别宿主 CLI、DSH_HOME、web profile、Skill 加载目录、模型缓存及目标 profile 已使用的 pnpm store。不修改全局 pnpm 配置。配置读取只使用安全 YAML 解析器，不执行 `!!js`，不保存提供商凭据。项目 Skill 范围从宿主可信 workingDirectory 服务获得；关闭默认目录时遵从宿主配置。自动范围模式没有声明完整全局清单，候选发布保持禁用。

实际隔离安装暴露并修复了两个已有问题：收紧令牌 ACL 不再请求修改文件所有者，禁止 TakeOwnership 的回归用例通过；带注释的默认空数组 profile 现在正确转换为配置条目，卸载后保留原注释并恢复合法 YAML 数组。安装工作进程异常退出时始终生成非空错误诊断。跨安装目录失败恢复上一份 bundle 和配置的测试通过。

实际完整安装已使用新独立 Python、锁定模型及真实扫描器探测通过，通过原生包管理器注册后配置中恰好有一个防护条目。证据：`.runtime/harness-oneclick-smoke/source-install-result.json`。最终回归为 Python 39 项执行、38 项通过、1 项因 Windows 符号链接权限跳过；Harness Node 63 项通过。独立 Python 与模型来源、未签名和未完成另一台干净 Windows 发行验收的限制保持不变。

最终文件在只包含 EXE 的测试目录中，通过真实窗口设置唯一安装路径并点击安装，重复安装成功且引导器退出码为 0。验证时故意设置无效的外部 PYTHONHOME / PYTHONPATH，独立运行环境仍正常工作。证据：`.runtime/harness-oneclick-smoke/ui-install-verification.json` 与 `actual-window.png`。验收使用测试专用 DSH_HOME，未向日常使用的 web profile 安装测试副本。
