# 受控合成文档读取实施记录

> 文档状态（2026-11-10）：技术参考：接口/算法和原始证据按本文件的范围解释；阶段页面与账号说明不作为当前使用步骤。当前行为见[系统基准](CURRENT_SYSTEM.md)。

## 已核实的接口

- OPA 现有 file.read/read 已在可信工具和 office_user/records_admin/security_admin 权限内。
- data_levels 为 public=0、internal=1、confidential=2、secret=3。现有 D004 按 clearance 比较，D005 按受保护 URI 前缀检查，A004 对 confidential 及以上要求审批。
- EnforcementGateway authorize 使用 OPA 摘要与独立 action_digest 比对，再签一次性执行票据；dispatch 在进入 Wasm 内核及业务适配器前核销票据。应复用此路径，不能在 MCP server 直接读取文档。
- MCP client 生成 request_id/task_id、主体和 context，调用固定 /invoke；工具参数只能用于选择服务端 registry 中的 document_id。
- 现有审计记录完整 result，MCP 请求缓存也保存 receipt。新工具必须在这些持久化位置移除 document 正文，不能只在前端隐藏。
- 当前正式身份默认停用开发身份；演示身份只能使用隔离测试环境，不改变现有正式身份配置。

## 实施顺序

1. 服务端固定 registry 和明确标注的合成文档，路径限制与读取计数。
2. 网关校验 action 与 registry 一致，沿用 OPA、摘要、票据核销、隔离执行；审批等待保留原策略 reason_codes。
3. MCP 新工具严格 document_id 单参数，结果白名单输出；状态/审计剥离正文。
4. 更新审批展示与受控工具列表，不开放旧工具权限。
5. 使用真实本地 OPA 和 HMAC/SQLite 票据运行全部拒绝零读取、审批、并发/过期/篡改与路径逃逸测试，再接入演示。

已完成核心实现与隔离本地验证；运行中的审批、身份和 MCP 配置未修改。验收范围与限制见 CONTROLLED_DOCUMENT_VALIDATION.md。
