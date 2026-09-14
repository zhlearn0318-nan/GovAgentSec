# Protect Agent 当前整体架构图

> 更新时间：2026-08-21。该图以当前仓库代码和已验证的 OpenClaw + `deepseek-v4-flash` 运行链路为准。

```mermaid
flowchart TB
    subgraph SRC["一、交互与不可信数据源"]
        USER["用户请求"]
        EXT["Web / RAG / 文件 / Memory"]
        TDATA["工具返回数据"]
    end

    subgraph OC["二、OpenClaw Agent 运行时"]
        MAIN["OpenClaw main Agent"]
        HIN["before_agent_run<br/>输入强制检查"]
        LLM["DeepSeek<br/>deepseek-v4-flash<br/>规划 / 回答"]
        HTOOL["before_tool_call<br/>工具名 + 参数 + 派生路径检查"]
        APPROVE{"高影响工具或 REVIEW?"}
        HUMAN["人工审批<br/>60 秒超时默认 DENY"]
        TOOL["已注册 OpenClaw Tool<br/>read / web / file / exec ..."]
        HRESULT["after_tool_call<br/>工具结果送检与观测"]
        HOUT["message_sending<br/>最终输出强制复检"]
        END["agent_end<br/>清理本轮 Prompt 映射"]
    end

    subgraph API["三、本机安全边界"]
        CLIENT["Protect Agent Plugin Client<br/>有界 JSON 序列化 · 会话 ID 哈希"]
        SIDECAR["Protect Agent Sidecar<br/>127.0.0.1:19171<br/>Bearer 鉴权 · /v1/screen"]
        MAP["决策映射<br/>ALLOW / REVIEW / BLOCK"]
        FAIL["Fail Closed<br/>超时 · 异常 · 解析失败 → BLOCK"]
    end

    subgraph DET["四、多检测器安全核心"]
        ROUTER["GuardRouter<br/>统一结构与可用性校验"]
        PI["真实 PIGuard<br/>直接 / 间接提示注入"]
        QW["真实 Qwen3Guard<br/>Safe / Controversial / Unsafe<br/>有害内容与越狱分类"]
        ALIGN["Task-Payload Alignment<br/>原任务与外部载荷是否对齐<br/>任务劫持 / 执行意图 / 外传"]
        PRIV["PrivilegeBoundaryDetector<br/>越权 · 身份切换 · 认证绕过<br/>权限与能力扩大"]
        STATE["ConversationRiskState<br/>多轮风险 · 敏感资源 · 权限变化<br/>工具行为 · 0.65 衰减 · LRU 隔离"]
        TR["真实 TrustRAG<br/>检索 / 工具结果投毒检测<br/>可信内容保留"]
        EVID["Structured Attack Evidence<br/>动作、目标、来源和操作证据"]
    end

    subgraph DEC["五、统一风险融合与策略决策"]
        FUSION["GuardFusion<br/>关联信号校准与语境抑制<br/>避免 PIGuard + Qwen3Guard 简单取并集"]
        RISK["RiskEngine<br/>注入 0.30 · 内容 0.20 · RAG 0.25<br/>来源 0.10 · 操作 0.15<br/>强信号保底升级"]
        POLICY["PolicyEngine<br/>LOW → ALLOW<br/>MEDIUM → SANITIZE / REVIEW<br/>HIGH → ISOLATE<br/>CRITICAL → BLOCK"]
    end

    subgraph OUT["六、结果与治理"]
        SAFE["安全响应"]
        STOP["阻断 / 隔离 / 取消发送"]
        TRACE["OpenClaw Session Trace<br/>结构化风险原因与测试报告"]
        EVAL["独立校准集 + 正式评测<br/>Precision / Recall / F1 / FPR<br/>分来源、权限、多轮、RAG 指标"]
    end

    USER --> MAIN --> HIN
    EXT -. "作为不可信上下文或工具数据" .-> MAIN

    HIN -. "kind=input" .-> CLIENT
    HTOOL -. "kind=tool_call" .-> CLIENT
    HRESULT -. "kind=tool_result" .-> CLIENT
    HOUT -. "kind=output" .-> CLIENT
    CLIENT --> SIDECAR --> ROUTER

    ROUTER --> PI
    ROUTER --> QW
    ROUTER --> ALIGN
    ROUTER --> PRIV
    ROUTER --> STATE
    ROUTER --> EVID
    ROUTER -->|"tool_result / RAG"| TR

    PI --> FUSION
    QW --> FUSION
    ALIGN --> FUSION
    PRIV --> FUSION
    STATE --> FUSION
    TR --> FUSION
    EVID --> FUSION
    FUSION --> RISK --> POLICY --> MAP
    ROUTER -. "组件不可用" .-> FAIL
    FAIL --> MAP

    MAP -. "输入 ALLOW" .-> HIN
    HIN -->|"ALLOW"| LLM
    HIN -->|"REVIEW / BLOCK"| STOP

    LLM -->|"普通回答"| HOUT
    LLM -->|"结构化工具请求"| HTOOL
    MAP -. "工具决策" .-> HTOOL
    HTOOL -->|"BLOCK"| STOP
    HTOOL -->|"ALLOW"| APPROVE
    APPROVE -->|"是"| HUMAN
    HUMAN -->|"批准"| TOOL
    HUMAN -->|"拒绝 / 超时"| STOP
    APPROVE -->|"否"| TOOL

    TOOL --> TDATA --> HRESULT
    MAP -. "TrustRAG 检测结果<br/>当前 OpenClaw Hook 为观测路径" .-> HRESULT
    HRESULT --> LLM

    MAP -. "输出决策" .-> HOUT
    HOUT -->|"ALLOW"| SAFE
    HOUT -->|"REVIEW / BLOCK / 异常"| STOP
    SAFE --> END
    STOP --> END

    STATE -. "会话结构化状态" .-> TRACE
    POLICY -. "分数 / 等级 / 原因" .-> TRACE
    TRACE --> EVAL

    classDef source fill:#f1f5f9,stroke:#64748b,color:#0f172a;
    classDef runtime fill:#dbeafe,stroke:#2563eb,color:#172554,stroke-width:2px;
    classDef detector fill:#ede9fe,stroke:#7c3aed,color:#3b0764;
    classDef decision fill:#fef3c7,stroke:#d97706,color:#78350f;
    classDef safe fill:#dcfce7,stroke:#16a34a,color:#14532d;
    classDef blocked fill:#fee2e2,stroke:#dc2626,color:#7f1d1d;
    classDef governance fill:#ecfeff,stroke:#0891b2,color:#164e63;

    class USER,EXT,TDATA source;
    class MAIN,HIN,LLM,HTOOL,APPROVE,HUMAN,TOOL,HRESULT,HOUT,END,CLIENT,SIDECAR,MAP runtime;
    class ROUTER,PI,QW,ALIGN,PRIV,STATE,TR,EVID detector;
    class FUSION,RISK,POLICY decision;
    class SAFE safe;
    class STOP,FAIL blocked;
    class TRACE,EVAL governance;
```

