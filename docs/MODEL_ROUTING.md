# 会话 API 与本地安全评审

会话 API 与本地安全评审分别配置。会话 API 可达不等于轨迹评审可出域。

会话模型负责对话、规划和选工具；权限判断、轨迹评审与候选技能门控不随会话模型供应商改变。全新安装默认本地 Ollama；当前本机已有 DeepSeek 会话配置，安装器保留它。config/model-routing.json 的 DeepSeek 是可选配置模板，不等于所有安装默认使用云模型。本机 Ollama/启发式承担安全评审。

**交付配置与现网状态分开验收。** U8 初次验收使用本机模拟接口；随后经用户授权配置了会话 API。2026-11-08 修复模型目录和聊天页初始化，当前默认为 `deepseek/deepseek-flash`。真实连通测试仅使用固定合成字符串，评审仍限定在本机。

## 日常模型接入

双击根目录 `Configure-Model.cmd` 调用固定宿主原生模型向导。它先备份配置和 SHA-256，再让用户在本机输入提供商、API 地址、Key 与模型，完成后重启网关。以下 prepare/apply 脚本是高级配置方式，不是第四种下载入口。

## 两条路径

| 路径 | 配置 / 实际调用者 | 数据边界 |
| --- | --- | --- |
| 会话、规划、工具循环 | `config/model-routing.json` 的 `session_llm`，生成 OpenClaw `models.providers` 与 `agents.defaults.model` | API 会接收该会话上下文；仅用于允许出域的数据 |
| 轨迹 Q/S 评审、自演进筛选 | 同文件的 `security_review_llm`；`OllamaLocalJudge`，或明确标注的本地启发式 | 只允许 `http://127.0.0.1` / `http://[::1]`；禁止外部地址、DNS 名称、重定向和 Ollama 云模型 |
| 旧版轨迹评审、固定版本 SkillClaw 生成与独立候选验证 | 原 `trajectory-governance` 本地配置，保留锁定的 `qwen3:4b` 与权重摘要 | 同样只允许本地；不把旧标定模型静默换成新模型 |

会话 API 必然接收模型需要的消息和工具上下文。**“先进 API + 本地评审”不等于“云会话能处理原始公文而不出域”。** 本轮不发送现有对话、原始 prompt、公文或历史轨迹；冒烟只用固定合成字符串。敏感任务必须显式选择本地模型，并另行建立允许外发的数据边界。本轮没有新增全宿主 DLP/上下文脱敏保证。

## 配置与凭据

仓库配置只含 `api_key_env: DEEPSEEK_API_KEY`；生成的 OpenClaw 配置使用固定版本支持的 SecretRef：

```json
{"source":"env","provider":"default","id":"DEEPSEEK_API_KEY"}
```

已直接核验本机 OpenClaw **2026.7.1-2** 的 `dist/zod-schema.core-DviqqtPj.js` 中 `SecretRefSchema` / `ModelProviderSchema`，并用 `dist/config/config.js` 导出的 `validateConfigObjectRaw` 验证生成配置。没有依赖更新版本字段。

默认 `deepseek/deepseek-flash`，可选 `deepseek/deepseek-v4-pro`，会话自动 fallback 为空；Ollama 配置保留，可显式用于断网演示或敏感任务。新旧会话覆盖及 `agents.list[].model` 不会被应用脚本强行清除。

