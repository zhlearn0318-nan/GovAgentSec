# U24 任务材料与过期审批恢复

阶段A，2026-11-09。沿用现有DemoIdentity/ChatAcl、OIDC验证、TaskPolicies、OPA、HMAC和审批存储，不改公式或TTL，不修改现网配置。

- `materials(session_key)`：已绑定同一委托后返回服务端REGISTRY材料ID、名称、密级和当前策略可选性，不返回路径或凭证。
- `select_materials(session_key, material_ids)`：只接受登记ID，先整体核对主体权限，再原子保存本会话明确选择；运行中拒绝。选择优先于提示词推断，模型不能扩大。
- 多材料复用现有精确参数契约，每项材料建立独立既有task_id并映射当前run；基础空范围契约处理未选动作并走原P014/审批。不重写TaskPolicies的grant结构。
- `task_reapply(request_id)`：仅原请求人、仍绑定同一委托、已过期且未消费的原生聊天授权可创建新请求/新契约。新请求复制服务端快照，重新OPA与任务审批；旧请求、旧票据墓碑保留。新批准替换该动作当前重试指针，旧票据仍由原核销链拒绝。
- 补只读状态查询MCP工具映射，实际结果仍由原MCP状态仓库鉴权，不伪造成文件读取。

自检：参数白名单、主体来自Bearer；无任意路径/主体/票据输入；选择失败不改变旧范围；旧消费不可重新申请；禁自批和30秒票据/60秒审批不变；审批/执行仍分开；异常拒绝。

验证计划：单材料/两材料、prompt越界、混入无权材料、运行中改选、身份隔离；过期新申请新批准后一次成功、旧票拒绝、消费与硬拒绝不能重开；状态工具正确/额外参数拒绝；原U10/U11/U22/U23测试。live由主任务统一调度。

## 实现与结果

服务端只列现有5份合成文档registry；不是生产文件浏览器。材料选择前逐项OPA核对，混入无权材料则整次拒绝，原选择不变。明确选择后，即使新prompt附带另一路径也不会扩大范围；各材料复用现有精确参数契约，无新权限内核。未登记工具仍默认拒绝。

原生过期请求通过新任务契约与新request重新进入既有审批，原票据保持失效，已消费不能重开。UI批准仍只是等待原任务重试；没有自动重放动作或延长TTL。材料接入与过期恢复均保留演示身份标记。

选材后的模型上下文用显式任务草稿：从服务端已确认ID/名称生成“读取已选材料并形成带来源简报”，用户复制、返回聊天核对后发送。不会仅在后台选材却假定模型知道，也不自动调用外部会话模型，不改写用户prompt或宿主提示权限。当前不支持直接从控件发送聊天。

本切片改动：identity/chat_acl.py、identity/demo_provider.py、运行插件demo-identity.mjs、UI demo-identity.mjs/identity-session.mjs、新增scripts/test_u24_materials_reapply.py。未改策略、TaskPolicies、HMAC、宿主、现网配置。

