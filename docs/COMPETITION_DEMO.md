# 比赛电网演示版：差异与部署

分支：`demo/competition-grid-20261114`。整理日期：2026-11-14。

本分支保存比赛演示使用的政安智枢系统。场景在原生 OpenClaw 中完成：**资料授权 → 输入防护 → 受管分析 → 报告与轨迹 → 本地评测 → Skill 联合准入 → 人工发布 → 新会话复用**。

## 对比基准

| 项目 | 提交 / 说明 |
| --- | --- |
| 整理前本地分支 | `release/3.0-workspace-20261109` |
| 整理前本地 HEAD | `42c6f76efc1e911d8b6e9c11d597db894f13aaf8` |
| 本次拉取的远端 main | `8be8b4517dc728b7b9c999c10a18957b0e9618e0` |
| 本分支基点 | `8be8b45`，已纳入远端 Windows PowerShell 安装校验修复 |
| 其他远端分支 | 未合并 `DeepseekHarness_release`，它不属于当前电网演示 |

整理前有35个已跟踪文件修改、50个未跟踪文件；先保存本地副本，再新建分支。以下差异以 `8be8b45` 为固定基准，避免今后 main 更新改变对比含义。逐文件清单见[文件清单](COMPETITION_FILES.md)。

## 功能差异

| 范围 | main 基准 | 本地比赛版 | 主要文件 |
| --- | --- | --- | --- |
| 场景与资料 | 台风等通用资料 | 三份电网登记资料、4个匿名计量点、120条日记录 | `modules/grid-demo/`、`agentguard-group2/demo_documents/grid_*` |
| 文件权限 | 按密级、角色、任务范围读取 | 增加精确文件申请、审批、限时授权与执行前复核 | `identity/document_access.py`、`demo_provider.py`、`chat_acl.py` |
| 资料管理 | 固定登记样例 | 管理员导入/删除 TXT、Markdown、DOCX，持久存储及密级校验 | `enforcement/document_library.py`、`govagentsec-ui/library-summary.mjs` |
| Agent 执行 | 通用任务入口 | 两个受管工具；加载已准入 Skill；重新核验输入并生成 HTML/SVG/JSON 报告 | `modules/grid-native/`、`modules/grid-demo/analysis.py` |
| 输入防护 | 原有模型及执行控制 | 增加电网外发绕过组合规则，分别记录模型判断和规则判断 | `grid-input-policy.mjs`、Protect Agent `register.mjs` |
| 轨迹与评测 | 通用 Q/S、候选工坊 | 电网工具证据、预检失败状态、重复取数判定、报告与版本入口 | `modules/govagentsec-trace/` |
| 技能发布 | 隔离候选及原有发布闸 | 限定电网演示目录的人工发布；重验来源、评测、基线和准入摘要 | `govagentsec-trace/grid-release.mjs` |
| 历史审计 | 默认从完整链起点核验 | 支持清理检查点；页面明确标识历史前缀已清理 | Aegis `install_policy_audit.py`、准入管理页面 |
| 业务初始化 | 启动时插入旧演示业务行 | 不自动重新插入已清理的公告/账目 | `enforcement/adapters.py` |
| 启动 | 基础启动入口 | 检查 Docker、沙箱实际执行、服务就绪，复用已启动服务 | `Start-GridDemo.cmd`、`scripts/Start-GovAgentSec.ps1` |

## 文件与数据归档范围

提交源码、基线 Skill、匿名样本、部署脚本、隔离回归测试及使用说明。保留原有模块目录，避免改变宿主插件的相对导入关系。整理时另外去除了新增脚本中的个人账户目录兜底路径，阻止基线部署覆盖已发布 Skill，并让审计检查点测试自行构造临时数据。

| 留在本地的内容 | 位置 / 原因 |
| --- | --- |
| 配置、凭据、模型、依赖 | 用户 `.openclaw`、`.runtime/`、`models/`、虚拟环境和 `node_modules/`；由安装者准备 |
| 会话、授权、业务库、轨迹及报告 | 宿主工作区、`.runtime/`、`live-runtime/`、Aegis data；属于当前演示现场状态 |
| 原始电网表格、视频、字幕、答辩材料 | 仓库外的展示材料目录；不放进系统源码分支 |
| 19个本机脚本 | 文件清单中逐一列出；含历史清理、录屏剪辑、已绑定现场记录的 UI 检查及 U7 实验 |
| U7实验过程说明 | `docs/U7_ABLATION_EXPERIMENT.md`、`docs/U7_PARAMETER_SOURCE_AND_TASK_AUTHORITY.md`；沿用本地归档规则，文档索引明确排除 |
| 本次修改前副本与测试输出 | `local-validation/competition-branch-20261114/`；不上传 |

