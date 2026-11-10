# 验证方法与覆盖范围

验证分为源代码回归、当前服务检查、真实会话冒烟与安装验证。某一项通过不代表全部业务、安全准确率或生产部署已经通过。

## 常用命令

在仓库根目录执行：

```powershell
# 文档、账号说明与源码约定
python scripts/check_current_docs.py
# 安装器配置保留与固定宿主适配
node --test scripts/test_windows_installer.mjs scripts/test_delivery_installer.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test_windows_bootstrap.ps1
# 沙箱权限与切换
node --test modules/session-sandbox/test/*.test.mjs
# 在线服务与实际防护依赖
powershell -NoProfile -ExecutionPolicy Bypass -File .\Verify.ps1
# 四层回归汇总（需要本机依赖）
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Verify-ZhengAn.ps1
```

当前工作区只读巡检：`node scripts/verify_u25_current_workspace.mjs local-validation/workspace-check`。要求网关可用且演示源关闭；脚本不会为了通过而撤销用户正在使用的身份。检查五入口、未登录守卫、总览/设置分区及会话资料入口，不发送业务聊天。

## 实际链路

- 受管资料与确认：[本人确认和文档工具](PERSONAL_CONFIRMATION_AND_DOCUMENT_IDENTITY.md)。断言拒绝时不读文件、批准后单次执行、重放/过期/篡改拒绝。
- 自动身份：[会话身份接口](AUTOMATIC_CHAT_IDENTITY.md)。检查账号切换、撤销、过期、会话关联与服务端权限。
- 真实短链：`scripts/smoke_real_trace.ps1`，使用真实固定宿主与工具；读取自己的运行报告，失败不能用合成 JSONL 代替成功。
- 评分和候选：`scripts/judge_calibration_demo.mjs` 使用合成对抗集；`scripts/evolve_real_demo.mjs` 使用指定的真实证据目录。二者来源和结论分别标明。
- 安装：[安装器验证](WINDOWS_INSTALLER_VALIDATION.md)。EXE 自检只证明内嵌脚本一致，不代表全新机器完成安装。

测试输出放在 local-validation，不提交原始轨迹、Key、令牌或本机配置。历史开发报告已移出公开产品目录，公开文档保留复现方法和能力边界，不发布阶段 PASS 清单来代替现时验收。

## 未完成的验证

仍需单独验证全新 Windows 从下载到首次推理、真实组织 OIDC、生产文件接入、完整业务产物、连续发布会流程和长期稳定性。详细限制见 [ACCEPTANCE_BOUNDARIES.md](ACCEPTANCE_BOUNDARIES.md)。
