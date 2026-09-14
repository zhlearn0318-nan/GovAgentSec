# 智能体安全 Agent：整体系统架构图

> 基于当前仓库代码、`docs/spec-v1.md` 与架构设计总结整理。更新时间：2026-08-14。
>
> 图例：蓝色为当前 V1 已实现；灰色虚线为生产环境外部适配项或后续治理能力。

## 1. 目标端到端架构

```mermaid
flowchart TB
    subgraph Sources["不可信输入源"]
        U["用户 Prompt"]
        W["网页 Web"]
        F["文件 File"]
        M["历史记忆 Memory"]
        TR["工具返回 Tool Response"]
    end

    SG["Source Gateway<br/>标准化、来源标记、长度校验"]
    PIG["PIGuard<br/>提示注入 / 间接注入"]
    QWG_IN["Qwen3Guard<br/>越狱 / 有害内容"]

    subgraph RAG["RAG 安全域"]
        NEED{"是否需要 RAG?"}
        RET["Retriever"]
        VDB[("Vector DB")]
        TOPK["Top-K Documents"]
        TRUST["TrustRAG<br/>来源可信度 / 投毒 / 冲突过滤"]
        CTX["Trusted Context"]
        VDB --> RET
        RET --> TOPK --> TRUST --> CTX
    end

    RF["Risk Fusion Engine<br/>注入 30% + 内容 20% + RAG 25%<br/>来源 10% + 操作 15%"]
    PE["Policy Engine<br/>ALLOW / SANITIZE / ISOLATE / BLOCK / CONFIRM"]
    AC["Agent Core / Planner"]
    LLM["Agent LLM"]

    subgraph Tools["工具执行安全域"]
        TG["Tool Gateway<br/>权限 / 参数 / 作用域 / 用户确认"]
        TOOL["Shell / DB / Email / File / Web"]
        TG --> TOOL --> TR
    end

    QWG_OUT["Qwen3Guard<br/>最终输出审核"]
    OUT["安全响应"]
    AUDIT[("审计日志 / Trace")]

    U & W & F & M & TR --> SG
    SG --> PIG --> QWG_IN --> NEED
    NEED -- "否" --> RF
    NEED -- "是" --> RET
    CTX --> RF
    RF --> PE
    PE -- "BLOCK" --> OUT
    PE -- "ALLOW / 处理后放行" --> AC
    AC --> LLM
    LLM -- "普通回答" --> QWG_OUT --> OUT
    LLM -- "工具请求" --> TG
    TR --> PIG

    SG -.-> AUDIT
    RF -.-> AUDIT
    PE -.-> AUDIT
    TG -.-> AUDIT
    QWG_OUT -.-> AUDIT

    classDef implemented fill:#dbeafe,stroke:#2563eb,color:#172554,stroke-width:2px;
    classDef planned fill:#f3f4f6,stroke:#6b7280,color:#111827,stroke-dasharray:6 4;

    class SG,PIG,QWG_IN,NEED,RET,TOPK,TRUST,CTX,RF,PE,AC,LLM,TG,TR,QWG_OUT,OUT implemented;
    class U,W,F,M,VDB,TOOL,AUDIT planned;
```

## 2. 当前代码真实架构

```mermaid
flowchart TB
    REQ["agent.state<br/>AgentRequest + SourceType"]
    GUARDS["GuardRouter<br/>PIGuard + Qwen3Guard<br/>错误类型/异常均失败关闭"]
    RAG["可选 RAG<br/>Retriever → TrustRAG → Trusted Context"]
    RISK["RiskEngine → PolicyEngine"]
    MODEL["AgentModelPort<br/>BaselineAgentModel"]
    GATEWAY["ToolGateway<br/>注册表 / 权限 / 参数 / 作用域 / 确认"]
    TOOL["注入的 ToolPort"]
    TOOL_GUARD["工具返回二次 Guard"]
    OUT_GUARD["最终输出 Qwen3Guard"]
    RESPONSE["AgentResponse / CLI JSON"]

    REQ --> GUARDS --> RAG --> RISK
    RISK -- "SANITIZE / ISOLATE / BLOCK" --> RESPONSE
    RISK -- "ALLOW" --> MODEL
    MODEL -- "普通回答" --> OUT_GUARD --> RESPONSE
    MODEL -- "结构化 ToolRequest" --> GATEWAY --> TOOL --> TOOL_GUARD
    TOOL_GUARD -- "安全" --> MODEL
    TOOL_GUARD -- "风险" --> RESPONSE

    PROD["生产适配项<br/>真实 PIGuard / Qwen3Guard / TrustRAG / LLM<br/>Vector DB / 工具实现 / 审计存储"]
    PROD -. "替换端口，不改 Agent Core" .-> GUARDS
    PROD -.-> RAG
    PROD -.-> MODEL
    PROD -.-> TOOL

    classDef implemented fill:#dbeafe,stroke:#2563eb,color:#172554,stroke-width:2px;
    classDef planned fill:#f3f4f6,stroke:#6b7280,color:#111827,stroke-dasharray:6 4;
    class REQ,GUARDS,RAG,RISK,MODEL,GATEWAY,TOOL,TOOL_GUARD,OUT_GUARD,RESPONSE implemented;
    class PROD planned;
```

