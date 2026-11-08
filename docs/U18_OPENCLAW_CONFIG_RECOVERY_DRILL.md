# U18 配置恢复演练设计

资产：现网 `%USERPROFILE%/.openclaw/openclaw.json`；可用 `OPENCLAW_CONFIG_PATH` 覆盖；batch 为 `.runtime/config-batch.json`（本包只识别、不改）；私有备份根 `%USERPROFILE%/.openclaw/backups/`；证据 `local-validation/u18-openclaw-recovery-drill/<ISO-UTC>/`。

流程：断言宿主 2026.7.1-2 → wx 创建私有备份 → SHA-256 → 默认在私有副本追加换行作字节探针 → 校验备份与目标期望哈希 → 恢复副本 → 校验原字节。dry-run 不修改现网；`--live` 才在现网追加 JSON 合法空白并强制恢复。两种模式都验证恢复算法，报告区分恢复对象。并发修改时不覆盖外部更新，失败非零、保留私有现场。

接口：`backup_openclaw_config.mjs [--config 路径]` 输出备份路径、SHA；`restore_openclaw_config.mjs --backup 路径 --target 路径 --expected-hash SHA --target-hash SHA` 双哈希检查后恢复；`drill_openclaw_config_recovery.mjs [--live]` 一键报告。备份可兼容 U7b 原始字节文件，必须提供其已知可信哈希。

记录字段：timestamp、host_version、config_path、backup_path、sha256_before、sha256_after_change、sha256_after_restore、restored、passed、operator_notes，另有 mode、restore_target、live_unchanged。证据只有元数据/哈希，不分发完整配置或秘密。备份哈希错、目标并发变化、恢复不一致均退出非零。

结束必须恢复到本轮起点；起点包含什么 U7b 登记就保留什么，不回滚到历史版本。默认演练不重启；显式 live 空白探针恢复后先查哈希，再按原方式重启固定版本网关（不清会话）。

## 阶段 A 自检

- [x] 设计含备份、哈希、一键恢复、记录格式。
- [x] 秘密留私有目录，不进 git/证据包。
- [x] 默认 dry-run；live 结束恢复原字节，外部并发变化时停止而不覆盖。
- [x] U7b 私有备份以可信哈希兼容，不改变通知登记。

## 复跑

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts/drill_openclaw_config_recovery.mjs
# node scripts/drill_openclaw_config_recovery.mjs --live
node --test scripts/test_config_recovery.mjs
```

运维口径：先备份并记哈希，恢复前核对备份和当前目标，恢复后再核对原字节。

## 本轮结果

PASS；dry-run 与故障单测均退出 0，未执行 live。私有副本恢复后哈希与起点一致，现网字节不变。证据：`local-validation/u18-openclaw-recovery-drill/2026-11-08T07-11-24-921Z/drill-report.json`。