2026-11-09测试：新材料/恢复及U10/U11/U22/U23 Python回归71项通过；身份页内状态10项通过；原U11实际hook回归15项通过。首次受限执行因Wasmtime读取不到主机架构失败，改主机隔离执行；首次合并回归缺scripts导入路径，使用下方PYTHONPATH后通过，未修改产品绕过。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
$env:PYTHONUTF8='1'
$env:PYTHONPATH=Join-Path $PWD 'scripts'
modules/agentguard-group2/.venv/Scripts/python.exe -m unittest scripts.test_u24_materials_reapply scripts.test_identity_task_acl scripts.test_per_user_delegate scripts.test_demo_identity scripts.test_u22_chat_receipts scripts.test_chat_acl_failures scripts.test_u23_approval_projection -q
node --test scripts/test_u22_identity_session.mjs
node --test scripts/test_u24_material_prompt.mjs
node --test scripts/test_u24_mcp_receipt.mjs
node scripts/test_u24_materials_ui.mjs
node scripts/test_identity_task_acl_full.mjs
node scripts/test_u24_materials_live.mjs
```

Hook证据：`local-validation/identity-task-acl-full/2026-11-08T16-27-17-192Z/hook-report.json`。其时间戳使用UTC。现网UI/连续业务验证由U24主交付统一报告，不能将本切片单元验证称为完整发布会通过。

隔离浏览器组件验证：`scripts/test_u24_materials_ui.mjs`，source=`isolated-ui-fixture-real-components`。通过设置开启/登录/绑定→禁选无权限材料→选两份→仅ID提交→确认草稿→复制不发模型→过期新申请→经办不能自批，保存3张真实组件截图。它使用模拟RPC状态；授权有效性由上述真实OPA/JWT测试另外证明，不冒称现网端到端通过。

## 真实 MCP 衔接发现与修复范围

真实脚本 `scripts/test_u24_materials_live.mjs` 创建隔离的固定版本 OpenClaw 网关、独立 AgentGuard 服务和状态目录，只配置本机 Ollama `qwen3:8b`。浏览器调用真实已注册的 `materials/select_materials`，确认公开预案与物资清单，复制任务指令后才显式发起会话。网关配置前后计算哈希；退出时仅清理本次网关进程与经过独有工作区挂载核验的容器。身份标为非生产：任务门使用演示JWT，下游MCP使用独立loopback_static_dev。

首条真实运行 `ef0f620c-7012-4460-851c-9f70c6131f5e` 具有开始、真实模型、两次文档MCP、一次公告MCP和结束，哈希链有效。真实报告为 **FAIL**：`local-validation/u24-task-materials/2026-11-08T16-45-20-628Z/live/report.json`。选材及公告读取成功，但两次文档被下游 `P006_PARAMETER_SOURCE_UNTRUSTED` 转待审批，没有返回正文。

根因：页面DemoIdentity已给主机工具门创建精确材料契约；独立MCP服务为每次调用创建新的`mcp-task-*`，没有相同的可信参数来源。固定宿主的MCP执行层丢弃`toolCallId`，只发送工具名和参数。选材不能据此自动变成另一服务中另一个任务的授权。按动作摘要匹配待授权请求不能区分相同动作的用户、会话和历史请求，因此未实现此类桥，也没有放宽P006、提升开发身份或给模型传授权字段。

下游现有审批入口要求已验证的原动作快照。当前MCP本地记录只有资源和参数哈希；正式OIDC路径的服务端快照不能被页面演示JWT直接复用。未从脱敏记录重建请求、填造审批人或调用结果，不宣称端到端简报已完成。后续需要受信任的逐调用上下文/委托对接，独立评审设计后实现。

这次真实发现同时定位并修复了执行误标：MCP传输成功但`structuredContent.status=pending_approval`曾被记为执行成功。现在只有`executed_isolated`记成功，待审批明确显示“业务服务仍在等待审批，尚未执行”，缺业务回执记未知。原生工具成功判定保持原行为。选材页面说明仍需业务服务核验；未登录的抽屉回执缩为单行登录入口。

最终本地回归：Python **72** 项、Node身份/草稿/业务回执 **16** 项通过；隔离真实UI组件 **11** 项通过，证据 `local-validation/u24-task-materials/2026-11-08T16-53-49-928Z/ui/report.json`。其中新增真实OPA/JWT断言确认待审批回执不是成功且底层文档读取数为0。

误标修复后的真实复跑：`local-validation/u24-task-materials/2026-11-08T16-53-50-145Z/live/report.json`，命令`node scripts/test_u24_materials_live.mjs`，退出码 **1**（业务链未完成，未吞错）。`components`分别记录：选材PASS、真实MCP调用PASS、开始/模型/结束采集PASS、哈希链PASS、待审批未误记成功PASS、业务完成FAIL。真实trace为`b5c082ac-538f-44cf-ab84-facbc965ea80`，25个事件，3次MCP调用，运行36.1秒。两份文档的实际服务回执均`pending/执行false/P006`；主机请求记录均`execution_status=pending_approval`，公告请求为`succeeded`。`03-actual-execution-status.png`已目视核对：两条“等待业务审批/尚未执行”与公告成功分开显示。

报告同时保存`trace.json`（默认哈希内容）、`observed-response.md`（本地模型真实答复，未声称已得到两份文档）、`confirmed-task.txt`（合成材料任务指令）与3张真实截图。`main_config_unchanged=true`，模型仅Ollama本地权重，浏览器外部请求0；本次独立进程和工作区容器均已清理。原失败目录保留。单元测试证明拒绝时底层读取0；真实服务本次通过回执证明未执行，没有声称额外采集了底层文件IO计数器。

## 最终权限复核

独立复核发现重新选材后，旧会话尚未消费的授权可能继续命中旧契约。本轮已收口：确认材料时调用原 `task_contract_authenticated(tighten)` 收紧旧契约为空范围，使原票据绑定的契约版本失效；会话、运行、请求和授权记录携带范围版本，旧待审批、扩权、重新申请均返回 `P023_TASK_SCOPE_CHANGED`。保留票据账本和历史请求，不以删除记录恢复旧票。同一范围的正常跨运行重试保持可用。

新增测试验证旧票直接 dispatch 拒绝、换材后旧动作零读取、旧 pending 不可批准、同范围一次重试仍成功。真实 MCP `isError=true` 包装中的待审批/阻断状态也保留，传输失败不能冒充执行成功。最终联合回归：**75 项 Python、17 项 Node 全部通过，退出0**。

继续复核将重新绑定和退出纳入同一撤权边界：先清除活动会话、推进范围代际、标旧请求失效、保留授权墓碑，再依据服务端保存的task与主体收紧旧契约；不依赖已被撤销的Bearer。撤权故障不会建立新绑定。新增4项后，**最终79项Python通过**，日志为U24证据根目录`identity-final-rebind-tests.log`；正常同范围跨运行重试仍保持。