## 3. 已实现模块与职责

| 模块 | 当前职责 | 关键安全语义 |
|---|---|---|
| `agent/state.py` | 请求内容、来源类型、RAG 选择字段 | 去空白；空输入拒绝；最大 16,000 字符 |
| `guards/piguard.py` | 中英文提示注入启发式检测 | 匹配后风险分数为 0.95/0.99 |
| `guards/qwen3guard.py` | 越狱与有害内容启发式检测 | 匹配后输出结构化类别和风险分数 |
| `guards/guard_router.py` | Guard 调用边界 | Guard 异常时 `available=False`、`score=1.0`，失败关闭 |
| `rag_security/` | 文档来源契约、Retriever 端口、TrustRAG 过滤 | 未验证、低可信、超阈值投毒及超量返回不会进入模型上下文 |
| `risk/risk_schema.py` | Guard、风险上下文、权重和评估契约 | 不可变 dataclass；所有概率限制在 `[0,1]` |
| `risk/risk_engine.py` | 多信号加权融合 | 组件不可用直接 CRITICAL；高置信风险设置安全下限 |
| `risk/scoring.py` | 分数到等级映射 | `<0.30 LOW`、`<0.60 MEDIUM`、`<0.80 HIGH`、其余 CRITICAL |
| `policy/policy_engine.py` | 风险等级到确定性动作 | LOW→ALLOW、MEDIUM→SANITIZE、HIGH→ISOLATE、CRITICAL→BLOCK |
| `tools/` | 工具契约、权限上下文和执行网关 | 仅注册工具可执行；参数白名单；作用域/权限校验；高风险确认；异常不泄露 |
| `agent/agent.py` | 完整安全编排与单轮工具闭环 | 输入、RAG、模型计划、工具返回和最终输出逐层校验；外部组件失败关闭 |
| `agent/baseline_model.py` | 离线确定性模型适配器 | 仅用于工程联调，不执行真实模型推理或自主工具规划 |
| `app/` | 默认依赖组装和 JSON CLI | 输入校验；安全状态映射为稳定退出码；不输出内部堆栈 |

## 4. 测试覆盖与生产适配项

```mermaid
flowchart TB
    TESTS["unittest discover"]
    TESTS --> T1["tests/agent/test_state.py<br/>请求与信号边界"]
    TESTS --> T2["tests/guards/test_guards.py<br/>注入、越狱、失败关闭"]
    TESTS --> T3["tests/risk/test_risk_engine.py<br/>权重、等级边界、安全下限"]
    TESTS --> T4["tests/policy/test_policy_engine.py<br/>确定性动作映射"]
    TESTS --> T5["tests/rag_security/test_trustrag.py<br/>可信文档过滤"]
    TESTS --> T6["tests/tools/test_gateway.py<br/>权限、参数、确认、异常"]
    TESTS --> T7["tests/agent_attack/test_agent_pipeline.py<br/>完整攻击链与输出审核"]
    TESTS --> T8["tests/app/test_main.py<br/>CLI 允许/隔离路径"]

    T1 & T2 & T3 & T4 & T5 & T6 & T7 & T8 --> READY["42 个测试全部通过"]
    READY --> PROD["下一阶段：真实模型协议、Vector DB、真实工具、审计与租户隔离"]

    classDef ok fill:#dcfce7,stroke:#16a34a,color:#052e16;
    classDef planned fill:#f3f4f6,stroke:#6b7280,color:#111827,stroke-dasharray:6 4;
    class READY ok;
    class PROD planned;
```

当前仓库已经形成完整的离线 V1 纵向切片。真实安全模型、向量数据库和业务工具仍通过端口注入；本地 Baseline 只证明工程链路与安全控制，不代表生产检测精度。

注意：测试目录与源码包存在 `agent`、`guards`、`policy`、`risk` 等同名目录。全量发现必须指定项目顶层目录 `-t .`；只使用 `discover -s tests` 会让测试目录遮蔽源码包，产生额外的假性导入错误。

## 5. 测试前命令

请在 `智能体安全/` 目录执行：

```powershell
# 聚焦运行完整 Agent 攻击链
python -m unittest tests.agent_attack.test_agent_pipeline -v

# 全量测试（-t . 防止测试包遮蔽同名源码包）
python -m unittest discover -s tests -t . -v

# 全链路源码编译检查
python -m compileall -q app agent guards rag_security risk policy tools

# CLI 安全允许路径
python -m app.main "你好"
```

## 6. 关键结论

- `rag_security` → `Tool Gateway` → `Agent Core` → `app/CLI` 的离线 V1 链路已经贯通。
- 系统采用“不可变领域契约 + 端口/适配器 + 确定性策略”，模型只能返回文本或结构化 `ToolRequest`。
- Guard、Retriever、TrustRAG、模型或工具返回异常/错误类型/超限数据时不会静默放行。
- 工具执行受注册表、参数白名单、权限、作用域和确认五层约束，返回内容还会再次经过 Guard。
- 下一阶段工作是接入真实模型与存储、补充审计/租户隔离，并用真实攻击数据集调参与测量精度。
