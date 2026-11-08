# 会话执行沙箱方案（Docker + srt 双引擎）

日期：2026-11-07  
宿主：OpenClaw **2026.7.1-2**  
Codex 提示词：[`codex-prompts/U9-sandbox-network-isolation-demo.md`](codex-prompts/U9-sandbox-network-isolation-demo.md)

## 决策
- **引擎 A**：OpenClaw Docker 会话沙箱（必做）
- **引擎 B**：anthropics/sandbox-runtime（srt）安装并接入（必做，非可选）
- **切换入口**：工作台/防护设置在 `docker` ↔ `srt` 间切换，便于对比选用
- **不同**：Aegis Skill 准入沙箱 v2 仍是安装前试跑

## 演示
同一案例两引擎各跑：越界失败 + 界内成功；留分引擎证据。

## 验收
`Ensure-DockerReady` → `Ensure-SrtReady` → 准入 `verify_sandbox_v2` 回归 → `test_session_sandbox_docker` / `test_session_sandbox_srt` → 切换入口测试。

## U9 实现（2026-11-08）

已新增 `modules/session-sandbox` 原生后端插件及工作台/防护设置切换入口。固定宿主保持 2026.7.1-2；Docker 默认启用、srt 0.0.81 已原生安装。切换必须经网关管理员 RPC，保存前备份和校验，保留既有受管工具授权。

完整接线、复跑命令、文件写入范围和 Windows srt 的匿名回环网络残余限制见 [SESSION_SANDBOX_DEMO.md](SESSION_SANDBOX_DEMO.md)。实际证据见 [UPGRADE_ROUND_VALIDATION.md](UPGRADE_ROUND_VALIDATION.md)。不再以尚未启用的配置或静态示意图充当隔离通过证据。