## 图中最重要的四条链路

1. **输入链路**：用户输入先经过 `before_agent_run`，只有 Protect Agent 返回 `ALLOW` 才会进入 DeepSeek。
2. **工具链路**：DeepSeek 只能提出结构化工具请求；`before_tool_call` 重新检查参数，高影响工具必须人工批准，超时默认拒绝。
3. **RAG/工具结果链路**：工具结果作为不可信数据进入 `after_tool_call` 和 TrustRAG。当前 OpenClaw Hook 在这里执行检测与观测，最终对外强制门禁由 `message_sending` 完成。
4. **多轮链路**：`ConversationRiskState` 按会话保存结构化风险特征并进行衰减，使分散在多轮中的越权和工具攻击可以被关联，同时避免风险无限累积。

## 部署边界

| 区域 | 组件 | 信任关系 |
|---|---|---|
| OpenClaw 运行时 | main Agent、5 个生命周期 Hook、工具 | 受 Protect Agent 插件强制控制 |
| 本机安全域 | Sidecar、PIGuard、Qwen3Guard、TrustRAG、融合与策略模块 | 回环地址 + Bearer token；异常失败关闭 |
| 外部模型域 | DeepSeek `deepseek-v4-flash` | 只接收通过输入策略的内容；不能绕过工具 Hook |
| 外部数据域 | Web、文件、RAG、Memory、工具结果 | 始终视为不可信数据 |

## 当前实现状态

- OpenClaw 插件已加载并激活，运行时注册 5 个 Hook 和 `protect-agent-sidecar` 服务。
- PIGuard、Qwen3Guard、TrustRAG 均接入本地真实模型/模块。
- DeepSeek `deepseek-v4-flash` 已完成真实端到端调用。
- Python 回归 172/172、OpenClaw 插件回归 7/7 通过。
- 高影响工具审批为强制门禁；拒绝或 60 秒超时均不执行。
- `after_tool_call` 当前没有直接替换或删除工具结果，是观测型 Hook；最终输出仍会经过强制复检。这是后续可加强的边界。
