# U26 双库与会话运行闸门

> 文档状态（2026-11-10）：历史记录：保留当时的设计、界面或验收结论，不代表当前操作流程。当前行为见[系统基准](CURRENT_SYSTEM.md)。

## 阶段 A：确定的实现

资料来自 `enforcement/documents.py::REGISTRY`；页面只提交 document_id。
工具来自服务端受管适配器目录，MCP 声明先调用既有 Aegis 静态声明分析与决策器，只有 ALLOW 才进入可调清单。原生 read/write/edit/exec 标为“内置受管”，不冒称外部 MCP 准入通过。工具库只覆盖已实现的适配器；外部组件的准入结果不会凭空生成适配器。

每次演示身份源启动重新检查本仓库 MCP 声明，结果写本地准入回执。检查异常、非 ALLOW、未知工具、身份无对应 OPA 权限均拒绝。页面与聊天前置闸门消费同一目录。该声明检查不替代外部组件完整安装扫描，也不证明现网独立 MCP 身份已委托；此边界保留在独立边界文档。

| 资料 ID / 密级 | jingban 经办 (clearance=0) | shenpi 主管 (1) | weihu 管理员 (3) |
| --- | --- | --- | --- |
| emergency_plan / public | allow | allow | allow |
| material_inventory / internal | deny | allow | allow |
| duty_contacts / confidential | deny | deny | allow |
| command_contacts / secret | deny | deny | allow |
| protected_resource / internal + protected | deny | deny | allow |

表中 allow 是身份上限，普通账号仍须任务选材和单次票据。经办越密级固定拒绝，不用审批抬高 clearance。secret 在产品第三级展示，后台仍保持 secret=3。资料正文只读合成库。

用户先前明确要求保留最高演示账号 `openclaw_native_only`：管理员无需另一人审批，但不得绕过 OPA deny、会话绑定、动作摘要、一次性票据、TTL 和 OpenClaw 原生动作确认。此项沿用已有实现，不伪造自批。其余角色越任务须另一位审批人，批准不等于执行。

工具调用次序：绑定/身份 → 工具库与角色权限 → 既有 action 构造 → OPA → 任务范围/审批 → 摘要与票据 → 原有隔离执行 → 审计。未知工具 P024、角色无权 P025、准入未通过 P026；都在底层执行前返回阻断，并携带 runId 写入已有防护事件。危险写入/命令硬规则不放宽。

## 页面与九步流程

1. 动态权限登录（演示身份源默认关）。
2. 查看资料库三级范围和工具库可用/无权清单。
3. 绑定当前聊天，按 ID 选择本次材料。
4. 返回聊天发送短任务。
5. 前置闸门阻断未知工具、无权和越密级动作。
6. 合法身份的越任务动作申请另一人审批；授权后原任务重试。
7. 原有六列调用图和时间线查看防护、授权、实际执行。
8. 需要动态验证时用原 Docker 流程；切 srt 仍需确认。
9. 审计演进本地 Q/S、TopK、候选隔离和联合准入，不自动发布。

本阶段仅在现有动态权限内容中增加双库，不改 shell/workspace 导航。U26 PASS 落盘后才做 U25，届时恢复只读审计账号并复用工具库视图。

## 验证与交付

- 新矩阵测试：三账号 × 五资料，拒绝 read_count 不增加；工具不在库/无权/准入失败在 action/dispatch 前拒绝；OPA 故障关闭。
- 本地真实 JWT/OPA、已有 U10/U11、U22/U23/U24 测试；受新密级收紧影响的用例换成合法身份，不删除安全断言。
- 页面实际 DOM/截图检查双库、阻断文案、加载与空态；不把模拟 UI 数据标为真实业务执行。
- `local-validation/u26-dual-library/<UTC>/` 存 report、changes、测试日志、截图及 DELIVERY。
- baseline 比较配置和宿主文件哈希，确认 2026.7.1-2、U20 未开启、无配置写入。保持既有 dirty files。

阶段A自检：通过，开始阶段B。
