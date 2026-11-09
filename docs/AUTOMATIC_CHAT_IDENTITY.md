# 会话自动应用身份与资料权限

按用户最新要求，取消产品中的手动绑定、选材和复制任务指令步骤。会话顶部提供当前账号与资料权限入口；动态权限继续查看权限和处理审批，不再布置任务。

同一工作区客户端共用现有 identity-session。发送任意会话的 chat.send 前，先经现有 JWT 通道自动 activate_chat，再发送原消息。覆盖历史会话、新会话和切换账号；不以全局最后登录者覆盖另一个审批窗口的身份。无有效委托、撤销、过期、激活失败或发送前账号变化均拒绝。后台非此 UI 发起的工具调用仍需有效服务端身份关联，不隐式借用其他用户。

activate_chat 幂等；同一委托重复发送不会撤销已有审批票据。另一有效委托正在拥有该会话时拒绝接管，避免独立审批窗口误换任务发起人。原账号退出或切换时，已有全部会话授权与未消费票据撤销，运行中的后续调用不能升级到新账号。

每次新 Agent 运行由服务端 OPA 评估登记资料，建立每份可读资料的只读契约。前端、模型不提交材料列表、密级或角色。自动契约记录 registry_policy 来源，不伪称用户选材；既有自选/显式绑定接口仅保留内部回归兼容，不用于新的产品发送路径。未登记或越密级资料仍拒绝；原生工作区路径、写入、命令、外发及审批链不放宽。最高演示账号 native-only 例外保持。

验证：不同账号×所有登记资料；无选材自动读、越密级零读取；所有会话发送自动激活；并发/切换/撤销/过期/激活失败；另一审批窗口不接管；真实固定版本 OpenClaw 本地模型会话、截图、配置哈希。保留原横向分栏图，该功能不改变宿主版本，不外发轨迹。

## 使用方式

1. 在会话顶部点击账号或「资料权限」，登录当前账号。
2. 直接在任意已有或新对话发送任务。无需绑定，无需勾选材料。
3. 「资料权限」显示服务端提供的可读、不可读清单。经办可读公开资料，主管可读公开与内部资料，高级管理员可读当前登记的五份合成资料。
4. 切换账号后，原账号在此工作区关联的会话与未消费授权撤销；下一次发送自动按新账号检查。进行中的任务不会借用新账号升级权限。

同一浏览器工作区共享登录；独立浏览器窗口不互相替换身份，审批窗口仍以审批人自己的登录为准。刷新页面后需重新登录。默认未启用身份源时，由管理员在防护设置开启现有演示源。

## 接口与边界

- 新增 `govagentsec.demoIdentity.activate_chat({session_key, bearer})`，沿用现有网关认证、JWT 和 worker。只接收会话定位与私有凭证；模型不能指定角色、密级或材料范围。
- `chat.send` 在当前客户端上先调用激活接口，再提交原消息；账号串行切换与身份版本检查避免排队消息借用新身份。业务凭证不进入聊天消息和浏览器持久存储。
- 自动只读契约由 OPA 对 registry 的实际判定产生，来源为 `registry_policy`。原生文件仍使用原生路径契约，不因同名 document_id 误用资料契约。
- 该改动仅覆盖登记资料库；不授予任意电脑目录读取权限。原生工具和独立 MCP 服务继续各自核验，不能把 UI 可读摘要当作已执行成功。
- `bind_session/select_materials` 保留旧客户端兼容；自动会话拒绝手工选材。旧 U24「勾选材料生成指令」验收已由本次自动身份测试取代。
- 本地演示身份仍为非生产身份源；当前改动不接组织 OIDC。最高演示账号保留既定原生确认方式，其余操作的硬拒绝和审批链不变。

## 复跑

在仓库根目录 PowerShell：

```powershell
$env:PYTHONUTF8='1'
$env:PYTHONPATH="$PWD/scripts"
.\modules\agentguard-group2\.venv\Scripts\python.exe -m unittest test_automatic_chat_identity
node --test scripts/test_u22_identity_session.mjs
node scripts/test_u24_materials_ui.mjs local-validation/automatic-chat-identity/recheck/material-ui
node scripts/verify_u26_library_ui.mjs local-validation/automatic-chat-identity/recheck/account-ui
$env:GOV_U22_EVIDENCE='local-validation/automatic-chat-identity/recheck/chat-live'
node scripts/test_u22_login_approval_live.mjs
```

真实聊天冒烟使用固定版本 OpenClaw、隔离网关、Docker、本机确定性测试模型和合成文件；模型不是生产模型。脚本验证自动激活、范围外零读取、独立审批、一次重试、重放拒绝、真实图节点与配置未变，不启用现网演示源。
