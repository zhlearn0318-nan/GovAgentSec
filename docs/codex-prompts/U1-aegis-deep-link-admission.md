# Codex 提示词 U1：Aegis 深链与安装前阻断可演示

## 角色与仓库
你在 Windows 仓库 `F:\揭榜挂帅\GovAgentSec` 上开发。宿主锁定 OpenClaw **2026.7.1-2**，禁止升级。用户偏好：只改实现与文档，默认不要 git push。

## 背景
政安纵深「供应链/安装前」能力依赖 Aegis 安装策略与联合准入。当前评委路径上，**深链打开插件/面板**或未授权访问时，容易表现为含糊 **401/空白**，不像权限闸门那样有中文原因码与可截图回执。需要把「安装前阻断」做成与闸门同级的可演示硬路径。

## 目标（必须全部完成）
1. 定义并实现至少 **2 条可复现阻断路径**（真实系统，禁止假页面）：
   - **未授权深链**：未带有效一次性页面凭据 / 匿名访问敏感 Aegis 或联合准入面板 → 返回明确中文页（或面板内错误态），说明「需要管理员签发的一次性访问凭据」，并保留 HTTP 401/403 语义；页面上有原因码（如 `UI_PAGE_TOKEN_MISSING` / `UI_PAGE_TOKEN_EXPIRED`）。
   - **安装策略阻断**：对一个明确标记为高风险的样例 Skill/插件包（可用仓库内已有 fixture 或最小合成包），走真实 `security.installPolicy` / Aegis+Group4 联合准入，结果为 **阻断**；控制台/能力接入页展示中文原因与报告入口。
2. 在 **能力接入** 或 Aegis 嵌入面板中，阻断结果与放行结果并列可读：决策、原因、报告链接/ID、时间；不暴露密钥。
3. 补自动化：
   - Node 或 Python 测试覆盖：匿名深链被拒；过期/二次使用 token 被拒；样例包联合准入返回 block。
   - 可选：生成 `local-validation/aegis-admission-demo/` 下的简短 `report.json` + 说明 md。
4. 文档：更新 `docs/UPGRADE_ROUND_VALIDATION.md`（若无则新建）写清复现步骤；必要时在 `docs/README.md` 索引加一条。

## 约束
- 不削弱现有鉴权；不要为了演示改成匿名可看审计数据。
- 不要把 401「修成 200 空页」；要 **可解释的失败**。
- 不接外部网络扫描器替代品；联合准入必须走现有 Aegis+Group4 进程路径。
- 中文 UI；UTF-8。

## 建议改动区域（可调整，但先调查再改）
- `modules/aegis/**` 安装策略与面板
- `modules/govagentsec-ui/**` 能力接入嵌入
- `modules/supply-chain-group4/**` 联合准入
- `scripts/verify_admission.py`、`scripts/test_panel_access.mjs`、`scripts/install_openclaw_workspace.mjs` 相关测试

## 验收命令（你必须跑并贴结果）
```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts/test_panel_access.mjs
# 若你新增了专用测试，一并运行，例如：
# node scripts/test_aegis_admission_demo.mjs
# E:\Anaconda3\envs\... 或项目说明中的 python：scripts/verify_admission.py
```
手动：浏览器匿名打开敏感深链 → 见中文原因；登录后走样例安装 → 见阻断回执。

## 完成定义
- 上述 2 条路径可复现 + 自动化通过
- 有短文档复现步骤
- 向用户报告：改了哪些文件、如何演示、测试输出摘要