这19个脚本仍在原路径，新增精确 `.gitignore` 规则防止误提交；没有删除文件或执行历史清理。公开回归测试不依赖这些脚本。旧版已跟踪的测试和资料保留，适用范围见[验证记录](COMPETITION_VALIDATION.md)。

## 数据说明

`modules/grid-demo/data/` 是可复现样本，`modules/agentguard-group2/demo_documents/` 下的两份同内容文件供受管读取使用。120条记录覆盖2024年9月、4个匿名计量点；117个电量值沿用源表，3个值设置为缺失以演示采集故障。检修及采集事件为合成背景，不能用来证明真实企业的异常原因。

样本不包含企业实名、原始计量点编号、地址、坐标和联系方式。`manifest.json` 记录来源文件摘要、行号和缺失覆盖。原表单位未明确，统一使用“原表电量单位”，不把兼容字段名 `kwh` 当成单位证据。

## 启动与首次配置

### 已安装且已配置的比赛机器

在原仓库目录运行：

```powershell
.\Start-GridDemo.cmd
# 只检查和启动服务，不打开浏览器
.\Start-GridDemo.cmd -NoBrowser
```

此入口不清空会话、重置授权或覆盖 Skill。本轮归档没有重新部署现有宿主，原比赛现场配置保留。

### 新机器或从通用版迁移

1. 克隆本分支到长期保留的目录。需要 Windows x64、固定版 OpenClaw、Python 3.12、Node、Docker Linux 引擎、Ollama，以及真实防护模型所需环境；细节见[安装说明](WINDOWS_ONE_CLICK_INSTALL.md)。v1.0 发布附件仅作为通用版参考，不等同于本分支源码。

```powershell
git clone --branch demo/competition-grid-20261114 --single-branch https://github.com/zhlearn0318-nan/GovAgentSec.git
cd GovAgentSec
powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-Windows.ps1 -Plan
powershell -NoProfile -ExecutionPolicy Bypass -File .\Setup-Windows.ps1 -NoBrowser
```

2. 已有固定宿主和依赖、但插件仍指向另一目录时，使用本分支根目录的 `Install.ps1 -SkipDependencies` 更新安全套件路径。安装器会调整宿主配置并保留其备份；迁移前保存自己的配置与工作区。全新安装完成后不必重复此步。
3. 首次安装电网基线并通过联合准入：

```powershell
node scripts/deploy_native_grid.mjs
openclaw gateway restart
.\Start-GridDemo.cmd
```

部署脚本先调用安装策略，只有 `allow` 才写入基线 Skill 1.0.0及准入回执；已有同名 Skill 时停止，避免覆盖已经发布的版本。已有 Skill、只需更新电网配置时，运行 `node scripts/prepare_native_grid_config.mjs` 后重启网关。

配置脚本当前仅支持标准用户 `.openclaw/workspace`。它备份 `openclaw.json.before-native-grid`（首次生成），将主 Agent 设为电网分析、只开放两项受管工具、启用电网候选发布，并移除旧 `gov-evolution-demo` Agent 配置。现有模型、API 凭据和防护钩子保留。自定义工作区应按上述配置项人工核对，不能直接套用。

4. 在防护设置开启演示身份源，依次使用 jingban、shenpi、admin 完成[操作脚本](../modules/grid-demo/README.md)。新机器没有历史授权、轨迹和候选；先真实运行至少三条安全完整的同目标任务，再进行评测和候选生成。

首次安装路径本轮未在空白 Windows 上重跑；本次完成源码与隔离回归验证，不复制已有会话伪造现场历史。

## 版本与演示边界

- 源码基线 Skill 为1.0.0。本机录制曾发布至1.3.0，运行版本以宿主加载记录为准；发布证据不迁移为新机器的准入结果。
- 演示发布范围限定 `openclaw-grid-demo`，生产发布闸保持原有要求。
- 历史前缀清理后的链只能证明保留记录与检查点之间的关系；不能表述为完整、未经清理的历史。
- 1.2.0到1.3.0的录制候选仅改变版本号，展示筛选、准入和复用流程，不构成算法提升证据。
- 当前会话所选外部模型会接收工具返回内容；轨迹评审使用本地路径。
