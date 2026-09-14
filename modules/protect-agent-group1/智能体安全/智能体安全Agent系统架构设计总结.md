# 智能体安全 Agent 系统架构设计总结

## 1. 项目定位

项目目标：构建一个**面向复杂输入链路的多层智能体安全防护 Agent**，覆盖：

- 用户输入（User Prompt）
- 网页内容（Web）
- 文档附件（File）
- 知识库检索结果（RAG）
- 历史记忆（Memory）
- 工具返回结果（Tool Response）

重点防护风险：

- 直接提示注入
- 间接提示注入
- 越狱攻击
- 有害内容
- 工具滥用
- 数据泄露
- RAG / 知识库数据投毒
- 多源输入链路组合攻击

---

## 2. 当前三个安全模型的职责划分

| 模型 | 主要职责 | 建议位置 |
|---|---|---|
| PIGuard | Prompt Injection、Indirect Injection 检测 | 各类外部输入进入 Agent 前 |
| Qwen3Guard | 中文有害内容、越狱、安全分类、输出审核 | Agent 输入与最终输出 |
| TrustRAG | RAG 数据投毒、冲突知识、异常检索文档过滤 | Retriever 后、LLM 前 |

### 2.1 PIGuard

主要负责判断：

> “这段输入是否正在试图攻击、控制或覆盖 Agent 的原始指令？”

适合检测：

- 直接提示注入
- 网页间接注入
- 文档间接注入
- 工具响应注入
- RAG 文档中的恶意指令

但不能单独判断：

- 知识是否真实
- 数据库是否被事实性投毒

---

### 2.2 Qwen3Guard

主要负责判断：

> “这段输入或模型输出是否包含越狱、有害内容或其他内容安全风险？”

主要承担：

- 中文越狱检测
- 有害内容分类
- Prompt 内容安全
- Agent 最终回答安全检查

不建议单独承担：

- 间接提示注入检测
- RAG 数据投毒检测

---

### 2.3 TrustRAG

主要负责判断：

> “Retriever 返回的知识是否存在投毒、冲突、异常或不可信内容？”

建议放置位置：

```text
Vector DB
    ↓
Retriever
    ↓
Top-K Documents
    ↓
TrustRAG
    ↓
过滤 / 重排 / 清洗
    ↓
Trusted Context
    ↓
Agent LLM
```

TrustRAG主要用于弥补现有 Guard 对“自然语言错误知识投毒”检测能力不足的问题。

---

## 3. 总体系统架构

```text
                    用户 / 外部请求
                           ↓
                     Source Gateway
                           ↓
        ┌─────────────────────────────────┐
        │ User / Web / File / Memory / Tool │
        └─────────────────────────────────┘
                           ↓
              多源输入标准化 + 来源标记
                           ↓
                       PIGuard
                           ↓
              Prompt Injection 风险信号
                           ↓
                     Qwen3Guard
                           ↓
                内容安全风险信号
                           ↓
                ┌─────────────────┐
                │ 是否需要 RAG？  │
                └───────┬─────────┘
                        │
              ┌─────────┴─────────┐
              │                   │
            普通任务             RAG任务
              │                   ↓
              │               Retriever
              │                   ↓
              │                Top-K
              │                   ↓
              │               TrustRAG
              │                   ↓
              │            Trusted Context
              │                   │
              └──────────┬────────┘
                         ↓
                  Risk Fusion Engine
                         ↓
                   Policy Engine
                         ↓
                     Agent Core
                         ↓
                     Tool Gateway
                         ↓
                        Tool
                         ↓
                   Tool Response
                         ↓
                      PIGuard
                         ↓
                     Agent LLM
                         ↓
                   Qwen3Guard
                         ↓
                     最终回答
```

---

## 4. RAG 数据投毒防御设计

仅依赖 PIGuard 和 Qwen3Guard 无法有效识别事实型数据投毒。

例如：

```text
正常知识：
巴黎是法国首都。

投毒知识：
里昂是法国首都。
```

第二句话本身：

- 没有恶意指令
- 没有“忽略系统提示”
- 没有工具调用
- 没有越狱关键词

