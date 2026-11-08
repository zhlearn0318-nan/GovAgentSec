# U16 演进发布闸的本地稳定性

## 阶段 A：演示路径

同任务多轨迹 → 本地 Ollama / 明示的本地启发式 → 先安全隔离，再按质量 TopK → Workshop 候选 → Aegis/Group4 allow 或 block → 人工复核回执。`admission_passed` 不等于安装；不新增 auto_install。

| 场景 | 系统行为 | 评委话术 | 实际检查 |
| --- | --- | --- | --- |
| 无组织 OIDC | 现网人工确认禁用；仍显示评分、隔离、allow/block | 当前只展示门控结果，未安装 | test_evolution_release_gate_live.mjs、test_evolution_release_gate_ui.mjs |
| 全网络断开 / Ollama 不可用 | 本地启发式回退，来源与 not-production 版本入报告；缺失证据隔离 | 本轮为离线启发式结果，不是生产标定 | check_model_routing.py、test_evolution_gate_degradation.mjs |
| 外部评审误开 | routing 加载拒绝；端点被篡改也不发请求 | 外部评审关闭，错误配置被拒绝 | loadRouting、localEndpoint、localModelFetch |

真实检查点：`modules/model-routing/local-only.mjs` 仅允许字面回环，禁止凭据/别名/重定向；两种 judge 每次发送时复验端点，并检查 Ollama 本地权重，云代理模型不能拿到评审证据。`scripts/test_model_routing.mjs` 已覆盖构造后篡改、真实 HTTP 307、断网和旧新评审器。U16 复用这些检查，不另建网络策略。

U8/U17 会话可用 API，与安全评审是不同路径；本包不改变会话默认模型，不用真实轨迹测试外部 API。测试路由为本地协议夹具；现场已有真实证据只读复制到隔离测试目录，不修改源证据。

`verify_trajectory_release.mjs` 是用户要求的隔离加载器集成测试：它显式确认合成候选并写入测试 workspace/skills，验证更新与回滚，不安装到现网。发布闸 UI 测试则严格断言 loader 为空、无 install/publish 调用。两种结果不能混写为“候选自动发布”。

非目标：不做论文级重新标定，不宣称复现 DeepSeek 阈值或曲线，不接组织 IdP。演示源登录也不自动获得生产发布资格。

- [x] 三行降级矩阵齐全，说明来源及禁用行为。
- [x] 防外发检查点关联真实模块、脚本与运行时篡改/重定向测试。
- [x] 无 auto_install；区分隔离加载器测试与现网安装。
- [x] 话术遵循 UI 的“仅提交复核”“未安装”“需 OIDC”边界。

## 复现与证据

仓库根目录：`node scripts/verify_evolution_gate_demo.mjs`。顺序运行模型双轨检查、隔离 release loader、既有演进单测、U3 UI、现网只读发布闸和断网矩阵。新证据在 `local-validation/u16-evolution-gate-stability/<ISO-UTC>/`，非零退出即失败。

## 三句话术

1. 会话模型可以接 API，轨迹评审始终留在本机，错误的外部评审端点会被拒绝。
2. Ollama 不可用时明确回退本地启发式，评分注明非生产标定，证据不足的轨迹继续隔离。
3. 联合准入通过只表示候选可进入复核；当前没有组织身份，不会安装到正式技能目录。

## 本轮结果

`node scripts/verify_evolution_gate_demo.mjs` 退出 0，六组检查全部 PASS：`local-validation/u16-evolution-gate-stability/2026-11-08T08-17-16-950Z/report.json`。九条合成断网样本有 pass 和 quarantine，Q 有缺失及多个取值；现网发布闸所有确认按钮禁用，另有真实证据副本的六轨迹 allow/block UI 截图。没有修改产品代码，本包仅增加验收脚本、时间戳输出及文档。
