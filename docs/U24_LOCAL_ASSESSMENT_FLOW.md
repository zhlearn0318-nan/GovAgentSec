# U24 本地过程评估与候选集合

> 文档状态（2026-11-10）：技术参考：接口/算法和原始证据按本文件的范围解释；阶段页面与账号说明不作为当前使用步骤。当前行为见[系统基准](CURRENT_SYSTEM.md)。

2026-11-09。阶段A：先核对现有scoring、LocalJudge、Workshop和路由，再确定以下接口；不改Q/S公式、阈值比较、TopK分母或联合准入策略。

## 接口

统一前缀 `govagentsec.trace.`。写接口为operator.write；confirmReview继续要求operator.admin与可信设备身份。历史证据只读。

| RPC | 请求 | 结果 |
|---|---|---|
| assessmentStart | task_key、明确trace_ids、judge=ollama或heuristic | job_id、status、total、completed、rows |
| assessmentStatus / assessmentCancel | job_id | 当前作业；取消只停止未开始项 |
| selectionPreview | task_key、trace_ids、可选keep=.9 | rows、selection、snapshot_hash、can_generate、reason |
| generate | name、task_key、trace_ids、snapshot_hash | 原候选与选择证据；集合/快照变化拒绝 |
| historyPacks | 无 | 已登记历史包ID和来源，无任意磁盘路径 |
| list/detail/candidates/releaseGate | 原字段＋可选pack_id | 同一视图可只读查看历史数据 |

服务器路由提供本地endpoint/model；浏览器不能提交endpoint、阈值、calibrated、test_only、命令或凭据。UI作业固定t_star=.75、calibrated=false、版本`ui-process-assessment-v1-not-production`，结果test_only=true，显示“本地过程评估（仅候选）”。沿用LocalJudge的本地权重验证与启发式回退，不宣称生产标定。fixture不开放给UI。

一个服务实例同时一个本地批次；重复相同在途请求返回原job，其他在途请求返回忙。作业回执保存在当前数据目录assessment-jobs，页面离开后继续；网关重启遗留运行态显示interrupted。每项完成前重核证据hash，变化不追加过期评审。异常写明确失败状态，缺字段保留缺失。

选择预览覆盖用户实际选择的全部记录。无评分、失效评分与无效链均显式隔离；safe集合内缺Q仍计入分母。生成绑定事件完整性和评分快照，防止勾选只用于对比、实际却生成任务全集。keep=.9时2条安全只能保留1，页面不得承诺可生成。

历史包固定登记仓库中2026-11-07真实台风6轨迹目录，路径不接受客户端输入；只读展示，不导入、不重评分、不安装、不确认。候选继续由Workshop读取核验内容hash。

## 安全收紧

旧releaseGate允许test_only候选在管理员测试上下文写人工复核回执，虽然不安装。本轮明确test_only候选不能提交生产复核，即便有旧回执也不显示ready_for_review；普通非testOnly候选的原正常复核链保持。

本地过程评估后的候选仍可跑联合准入，准入allow不解除test_only，不创建生产加载文件。评估没有观察到的业务准确性/失败恢复不做保证。

## 验证

`node --test modules/govagentsec-trace/test/assessment-jobs.test.mjs modules/govagentsec-trace/test/release-gate.test.mjs`

覆盖本地评审与风险区分、重复作业、同任务确认、Q缺失分母、2条不足、证据变化、取消、失败/重启回执、RPC权限与非法外部参数、生成快照、历史只读、候选test_only不解除。完整结果归本轮U24总报告。