因此普通 Prompt Guard 很可能判断为 Safe。

TrustRAG应专门负责这一部分。

### 推荐流程

```text
用户问题
   ↓
Retriever
   ↓
Top-20 / Top-10
   ↓
TrustRAG
   ↓
聚类 / 相似度分析
   ↓
冲突知识分析
   ↓
可信度判断
   ↓
可疑文档过滤
   ↓
Top-5 Trusted Context
   ↓
Agent LLM
```

---

## 5. 数据库入库安全层

TrustRAG主要解决“检索后防御”，数据库本身还应增加“入库前防御”。

```text
外部文档
   ↓
KB Ingestion Guard
   ↓
来源可信度验证
   ↓
文档 Hash / 签名
   ↓
重复 / 批量异常检测
   ↓
Embedding 异常检测
   ↓
PIGuard 注入检测
   ↓
Metadata + Provenance
   ↓
Vector Database
```

建议每个知识 Chunk 保存：

```json
{
  "chunk_id": "xxx",
  "document_id": "xxx",
  "content": "...",
  "source": "official_web",
  "source_url": "...",
  "source_trust": 0.92,
  "created_at": "...",
  "updated_at": "...",
  "document_hash": "...",
  "pig_score": 0.04,
  "verified": true,
  "version": 3
}
```

---

## 6. Risk Fusion Engine

不要让某一个安全模型直接决定“允许 / 阻断”。

应该统一生成风险上下文：

```text
PIGuard
      │
Qwen3Guard
      │
TrustRAG
      ├──→ Risk Fusion Engine → Risk Score
Source Trust
      │
Tool Risk
      │
Data Sensitivity
```

示例：

```python
RiskContext(
    source="web",
    pig_score=0.82,
    qwen_level="Safe",
    rag_poison_score=0.15,
    source_trust=0.40,
    tool_risk="high",
    data_sensitivity="internal"
)
```

V1 可以先采用规则权重：

```python
risk_score = (
    0.30 * injection_risk
    + 0.20 * content_risk
    + 0.25 * rag_risk
    + 0.10 * source_risk
    + 0.15 * operation_risk
)
```

建议风险等级：

```text
0.00 - 0.30   LOW
0.30 - 0.60   MEDIUM
0.60 - 0.80   HIGH
0.80 - 1.00   CRITICAL
```

说明：这些权重只适合作为第一版工程初始值，后续应使用自己的验证集调参。

---

## 7. Policy Engine

策略层不要只有：

```text
Safe / Unsafe
```

建议设计为：

| 风险等级 | 行为 |
|---|---|
| LOW | ALLOW |
| MEDIUM | SANITIZE / RE-RANK |
| HIGH | ISOLATE / RE-RETRIEVE |
| CRITICAL | BLOCK |
| 高风险工具操作 | CONFIRM / HUMAN REVIEW |

例如：

```text
“删除整个数据库”
```

即使：

- PIGuard = benign
- Qwen3Guard = Safe
- TrustRAG = Clean

仍然不能直接执行。

因为：

```text
operation_risk = CRITICAL
```

Agent 安全不仅要判断“内容是否有害”，还必须判断“操作是否危险”。

---

## 8. Tool Gateway

Agent 不应该直接调用工具。

错误方式：

```text
LLM
 ↓
Shell / Database / Email / File
```

推荐方式：

```text
Agent
  ↓
Tool Request
  ↓
Tool Gateway
  ├── Permission Check
  ├── Parameter Check
  ├── Risk Check
  ├── Scope Check
  └── User Confirmation
  ↓
Tool
```

建议后续可以加入 OPA（Open Policy Agent），形成：

```text
安全模型发现风险
        ↓
Risk Engine 汇总风险
        ↓
OPA / Policy Engine 做确定性决策
        ↓
允许 / 隔离 / 阻断 / 人工确认
```

---

## 9. Memory 安全

历史记忆也应作为“不可信输入”处理。

```text
Memory
   ↓
Memory Retriever
   ↓
PIGuard
   ↓
来源 / 用户归属检查
   ↓
Risk Engine
   ↓
Agent
```

后续可以扩展：

