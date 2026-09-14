# 规格：多层智能体安全防护 Agent V1

## 目标

构建一个可离线运行、可测试、可替换模型适配器的安全 Agent 内核。系统统一处理用户、网页、文件、RAG、记忆和工具响应等不可信输入，在调用 LLM 或工具前执行提示注入检测、内容安全检测、RAG 投毒检测、风险融合和确定性策略决策。

V1 成功标准：

- 一条请求能够完整经过 Guard、可选 RAG、风险融合、策略、LLM、工具网关和输出 Guard。
- 高置信提示注入、有害内容、RAG 投毒及高风险工具不会被静默放行。
- 所有外部模型、Retriever、LLM 和工具都通过显式接口注入，可在不改 Agent Core 的情况下替换。
- Guard 或外部适配器故障时失败关闭，并返回结构化、无敏感细节的结果。

## 技术栈

- Python 3.11+
- 标准库 `dataclasses`、`enum`、`typing`、`unittest`
- V1 不引入第三方运行时依赖；真实模型服务由后续适配器接入

## 命令

- 运行：`python -m app.main "你好"`
- 聚焦测试：`python -m unittest tests.risk.test_risk_engine -v`
- 全量测试：`python -m unittest discover -s tests -t . -v`
- 构建检查：`python -m compileall -q app agent guards rag_security risk policy tools`

## 项目结构

- `app/`：组装与 CLI 入口
- `agent/`：领域状态、规划器与 Agent Core
- `guards/`：PIGuard、Qwen3Guard 及统一路由接口
- `rag_security/`：Retriever、TrustRAG 与知识文档契约
- `risk/`：风险上下文、融合算法与分级
- `policy/`：确定性安全决策
- `tools/`：最小权限工具注册与执行网关
- `configs/`：V1 默认模型、风险和策略配置说明
- `tests/`：与架构风险域对应的单元及端到端测试

## 代码风格

使用类型注解、不可变领域对象、显式枚举和依赖注入。公共边界不返回裸字典。

```python
@dataclass(frozen=True, slots=True)
class GuardSignal:
    detector: str
    score: float
    categories: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not 0.0 <= self.score <= 1.0:
            raise ValueError("score must be between 0 and 1")
```

## 测试策略

- 单元测试：风险边界、策略映射、Guard 启发式、RAG 过滤、工具权限。
- 集成测试：完整 Agent 请求、阻断、RAG、工具确认和输出审核链路。
- 测试遵循 RED → GREEN → REFACTOR；不依赖网络、GPU 或真实模型权重。
- 至少覆盖风险分数 `0.30`、`0.60`、`0.80` 的边界语义。

## 威胁模型

### 信任边界

- 用户、网页、文件、记忆、RAG 文档和工具响应进入系统。
- 外部 Guard、Retriever 和 LLM 的返回进入 Agent Core。
- LLM 生成结构化工具请求并跨越 Tool Gateway。

### 关键资产

- 系统指令、模型与服务凭据、跨用户数据、知识库完整性、工具权限和执行环境。

### V1 滥用场景及控制

- 指令覆盖/提示注入：输入与工具响应经过 PIGuard。
- 越狱/有害内容：输入与最终输出经过 Qwen3Guard。
- RAG 投毒：未验证、低可信或异常文档由 TrustRAG 过滤。
- 过度代理：工具仅可通过注册表和 Tool Gateway，执行前校验权限、参数、作用域和确认状态。
- 外部组件失效：转换为最高风险信号，策略失败关闭。
- 资源消耗：限制输入长度、检索数量和单轮工具调用数。

## 边界

- 始终：验证边界输入；模型输出视为不可信；使用最小权限；高风险动作需确认；错误不暴露内部堆栈。
- 先询问：接入真实外部模型/服务；新增第三方依赖；加入持久化、认证、文件上传或网络抓取。
- 禁止：把 LLM 输出直接交给 shell/SQL/eval；提交密钥；因 Guard 不可用而默认放行；绕过 Tool Gateway。

## 非目标

- V1 不提供真实 PIGuard/Qwen3Guard/TrustRAG 模型推理服务。
- V1 不提供 HTTP API、数据库、前端、OPA、跨会话记忆或持久化审计。
- 本地启发式适配器只用于工程联调和测试，不代表生产检测精度。

## 开放问题

- 真实模型采用本地权重、vLLM/TGI，还是远程 HTTP 服务。
- 三个模型的版本、输入模板、输出标签及超时/重试策略。
- 生产环境租户、权限、审计留存和隐私要求。
