# 本人确认与受管资料身份贯通

本轮按用户要求，仅覆盖登记的合成受管资料；不扩大电脑目录访问权限。最高账号 `admin / Demo#Admin26`，最高密级且具有 security_admin，可读取公开、内部、机密、秘密及受保护资料。既有 weihu 保持最高等级能力。

## 使用路径

演示账号每次成功登录有效 30 分钟。身份源的自动关闭时间同步延长至本次登录到期，避免旧的 15 分钟进程计时器提前撤销登录；已有凭证不续期，错误密码不延长有效期。退出、切换账号、关闭身份源仍撤销相应委托。动作确认仍为 60 秒，一次性执行票据仍为 30 秒。

会话顶部登录账号 → 直接发起任务 → `gov_read_document(document_id)` 按本会话登录身份检查 → 如需确认，暂停原工具调用并显示「允许一次／拒绝」卡片。同一请求也在动态权限「待我处理」中出现。任一入口处理均更新同一请求；重复处理、超过 60 秒、账号撤销或切换均不能继续执行。

本地演示的「本人确认」与正式双人业务审批分开记录。生产审批服务、D105 规则和其他未启用该模式的实例保持原行为。本人确认只能由已验证请求发起人，对服务端保存的原动作进行；OPA 的 D004、D005 等硬拒绝不能被确认覆盖。管理员保留 OpenClaw 原生危险操作确认。

动态权限分为「待审批」和「执行回执」两个区域，各自筛选。待审批仅显示仍有效的待处理请求；已批准、执行成功/失败、拒绝、阻断和过期记录归入执行回执，已批准不等于已执行。会话实时确认卡片只显示本人的有效待确认请求。两处继续使用原审批接口和权限检查，回执不能重复批准。

## 实现

- 独立 MCP 曾使用与页面不同的静态身份。新增插件工具 `gov_read_document` 复用同一身份 worker、OPA、动作摘要、HMAC 单次票据、Wasmtime 及 DocumentReader；准备与执行两阶段之间不传凭证给模型。
- 工具参数仍只有 document_id。原 MCP 独立服务保留，但工作区关闭其读文档入口，避免同一文档经过两套身份。其他独立 MCP 工具不因此自动获得当前身份委托。
- 待确认请求经原身份 RPC `resolve` 处理。本人确认是演示 worker 的私有能力，默认测试/独立服务不开启；产品 worker 明确开启。授权只针对当前主体和完整动作摘要，签发单次票据后撤去临时授权。
- 文档正文作为工具文本返回且继续通过既有结果防护。内部协议状态与正文不重复拼成 JSON；并未为工具或内容添加扫描豁免。
- 读取正文不进入审批列表、身份审计或配置变更报告；列表保留 document_id、密级、判定、确认人与执行状态。

## 验证与复跑

审批分区前端回归（隔离合成状态，真实 UI 组件；不启动模型、不修改网关配置）：

```powershell
node scripts/test_u24_materials_ui.mjs local-validation/approval-sections/recheck
```

覆盖混合状态分区、独立筛选、批准/拒绝后的迁移、超时不显示审批按钮、完成记录深链、会话范围与空状态。2026-11-09 结果：`local-validation/approval-sections/20261109-ui/report.json`，截图 `04-pending-and-receipts.png`。

```powershell
$env:PYTHONUTF8='1'
$env:PYTHONPATH="$PWD/scripts"
.\modules\agentguard-group2\.venv\Scripts\python.exe -m unittest test_personal_document_flow
$env:GOV_PERSONAL_EVIDENCE='local-validation/personal-confirmation/recheck'
node scripts/test_personal_confirmation_live.mjs
```

真实冒烟使用固定 OpenClaw 2026.7.1-2、隔离配置、Docker、本机确定性测试模型。验证最高账号五份资料实际读取、会话卡片及动态权限本人确认、拒绝与超时；读取计数由独立底层文件观察器记录。报告须 PASS 后才能声称交付。原生产模型表现不在这条确定性测试的结论内。

部署使用 `scripts/deploy_personal_document_tool.mjs <证据目录>`，先在用户私有 `.openclaw/backups` 备份并核验哈希，再仅替换工作区读文档工具入口。其他 MCP 工具、模型账号、输入防护、沙箱引擎不变。此部署脚本不升级宿主；整套发行已有固定版本适配层，备份及发布流程见根目录说明。