- Memory Poisoning Detection
- 跨会话权限检查
- 敏感信息隔离
- Memory Provenance

---

## 10. V1 推荐开发范围

第一版不要一次性把所有功能都做完。

建议优先实现六个核心模块：

1. Agent Core
2. PIGuard
3. Qwen3Guard
4. RAG + TrustRAG
5. Risk Engine
6. Tool Gateway

V1 主流程：

```text
用户输入
   ↓
PIGuard
   ↓
Qwen3Guard
   ↓
Agent 判断是否需要 RAG
   ↓
Retriever
   ↓
TrustRAG
   ↓
Risk Engine
   ↓
Agent LLM
   ↓
Tool Gateway
   ↓
Qwen3Guard
   ↓
最终回答
```

第二阶段再增加：

- OPA
- Memory Guard
- KB 入库治理
- Provenance
- 人工复核
- 前端管理页面
- 审计日志
- 权限管理

---

## 11. 推荐代码目录结构

```text
agent-security/
│
├── app/
│   ├── main.py
│   └── config.py
│
├── agent/
│   ├── agent.py
│   ├── planner.py
│   └── state.py
│
├── guards/
│   ├── base.py
│   ├── piguard.py
│   ├── qwen3guard.py
│   └── guard_router.py
│
├── rag_security/
│   ├── retriever.py
│   ├── trustrag_adapter.py
│   ├── poison_detector.py
│   ├── consistency_checker.py
│   └── provenance.py
│
├── ingestion/
│   ├── document_loader.py
│   ├── source_verifier.py
│   ├── deduplicator.py
│   ├── chunker.py
│   └── indexer.py
│
├── risk/
│   ├── risk_engine.py
│   ├── risk_schema.py
│   └── scoring.py
│
├── policy/
│   ├── policy_engine.py
│   └── policies/
│
├── tools/
│   ├── gateway.py
│   ├── permissions.py
│   ├── web.py
│   ├── files.py
│   └── database.py
│
├── memory/
│   ├── memory_store.py
│   └── memory_guard.py
│
├── audit/
│   ├── logger.py
│   └── trace.py
│
├── api/
│   ├── routes.py
│   └── schemas.py
│
├── tests/
│   ├── prompt_injection/
│   ├── jailbreak/
│   ├── poisoned_rag/
│   └── agent_attack/
│
└── configs/
    ├── models.yaml
    ├── risk.yaml
    └── policy.yaml
```

---

## 12. 后续测试建议

现有测试结果可以直接作为 Agent V1 的基线。

后续重点补充端到端测试：

### Prompt Injection

- deepset prompt-injections
- BIPIA
- InjecAgent
- AgentDojo

### 中文安全 / 越狱

- JailBench
- 中文安全测试集

### RAG 数据投毒

- PoisonedRAG
- TrustRAG 自带攻击测试
- Clean RAG 对照测试

### 最终重点指标

- Injection Recall
- Clean FPR
- Jailbreak Recall
- Poison Recall
- Poison Hit@K
- Attack Success Rate（ASR）
- ASR Reduction
- Clean QA Accuracy / Utility
- Agent Task Success Rate
- Tool Misuse Rate
- P95 Latency

---

## 13. 最终项目定义

建议将项目正式定义为：

> **面向复杂输入链路的多层智能体安全防护 Agent**

整体安全链路：

```text
多源输入感知
    ↓
提示注入检测
    ↓
中文内容安全
    ↓
RAG 数据投毒防御
    ↓
多模型风险融合
    ↓
安全策略决策
    ↓
工具最小权限控制
    ↓
输出安全检测
    ↓
全链路日志审计
```

其中：

- **PIGuard**：负责提示注入
- **Qwen3Guard**：负责中文内容安全与越狱
- **TrustRAG**：负责 RAG / 知识库数据投毒
- **Risk Engine**：负责多信号融合
- **Policy Engine**：负责安全决策
- **Tool Gateway**：负责工具权限与执行安全

最终目标不是简单堆叠三个模型，而是构建一个：

> **多模型 + 多层策略 + 多源输入 + RAG 防投毒 + 工具权限控制的纵深防御智能体安全系统。**
