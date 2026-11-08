# Codex 提示词 U16：自演进门控演示稳定性（轨迹不出域 + 降级话术）

## 0. 角色与目标

仓库：`F:\揭榜挂帅\GovAgentSec`。OpenClaw **锁定 2026.7.1-2**。不 push。

**缺口（项 5）**：经验自演进 / 发布闸演示需稳定可复现：**轨迹不出域**、**本地评审**；准备 **无 OIDC / 断网** 时的降级话术与可跑检查。对齐 U3 发布闸（`admission_passed ≠ 安装`）与 U8 模型双轨（`docs/MODEL_ROUTING.md`）。

---

## 1. 硬约束

1. 轨迹正文、评分证据、候选 Skill 内容 **禁止**发往外部 API（含 DeepSeek）；评审只走本地 Ollama/启发式/fixture（测试）。
2. 候选 **禁止自动安装**；状态机无 `auto_installed`。
3. 无组织身份时：发布闸「人工确认」可禁用，但演示仍能展示评分/隔离/block 原因（与 U3/U4 对齐）。
4. 不升级 OpenClaw；不 push。
5. 复用：`modules/trajectory-governance/`、`modules/govagentsec-trace/`、`modules/model-routing/local-only.mjs`、`scripts/check_model_routing.py`、`scripts/verify_trajectory_release.mjs`、`scripts/test_real_evolution.mjs` 等——先查仓库实名再接线。

---

## 2. 阶段 A — 设计

写出：

**`docs/U16_EVOLUTION_GATE_DEMO_STABILITY.md`**

必须包含：

1. **演示主路径**（有本地 Ollama / 有标定数据时）：多轨迹 → 本地打分 → TopK → 候选 → allow/block → 确认不安装。
2. **降级矩阵**：

| 场景 | 系统行为 | 评委话术 | 可跑检查 |
| --- | --- | --- | --- |
| 无组织 OIDC | 确认按钮禁用或仅审计；仍可看 block/allow | 「发布需业务身份；当前展示门控结果，未安装」 | U3 UI 测试 + 身份边界 |
| 断网 / Ollama 不可用 | 回退本地启发式并标明来源；或使用已存 report fixture 演示 | 「评审离线回退；非生产标定」 | check_model_routing 断网项 |
| 外部评审误开 | 默认必须关；若有开关须二次确认且不进默认发布闸 | 「对照关闭」 | 静态断言无外发 |

3. **防外发检查点**：`local-only`、评审 endpoint 回环、运行中篡改 endpoint、重定向拒绝（对齐 MODEL_ROUTING）。
4. **与 U8/U17 边界**：会话可走 API；本包只保证演进/评审路径本地。
5. **非目标**：不重标定论文级分数；不宣称复现 DeepSeek 曲线。

### 阶段 A 自检

- [ ] 降级矩阵三行齐全
- [ ] 防外发检查点列出真实模块/脚本
- [ ] 明确无 auto_install
- [ ] 话术与 UI 文案一致

---

## 3. 阶段 B — 实现 / 检查固化

### 切片 1：稳定性检查脚本

- 新增或扩展例如 `scripts/verify_evolution_gate_demo.mjs`（名称可自定），串联：
  - `python scripts/check_model_routing.py`
  - `node scripts/verify_trajectory_release.mjs`（或仓库等价）
  - 演进/发布闸 UI 或单测（U3 已有则调用）
- 断言：评审配置为回环；外发探测失败；无 install；block 样本可见。

### 切片 2：无 OIDC / 断网演练记录

- 按降级矩阵实际跑一遍（可用 fixture）；产出 JSON + 简短中文记录。
- UI 截图：发布闸面板、未安装文案、确认禁用（无身份时）。

### 切片 3：文档与话术

- 更新 `docs/REAL_MULTI_TRACE_EVOLUTION.md` 或 `TRACE_SCORING_AND_EVOLUTION.md` 增加「演示稳定性与降级」。
- 讲稿三句写入设计文档末尾。

证据：`local-validation/u16-evolution-gate-stability/<ISO-UTC>/`

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
python scripts\check_model_routing.py
node scripts\verify_trajectory_release.mjs
# 本包汇总：
node scripts\verify_evolution_gate_demo.mjs
```

---

## 4. 非目标

- 不把会话模型改回默认本地（那是 U8 叙事反面）。
- 不自动安装候选 Skill。
- 不接组织 OIDC（无身份降级即可）。

---

## 5. 完成后中文简短交付说明

检查脚本、降级演练是否通过、证据目录、三句话术、是否改产品代码。
