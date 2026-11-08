# Codex 提示词 U4：身份边界产品态文案与守卫

## 角色与仓库
`F:\揭榜挂帅\GovAgentSec`，OpenClaw **2026.7.1-2**。默认不 git push。

## 背景
`docs/DELIVERY_ACCEPTANCE.md` 已明确：正式业务身份未配置；开发身份默认停用；不能宣称完成组织身份验收。演示常用 `loopback_static_dev`。需要把这一边界做成 **产品可见的守卫与文案**，避免评委/用户误判。

## 目标
1. 在工作台 / 待审批 / 防护设置显著位置显示身份状态徽章：
   - `未配置组织身份（OIDC）`
   - `演示身份（非生产）`（仅当检测到 loopback/dev 演示配置）
   - `组织身份已启用`（OIDC 就绪时）
2. 无 OIDC 时：
   - 执行类、自批、开发审批控件保持禁用（已有逻辑则加固，不要回退）
   - 文案说明如何配置（指向 `DELIVERY_ACCEPTANCE.md` / 维护文档），不提供「一键假装已生产」开关写进默认配置
3. 若保留本地演示开关：必须 **显式、默认关、写审计**，UI 标红「仅本机验收」。
4. 测试：扩展 `scripts/test_identity_boundary.py` 与面板测试，断言默认禁用与徽章文案。
5. 文档：`DELIVERY_ACCEPTANCE.md` 增补「UI 身份徽章」；`UPGRADE_ROUND_VALIDATION.md` 记录。

## 约束
- 禁止用网关管理员令牌冒充业务身份执行受管工具。
- 不在仓库提交真实 issuer 密钥或用户 token。

## 验收命令
```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
.\modules\agentguard-group2\.venv\Scripts\python.exe scripts\test_identity_boundary.py
node scripts/test_workspace_ia.mjs
```

## 完成定义
徽章与禁用态正确、测试通过、文档更新。
