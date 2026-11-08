# Codex 提示词 U18：openclaw.json 哈希备份与一键恢复演练

## 0. 角色与目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2**。不 push；轨迹不外发。

**缺口（项 7）**：U7b 等包改过现网 `%USERPROFILE%\.openclaw\openclaw.json`。需要可重复的 **备份 → SHA-256 比对 → 一键恢复** 脚本/命令与**演练记录格式**，避免演示后配置漂移无法回滚。

参考已有模式：`scripts/apply_notify_tools_live.mjs`（备份到 `%USERPROFILE%\.openclaw\backups\`、`openclaw-hash-before/after.txt`、`restore-steps.md`）。本包要做成**通用运维演练**，不限于通知工具。

---

## 1. 硬约束

1. 不升级 OpenClaw；演练可改配置但**结束必须恢复到演练起点字节**（或用户书面确认保留变更）。
2. 备份目录默认在用户私有 `%USERPROFILE%\.openclaw\backups\`；**不要**把完整含秘密的配置提交进 git。
3. 证据包可含哈希与路径，**不要**分发含 API Key 的完整 json；若需证明，用哈希 + 字段摘录（脱敏）。
4. 恢复前校验备份哈希；恢复后再次校验目标哈希。
5. 版本锁：演练开始断言宿主 `2026.7.1-2`。
6. 并发保护：写入前确认文件字节未在检测后被外部改动（对齐 U7b apply 脚本思路）。

---

## 2. 阶段 A — 设计

写出：

**`docs/U18_OPENCLAW_CONFIG_RECOVERY_DRILL.md`**

必须包含：

1. **资产表**：现网配置路径、batch 文件（若有 `.runtime/config-batch.json`）、备份根目录、证据目录约定。
2. **流程**：preflight（版本/路径）→ backup（flag wx）→ hash before → （可选安全无害探针改动或 dry-run）→ hash after → restore → hash match → 重启网关注意项。
3. **命令/脚本接口**（名称可自定，建议）：
   - `scripts/backup_openclaw_config.mjs`（或 `.ps1`）
   - `scripts/restore_openclaw_config.mjs`
   - `scripts/drill_openclaw_config_recovery.mjs`（串起来并写报告）
4. **演练记录格式**（JSON 字段至少）：`timestamp`, `host_version`, `config_path`, `backup_path`, `sha256_before`, `sha256_after_change`, `sha256_after_restore`, `restored`, `passed`, `operator_notes`。
5. **失败场景**：备份哈希不匹配、目标被并发修改、恢复后与 before 不一致 → 非零退出并保留现场。
6. **与 U7b**：可检测通知工具登记是否保留；本包默认演练结束恢复原点，不擅自保留 U7b 变更除非用户说明。

### 阶段 A 自检

- [ ] 设计含备份/哈希/一键恢复/记录格式四要素
- [ ] 明确秘密不进 git
- [ ] 演练结束恢复策略写清
- [ ] 引用 U7b 既有备份作兼容说明

---

## 3. 阶段 B — 实现切片

### 切片 1：备份脚本

- 读取 `%USERPROFILE%\.openclaw\openclaw.json`（可用环境变量覆盖路径）。
- 写入 `backups/openclaw.before-drill-<stamp>.json`（`wx`）。
- 输出 `sha256` 到 stdout 与证据文件。

### 切片 2：恢复脚本

- 参数：备份路径、目标路径。
- 校验备份哈希（可传 expected hash）。
- `Copy-Item`/`fs.copyFile` 后校验目标哈希 == 备份哈希。

### 切片 3：一键演练

- dry-run 模式：只备份+比对+模拟，不改现网。
- live 模式：做一次**可逆**无害变更（例如仅在证据旁写标记文件，或改一个明确的演练用注释字段——**优先 dry-run**；若改 json，必须是可机器还原的最小变更），然后恢复并断言 `sha256_after_restore == sha256_before`。
- **推荐默认：dry-run 通过即为验收绿；live 需显式 `--live` 且结束强制 restore。**

### 切片 4：文档与交付

- `docs/U18_OPENCLAW_CONFIG_RECOVERY_DRILL.md` 含复制即用命令。
- 更新 `docs/MAINTENANCE.md`（若存在）链到本演练。

证据：`local-validation/u18-openclaw-recovery-drill/<ISO-UTC>/`  
含：`drill-report.json`、`openclaw-hash-before.txt`、`restore-steps.md`、日志；**不含**完整密钥配置正文（可用脱敏摘录）。

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts\drill_openclaw_config_recovery.mjs
# 显式实弹（结束必须恢复）：
# node scripts\drill_openclaw_config_recovery.mjs --live
```

---

## 4. 非目标

- 不升级宿主；不做云备份；不把 openclaw.json 提交仓库。
- 不借演练放宽 toolFilter/身份模式。
- 不清理用户会话状态（除非文档单独说明且默认不做）。

---

## 5. 完成后中文简短交付说明

脚本路径、dry-run 是否绿、是否执行过 live、恢复后哈希是否一致、证据目录、运维一句话。