生成不含机密的模型配置片段：

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
node scripts/prepare_model_routing.mjs
```

输出 `local-validation/model-routing/openclaw-model-patch.json`，状态为 `prepared-not-applied`。它是**合并片段，不是完整网关配置**，不能拿它覆盖现网文件。

选择其他兼容 API 时，将 `config/model-routing.json` 复制到用户本地忽略目录，修改 `session_llm` 的供应商标识、HTTPS 地址、模型 ID 与环境变量名；通过 `GOVAGENTSEC_MODEL_ROUTING_CONFIG` 指向它。评审配置仍必须为回环地址；`external_review_enabled` 只能为 `false`，本轮不提供外部评审开关。

显式应用到 OpenClaw（先通过用户自己的秘密管理方式设置密钥，不要把密钥粘贴进代码或报告）：

```powershell
# 当前终端必须已有 DEEPSEEK_API_KEY；不要把真实值写入仓库。
node scripts/apply_model_routing.mjs --config "$env:USERPROFILE\.openclaw\openclaw.json"
```

脚本只更改会话 provider、默认模型及必要的模型允许列表；保留安全插件、工具限制、网关设置与本地模型，并在原配置旁保存备份。无环境凭据则拒绝且不修改。它不重启服务、不测试云账号，也不将密钥复制到配置。**启动网关的进程也必须能读取相同环境变量**，仅在另一个终端设置无效。重启后新建会话并检查实际模型；原会话和代理覆盖另行核验。

## 本地评审的执行保护

- `modules/model-routing/local-only.mjs` 在每次网络请求前核验地址与路由，不仅在构造评审器时校验。运行中修改 endpoint 也不能外发。
- 新旧 JS 评审器在发送证据前检查 `/api/show` 的本地权重信息，拒绝 `remote_host` / `remote_model`；旧路径继续校验固定 digest。
- Python SkillClaw 适配器每次请求重新核验地址、关闭环境代理和重定向，并在发送会话证据前核验本地权重。
- `makeLocalJudge()` 默认本地 Ollama，不再默认 FixtureJudge。CLI 显式 `ollama | heuristic | fixture` 仍保留；Fixture 只用于测试证据。
- 新评审器不可用时回退本地启发式并记录来源；旧评审/生成返回 unknown 或失败。Q/S 公式、标定要求、隔离条件与发布门控没有改动，回退不赋予生产资格。
- 启发式/模型评分仍标记 `not-production`；本轮没有新增标定结论，不宣称复现论文 DeepSeek 阈值。

回环地址和权重检查依赖受信任的本机服务，不是对恶意本机进程或操作系统的网络隔离证明。无需把这个边界包装成全系统零外传保证。

## 中文页面

防护设置增加「模型分工」：
- **会话模型（可 API）**：读实际默认配置，显示当前模型、API 是否已配置；未切换时明确显示仍为本地。API 已配置不代表连通性通过。
- **安全评审（默认本地，轨迹不出域）**：展示配置的本地模型、回环地址和失败处理。旧版固定权重路径以其配置为准。

页面没有密钥输入、云模型试调用或自动配置写入按钮。换供应商不变更原安全钩子，也不把会话密钥传给评审器。

## 验收与复现

```powershell
Set-Location 'F:\揭榜挂帅\GovAgentSec'
python scripts/check_model_routing.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/Verify-ZhengAn.ps1
```

验收脚本依赖 Node、本机固定 OpenClaw、原 AgentGuard 虚拟环境。缺依赖/失败非零退出。需要检查另一份双路配置时使用 `python scripts/check_model_routing.py --config <本地配置路径>`。

脚本做实际本机 HTTP 冒烟：
1. 校验交付默认会话指向 HTTPS API、密钥是环境引用，并用固定宿主 schema 验证配置。
2. 本机模拟 API 接收唯一固定合成消息并回复 `OK`，不读取真实会话作为请求内容。**这仅验证接口形状，不验证真实云账号、额度或 OpenClaw 完整模型循环。**
3. 本机模拟 Ollama 接收合成轨迹的结构化元数据并评分；测试拦截外部目标于 DNS 前。随后关闭全部网络，验证本地启发式仍可工作且标明来源。
4. 测试外部 endpoint、运行中篡改 endpoint、HTTP 重定向、伪装为本机的云模型，以及 Python 生成路径，断言证据请求未发出。
5. 在合成 OpenClaw 配置上应用补丁，断言原护栏插件、工具拒绝规则、网关设置、本地模型不变；缺少密钥时不写配置。现网仅计算哈希核对未变。

报告位于 `local-validation/model-routing/<timestamp>/report.json`，明确 `source=synthetic-local-routing-smoke`、`session_smoke=local-mock-not-cloud-connectivity`。评审模拟服务不是一次真实 Qwen 推理，报告中的分数只验证路由逻辑。

正式部署验收分别记录：① 会话 API 账户可达及使用的实际模型；② 本地评审模型/权重、禁止外发测试；③ 同一新会话中的原安全钩子回归。当前交付自动化完成②的边界验证及①的模拟接口检查，未替代真实云账号验证。


## 2026-11-08 模型菜单修复

原因有两部分：原 U8 的 `gov-session/deepseek-chat` 只提供一个最小模型定义，缺少推理能力和完整允许列表；固定宿主聊天页从 `main` 规范化到 `agent:main:main` 时，提前退出连接初始化。状态已显示 connected，但 `chatMetadataRequestVersion=0`、模型目录为空；网关 `models.list` 实际能返回完整模型列表。

修复：目录使用 DeepSeek 原生供应商名，配置 Flash/Pro 名称、能力及允许列表，保留 Ollama 和旧会话兼容配置。固定版本前端仅在规范会话名落下后补完尚未执行的连接初始化，不修改安全钩子。应用脚本均留备份，不升级。

```powershell
node scripts/fix_openclaw_model_picker.mjs
node scripts/test_model_picker_patch.mjs
node scripts/test_model_routing.mjs
node scripts/test_model_controls_live.mjs
```

最后一条使用本机 Edge、现有网关登录配置和专用空白会话 `agent:main:dashboard:model-controls-smoke`，不发消息。检查菜单、选择 Pro/High 和 Flash/Low，保存并刷新复核；报告及截图在 `local-validation/model-controls/`。自动化运行需要可启动浏览器的主机环境。

使用：强制刷新页面，点击输入框右下角模型名，选择供应商及 Flash/Pro，拖动思考滑块，点击“保存”。旧会话覆盖不会被批量清除；需要时点击“使用默认模型”。

### 速度和思考的真实边界

- `Fast` 是供应商加速服务，不是所有模型都有的通用速度开关。固定版本原生支持名单不含 DeepSeek，因此保留禁用状态，并补中文说明。更快响应可以选 Flash、Off 或 Low。
- Flash 的 Off→none、Minimal/Low→low、Medium/High→high、XHigh→max；已通过固定宿主请求构造器测试。它们不代表六个独立 API 档位。
- 固定版本的 Pro 专用包装层将 Minimal/Low/Medium/High 都发为 high，XHigh 发为 max，Off 关闭思考。Pro 的 Low 不能宣称能降低计算量；本轮保留宿主兼容逻辑，不升级或伪造该能力。
- 模型 ID、上下文及输出上限通过已授权账户的 `/models` 只读核验；未上传轨迹。API 官方说明：[思考控制](https://api-docs.deepseek.com/guides/thinking_mode/)、[模型目录](https://api-docs.deepseek.com/api/list-models/)。


## API 401：代理凭据覆盖环境密钥

2026-11-08 发现 `main/agent/openclaw-agent.sqlite` 的 `auth_profile_store` 中 `deepseek:default` 仍保存失效的旧密钥。模型配置的 env SecretRef 和 `/models` 直接测试正常，不代表既有会话绑定的 auth profile 已更新。原 U8 连通验收遗漏了该优先级。

修复采用固定宿主 `updateAuthProfileStoreWithLock` 事务：只把既有 `deepseek:default` 的内联 `key` 改为 `keyRef={source:env,provider:default,id:DEEPSEEK_API_KEY}`，清除该凭据的旧失败冷却，其他 profile、网关配置和防护规则不动。新密钥须先通过 `/models`，之后再通过 OpenClaw 的指定 profile 解析器核对实际密钥，并发送唯一固定合成消息；任何失败返回非零。

```powershell
node --env-file="$env:USERPROFILE/.openclaw/.env" scripts/repair_session_auth.mjs
openclaw gateway restart
```

实测 exit 0、HTTP 200、回复 OK；报告 `local-validation/model-controls/auth-repair-report.json`。此项验证真实 provider/profile 凭据和固定测试消息，不将现有 Agent 会话上下文发送到云端，不宣称完整 Agent 工具循环通过。
