# 内部资料库：导入资料与密级

## 使用

1. 在动态权限或会话资料权限中，以管理员账号登录。
2. 内部资料库点击“导入资料”，选择文件，填写资料名称及保密等级，点击“确认导入”。
3. 导入成功后列表显示资料名称、密级和自动生成的资料编号，可在对话中提供该编号读取。
4. 管理员可点击已导入资料右侧的“删除资料”，确认后删除；取消则保留资料。内置演示资料不提供删除入口。

支持 UTF-8 TXT、Markdown、DOCX；单文件最大 256 KB，提取正文最大 32 KB。DOCX 只提取正文文字，包含正文表格中的文字，不运行宏、不加载外部链接；图片、格式、页眉页脚和附件不会被导入。PDF、旧版 DOC 和扫描图片当前不支持，需转换为支持的文本格式。

## 权限

| 密级 | 当前账号读取范围 |
| --- | --- |
| 公开 public | 具备业务读取权限的账号 |
| 内部 internal | 中级主管及以上 |
| 机密 confidential | clearance≥2；仍按策略确认 |
| 秘密 secret | clearance≥3；仍按主体和策略决定 |

导入需要服务端验证的 workspace_maintainer 角色，且不可选择超过自身 clearance 的密级。低权限账号只能查看已有权限清单，不能通过调用接口绕过导入限制。密级由管理员明确选择；系统不从正文自动推断，也不能验证人工定密本身是否准确。

## 如何读取

使用现有 `gov_read_document(document_id)`。上传时只持久保存资料，读取时仍执行：可信身份 → 服务端登记密级/资源 → OPA → 当前任务权限 → 必要时确认 → HMAC 票据 → 原子核销 → 受控读取 → 审计。模型不能提交路径或覆盖密级。

新增资料在下一轮对话按当前账号权限纳入；已开始的任务不静默扩权。最高演示管理员沿用原有原生审批模式，普通主体的敏感资料仍按 A004 等规则确认，D004 密级硬拒绝不能靠批准绕过。

身份源关闭或网关重启不会删除资料；旧登录凭据仍按原规则撤销。导入 ID 不可指定，不覆盖已有资料。删除后旧任务、未消费票据和待审批请求均不能继续读取该资料；已经返回给会话的内容不会被追溯清除。删除不可从页面撤销，需要重新导入才能恢复。当前未提供改密级、批量导入及全文搜索。

## 存储与数据边界

资料正文在本机独立库 `.runtime/identity-demo/materials/documents.sqlite` 中持久保存（自定义 worker root 时位于其 materials 子目录）。该目录不提交 Git。保留名称、密级、正文校验哈希、导入者和时间；原始上传文件不另行保存，只保存提取正文。磁盘存储不是加密保险库，继续依赖宿主文件权限。

上传和解析不调用外部 API；后续用户主动让 Agent 读取时，正文会成为该会话的工具结果，按会话所选模型处理。导入功能没有把外部模型切换成本地模型。

审计及权限摘要只记录资料编号、密级、操作状态等元信息，不记录正文或上传 Base64。返回内容沿用现有手机号、身份证号、口令等基础脱敏。导入资料不冒称合成数据；本分支登记三份电网资料，其样本与合成背景说明见[比赛版说明](COMPETITION_DEMO.md)。

## 接口与验证

- 认证网关 RPC：`govagentsec.demoIdentity.document_import`。
- 删除 RPC：`govagentsec.demoIdentity.document_delete`，只接收 `document_id` 和会话自动附加的 Bearer。服务端独立校验管理员角色、密级和登记 ID，仅删除导入库记录并保留删除审计。
- 业务参数：`filename`、`title`、`data_level`、`content_base64`；Bearer 由当前登录会话自动附加，不接受主体、资源、审批或票据字段。
- 成功仅返回 `{status:"ok", document:{document_id,title,data_level,imported:true}}`，不返回正文或存储路径。
- 实现：`enforcement/document_library.py`、`enforcement/documents.py`、现有身份 worker、`govagentsec-ui/library-summary.mjs`。

在完整仓库根目录运行：

```powershell
$env:PYTHONUTF8='1'
$env:PYTHONPATH="$PWD/scripts"
.\modules\agentguard-group2\.venv\Scripts\python.exe -m unittest test_document_import test_grid_document_access test_business_adapter_startup
node --test scripts/test_u22_identity_session.mjs
node scripts/test_document_import_ui.mjs
```

后端覆盖四种密级、拒绝零读取、敏感资料确认后一次执行、重放、越权导入、字段伪造、路径输入、正文大小、DOCX、持久化、审计脱敏、OPA 故障和账号撤销。UI 测试通过真实私有 worker 与注册 RPC 处理器上传合成资料，验证切换账号、无权读取和表单轮询稳定性；不调用模型、不修改现网资料。
