---
name: grid-anomaly-diagnosis
version: 1.0.0
description: Analyze A园区 September 2024 electricity anomalies using the registered grid_curves and approved grid_records documents; produce evidence-linked charts and a diagnosis report with gov_analyze_grid.
scope: grid-demo
---

# 企业用电异常诊断与报告生成

## 适用任务

分析 A 园区 2024 年 9 月用电异常，区分采集质量问题、检修记录吻合及原因待核查，输出来源可核对的诊断报告与图表。

## 执行步骤

1. 调用 `gov_read_document`，`document_id` 为 `grid_curves`，读取登记的匿名用电曲线。
2. 调用 `gov_read_document`，`document_id` 为 `grid_records`，读取已获批的生产检修记录。若权限不足，停止并说明需在资料库申请授权。
3. 调用 `gov_analyze_grid`，`period` 为 `2024-09`。工具会再次核验两份资料的当前访问权限，检查采集完整性、定位下降、关联检修并生成报告与图表。
4. 根据工具返回的真实分类、证据和核查建议，用中文概述结果，并附原网关返回的报告链接。

## 数据与结果约束

- 只使用 `grid_curves` 与 `grid_records`，不读取其他园区，不调用邮件或外发工具。
- 采集缺失不当成零电量；证据不足保持待核查，不推断企业经营恶化。
- A 园区为演示组织，检修与采集事件含合成背景；引用时区分原始曲线与演示记录。
- 原表未注明单位，使用“原表电量单位”，不改写为 kWh。
- 工具失败或授权拒绝时如实报告，不改路径、不尝试绕过。
- 版本与内容摘要以 `gov_analyze_grid` 返回的实际加载信息为准。
