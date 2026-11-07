# 受控合成文档验证（2026-11-06）

新增 MCP 工具 read_gov_document，仅接受 document_id。固定 registry 位于 enforcement/documents.py，正文位于 demo_documents；全部为合成数据，不是生产文件接入。

| document_id | 数据等级 | 预期策略 |
|---|---|---|
| emergency_plan | public | office_user 放行 |
| material_inventory | internal | clearance≥1 放行 |
| duty_contacts | confidential | clearance≥2，A004 等待审批 |
| command_contacts | secret | clearance=1/2 触发 D004 |
| protected_resource | internal | 非 security_admin 触发 D005 |

新增 govdoc://protected/ 前缀；原 D004/D005/A004 Rego 逻辑未改变。服务端 registry 决定完整 action，不使用模型路径或正文推断密级。网关额外验证 registry 一致性，之后复用 OPA → action digest → HMAC 票据 → 原子核销 → Wasm 前置门 → 专用目录读适配器 → 审计。候选路径不得为绝对路径、父目录穿越、符号链接、junction 或硬链接。

读取返回脱敏内容；审计不保存 document_content，审批响应及持久化请求回执剥离正文。MCP 不暴露票据、摘要、真实路径。审批摘要增加 document_id 与密级，既有规则及最终状态展示沿用现有界面。关联映射增加 read_gov_document→file.read。

## 命令

在仓库根目录：

```powershell
$env:PYTHONUTF8='1'
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts/test_gov_document.py
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts/demo_gov_document.py
```

演示依次输出公开放行、D004、D005、A004、合法审批执行、G206 重放拒绝、G205 篡改拒绝。累计读取次数依次为 **1、1、1、1、2、2、2**。

## 已运行测试

- 新增 10 项 Python 集成测试全部通过：真实本机 OPA、真实 HMAC/SQLite 票据及 Wasm 内核；public/internal、D004/D005、A004、同人审批、审批过期、审批篡改、一次性审批、执行票据过期、六线程并发重放、OPA 故障、适配器故障、路径/ID 限制、MCP 多余权限参数拒绝、返回字段与正文审计脱敏。
- Windows 没有创建普通 symlink 的权限，使用实际 junction（reparse point）测试逃逸，断言读取次数 0；不是把此项跳过当通过。
- 原身份边界 5 项、安装/规则测试 7 项通过；原轨迹关联及运行阻断 Node 10 项通过。

## 文件

新增 documents.py、4 份合成文档、2 份测试身份、test_gov_document.py、demo_gov_document.py。修改 adapters.py、gateway.py、audit.py、service/app.py、MCP client/server、配置示例、build_config.py、原审批工作流 OPA 可执行文件绝对路径、审计摘要和轨迹关联映射。

## 限制与待补验收

- 本轮验证包含 MCP server → 网关 → 真实 OPA/票据/适配器的进程内集成；尚未完成实际 HTTP/OIDC 签发方和 OpenClaw 浏览器点击审批的端到端验收。没有改动正在运行的身份配置或启用开发身份。
- 专用目录是服务端路径隔离，实际文件读取在 Python 服务进程中进行，Wasm 仅为既有前置门。不能宣称正文读取发生在 Wasm 内存沙箱内。目录必须由服务账户独占写权限；针对恶意本机并发改写祖先目录的完整 handle-based 防竞态仍未实现。
- 审批执行只在 UI 返回无正文回执；没有提供再次获取机密正文的能力，避免重放审批读取内容。
- 测试身份 JSON 仅供显式隔离测试使用，不自动替换 OIDC。正式配置仍默认停用开发身份。
- 未做 git push，未修改远端仓库。当前实现可运行本地隔离演示，不能当作生产文件系统接入验收完成。
