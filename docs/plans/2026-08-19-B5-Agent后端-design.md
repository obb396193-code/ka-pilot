# B5 Agent 后端设计

> 日期：2026-08-19
> 状态：老板已批准方向；本文用于 `be/b5` 实施和 arch/Claude 后续审查，不修改冻结契约。
> 范围：Agent 会话、显式上下文、记忆、Run、诊断双产物、Claude Agent SDK 单运行时、CCSwitch 式多模型网关、能力探针与安全降级。前端不在本批修改。

## 1. 结论

B5 采用一条运行时、一层应用控制、一个协议网关：

```text
Web / 钉钉 / 后台任务
        │
        ▼
KA Agent Orchestrator
  ├─ 会话/消息/显式上下文/记忆（PostgreSQL 是产品真相）
  ├─ Run 状态、事件、原始日志引用、权限重校验
  ├─ 诊断输入装配、结构化输出校验、安全策略、规则降级
  └─ Provider Router（按场景选择已通过能力探针的模型）
        │
        ▼
Claude Agent SDK（唯一 Agent Runtime，一次 Run 一个 query）
  ├─ 只开放 KA 受控 MCP 工具
  ├─ 无 Bash/Read/Write/Web/子 Agent/本机 Skills
  └─ 流式输出统一转换为 KA Run Event
        │
        ▼
本地模型网关（复用 @the-next-ai/ai-gateway）
  ├─ Anthropic Messages 入口
  ├─ Anthropic / OpenAI Chat / 其他兼容协议转换
  ├─ provider/model 路由、流式 tool-use 保真、重试/熔断
  └─ 短时加密凭证信封解密并注入上游，不把真实 AK 给 Agent
        │
        ├─ IdeaLab OpenAI 兼容端点（Qwen 起步）
        ├─ Anthropic 官方 API
        └─ 其他经能力探针放行的兼容端点
```

核心原则：Claude Agent SDK 负责 Agent 循环，不负责租户、安全、预算、会话真相、业务口径和审计；这些继续由 KA 应用掌握。

## 2. 复用判断

### 2.1 直接复用

1. `@anthropic-ai/claude-agent-sdk@0.3.235`：唯一 Agent Runtime。使用官方 `query()`、partial message streaming、structured output、in-process MCP 和 hook。
2. `@the-next-ai/ai-gateway@1.0.17`：CCR 3.x 使用的 MIT 协议网关核心。复用 Anthropic/OpenAI/Gemini 协议转换、SSE/tool-use 转换、provider fallback、健康检查、并发隔离、熔断与重试。
3. ContentRadar 已上线过的织法：
   - `tools`/`allowedTools`/`disallowedTools`/`dontAsk`/`settingSources=[]`/`strictMcpConfig`/PreToolUse hook 的纵深防御；
   - 流式过程中旁路取 usage，不为记账缓冲整条流；
   - 新引擎一旦开始产出就不切旧引擎，避免重复花钱和重复工具调用；
   - 短时内部令牌、租户绑定、原始日志受限查看；
   - 用户消息先落库、最终响应幂等写回、异常如实留 Run。

### 2.2 不直接照搬

1. ContentRadar 的 Python/FastAPI 代码不复制到本仓；只复用经验证的安全和生命周期方法，按本项目 TypeScript/Worker 架构重写。
2. 不直接依赖完整 `@musistudio/claude-code-router`。当前包包含桌面 UI、SQLite 和较大控制面，Node 要求更高、部署形态不适合本项目。只复用其下层协议网关。
3. 不自己写 Anthropic↔OpenAI 流式/tool-use 协议翻译。该部分边界多、回归成本高，交给成熟网关。
4. 不把 SDK 本地 JSONL 当产品会话真相。Worker/FaaS 会重启、漂移，产品会话必须以 PostgreSQL 为准。

## 3. Agent 会话与上下文

### 3.1 会话真相

- `agent_sessions`：用户会话归属与页面上下文。
- `agent_messages`：用户/助手消息；内容用版本化 JSON envelope，保留展示正文、结构化附件、证据引用和 Run ID。
- `agent_context_items`：只有用户显式选择、页面当前对象和筛选范围三种来源；新建对话默认空。
- `agent_memory`：用户、任务、账户三个 scope；过期规矩不进入 prompt。
- 每次运行前重新校验 session、context item 和 memory 的 workspace/user 权限，不信创建时权限。

### 3.2 FaaS 会话策略

首期采用 SDK ephemeral query：

- `persistSession: false`，不依赖本地磁盘 resume；
- 每次 Run 从数据库读取最近消息、显式对象和有效记忆，装配为本轮输入；
- 一次 `query()` 内的多步工具循环仍由 SDK 完整管理；
- 若未来要使用 SDK `SessionStore` 跨主机持久化，须在 arch 冻结独立存储契约后启用。当前 API 为 alpha，不作为一期真相源。

这样牺牲的是 SDK 跨请求的原生 JSONL resume，换来 FaaS 可迁移、多实例一致和可审计。KA 对话的关键上下文本来就应来自结构化业务对象，而不是依赖某台机器的隐式历史。

## 4. 工具和权限

### 4.1 工具边界

B5 只提供应用注入的受控工具端口：

- `query_metrics`：只读结构化查询；数字由服务返回，模型不得重算。
- `load_context_object`：按已授权的 context item 读取事实快照。
- `dispatch_os_task`：把需要 Multica/OS 的动作作为受审计子任务发出；没有真实协议前只定义端口，不伪造实现。

后续原子能力来自 Capability Registry，但本批不绕过 B3 变更集确认门。

### 4.2 SDK 七道安全约束

1. `tools: []`：关闭全部内置工具。
2. `allowedTools`：只列当前 Run 实际注册的完整 MCP 工具名。
3. `disallowedTools`：显式拒绝 Bash、Read、Write、Edit、WebFetch、WebSearch、Task、Skill 等高风险工具。
4. `permissionMode: "dontAsk"`：未预批准即拒绝，不在 headless 环境等待或默认放行。
5. `settingSources: []`、`skills: []`、`strictMcpConfig: true`：不加载宿主机用户配置、项目配置、Skills、插件和额外 MCP。
6. PreToolUse hook：任何非精确白名单工具一律 deny 并写安全事件。
7. 每个工具 handler 再做 workspace、用户、对象、动作级权限校验；模型传入的 workspace/user 字段一律忽略。

SDK 子进程使用独立临时 cwd，不挂业务源码、不继承无关环境变量。生产部署还需非 root、只读根文件系统、最小出网和子进程资源上限；这些列入部署验收，不用代码注释冒充已经完成。

## 5. CCSwitch 式多模型网关

### 5.1 一个 Runtime，多 Provider

“多模型”不等于“多个 Agent 框架”。所有模型都经过同一个 Claude Agent SDK；Provider Router 只改变 SDK 访问的模型网关路由：

- `anthropic_official`：Anthropic Messages；
- `idealab_openai`：IdeaLab OpenAI Chat Completions，经协议网关转换；
- `compatible_gateway`：其他明确声明协议的兼容端点。

Provider profile 只存非敏感配置：ID、协议、base URL、模型、适用场景、fallback 顺序、超时和能力要求。真实 API key 只通过 SecretResolver 按当前用户、当前 Run 获取。

### 5.2 短时凭证信封

Agent SDK 子进程不拿真实 IdeaLab/Anthropic key：

1. Orchestrator 从 Secret 服务解析当前用户的 secret reference。
2. 用 AES-256-GCM 生成短时凭证信封，绑定 `workspaceId + userId + runId + providerId + model + expiresAt`。
3. SDK 只收到网关 client token、路由头和加密信封。
4. 网关插件校验绑定字段和有效期，解密后向选定上游注入真实鉴权头，并移除 KA 内部敏感头。
5. 日志、错误和 Run event 对凭证、信封、Authorization、x-api-key 做统一脱敏。

这比把用户 AK 塞进 SDK 环境更安全，也比让公共网关长期保存所有用户 key 更容易审计。

### 5.3 网关进程

- 作为 Worker 部署单元内的本地 sidecar 子进程，不新增第四个产品 FaaS 应用；只监听 `127.0.0.1`。
- Worker 启动时做 health check，未就绪则 provider 状态为 unavailable，Agent 走规则降级，不静默直连上游。
- 网关原始 trace 默认关闭；需要排障时只允许有权限的人通过受限 Run 引用查看已脱敏记录。
- 网关进程退出时停止接收新 Run；已产出 Run 不自动换模型重跑。

## 6. Provider Capability Matrix

每个 provider×model 必须经过以下探针后才能用于对应场景：

| 能力 | 探针 | 放行要求 |
|---|---|---|
| connectivity | 最小非流式请求 | 成功且模型名匹配 |
| streaming | 至少 2 个 text delta + 正常结束 | 事件顺序完整、无整流缓冲 |
| tool use | 一个只读测试工具 | tool name/input/result 往返正确 |
| structured output | JSON Schema | SDK result 有合法 structured_output |
| timeout/abort | 主动超时 | 子进程和上游都停止，无幽灵 Run |
| retry/fallback | 首家模拟 429/5xx | 只在首个可见事件前切换 |
| SDK compatible | 一轮完整 query | 无未知 beta/协议字段破坏 |

矩阵状态为 `unknown | probing | healthy | degraded | blocked`。路由必须 fail closed：场景要求的能力没通过，就不启用该模型。

### 6.1 路由与降级

- 秒级问答：优先低延迟已验证模型。
- 诊断/复盘：优先 structured output、tool use 均通过的推理模型。
- 后台任务：必须支持 timeout/abort 和稳定结构化输出。
- fallback 只发生在首个 `delta/tool` 事件之前；一旦对用户有输出或工具已执行，本 Run 固定原 provider，失败如实结束。
- 模型不可用、输出校验失败或超时：诊断走确定性规则 fallback；普通聊天返回可重试错误和 Run ID，不编造答案。

## 7. 流式事件协议

SDK 原始消息统一转换为应用事件，Web API 后续只需序列化为 SSE：

```text
session   {session_id, run_id}
run       {status, provider, model, attempt}
delta     {text}
tool      {tool_name, phase, safe_summary}
evidence  {evidence_refs[]}
done      {message_id, answer, structured_output?, usage, fallback?}
error     {code, message, retryable, run_id}
```

规则：

- 不向前端透传 SDK/网关的任意原始对象。
- tool input/result 只给安全摘要；原始日志走 `raw_log_ref` 受限访问。
- structured output 只在最终 `done` 出现；流式 delta 不能被当作可执行 JSON。
- 客户端断开要触发 AbortController；Run 进入 cancelled/failed，不留运行中的假状态。
- 用户消息先落库；assistant 最终消息和 Run 终态在同一事务完成，重试不得重复写用户消息。

## 8. 诊断双产物

模型只生成一份受 JSON Schema 约束的诊断对象，Markdown 由应用确定性渲染，避免两份内容互相矛盾。

```text
primary_issue
possible_reasons[]
confidence
evidence[]              # 必须引用输入事实 ID，不接收模型自造数字
suggestions[]
  ├─ action
  ├─ params
  ├─ expected_effect     # 只允许引用服务计算结果
  └─ constraint_check
```

输出验证器执行：

- 建议改出价幅度不得超过 20%；预算变动不得超过 50%。
- 没有 evidence ref 的结论降为推断，不能进入自动执行。
- 任何建议都只生成草稿/变更集，不直接写媒体。
- 历史失败动作升级为“排查”，不重复给同一高风险建议。
- 超时、无效 JSON、证据不存在、provider 未验证时，使用规则诊断文案，并明确 `fallback_reason`。

## 9. Run、审计与原始记录

- `agent_runs` 保存用户可见摘要和受限 `raw_log_ref`。
- 原始事件通过 `RunLogStore` 端口落对象存储/日志服务；冻结契约前不自造数据库事件表。
- Run event 必须带 sequence，便于恢复和排障；禁止写 prompt 全文、API key、Authorization、加密信封和未脱敏工具结果。
- 正常用户只见安全事件；具备权限的人可根据 `raw_log_ref` 查看脱敏原始记录。
- SDK 的 cost 字段只作估算和诊断，不能作为结算或财务决策依据；真实用量以后按网关/上游账本对账。

## 10. 本批边界

### 实现

- Agent 领域 schema、安全策略和流式事件规范。
- PostgreSQL 会话、消息、上下文、有效记忆、Run 仓储（只用已冻结列）。
- Claude Agent SDK runtime 适配器、受控工具注册、Abort/超时/输出事件归一化。
- Provider profile、路由、能力矩阵、探针接口、首事件前 fallback。
- 短时凭证信封与网关凭证注入插件。
- `@the-next-ai/ai-gateway` 进程管理、配置模板和本地 fake-upstream 集成测试。
- 诊断 JSON 校验、MD 渲染、安全约束和规则 fallback。
- Orchestrator 组合与全量测试。

### 暂不伪装完成

- Web/Next.js API 路由和前端 SSE 消费：前端工作树未合并，本批只交稳定服务接口和事件协议。
- 真实 IdeaLab/Anthropic 付费调用：没有在仓库写入真实 AK；只做 fake upstream 和无凭证探针。真密钥测试由内网部署阶段执行。
- Multica/OS 真工具：协议和确认边界未冻结，先交端口和安全策略。
- Provider Matrix 持久化、Run event 表、通用多 Provider 凭证表：提交 P-008，arch 裁决后再迁移。

## 11. 验收

1. 新会话默认无 context；跨 workspace/session/user 读取全部拒绝。
2. 过期 memory 不进入 prompt；对象权限每 Run 重验。
3. 诊断非法数字、超 20%/50%、假 evidence 全部被拦并降级。
4. SDK 只看到白名单 MCP 工具；任何内置工具/额外 MCP/宿主设置都不可用。
5. fake Anthropic 与 fake OpenAI 上游均完成非流式、SSE、tool-use、structured output 的协议链测试。
6. provider 只有能力探针通过才可路由；首事件后不 fallback。
7. Agent 子进程只拿短时加密信封，测试证明篡改 workspace/user/run/provider/model/过期时间均拒绝。
8. Run 状态、错误码、safe event、raw_log_ref 完整；日志扫描无密钥和未脱敏 payload。
9. 全仓测试、typecheck、lint、覆盖率和依赖审计通过。

## 12. 调研依据

- [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [TypeScript SDK streaming output](https://code.claude.com/docs/en/agent-sdk/streaming-output)
- [Structured outputs](https://code.claude.com/docs/en/agent-sdk/structured-outputs)
- [Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- [Hosting the Agent SDK](https://code.claude.com/docs/en/agent-sdk/hosting)
- [Secure deployment](https://code.claude.com/docs/en/agent-sdk/secure-deployment)
- [Claude Code Router](https://github.com/musistudio/claude-code-router)
- `@the-next-ai/ai-gateway@1.0.17` npm 包内 README、usage、plugins 文档与 sourcemap 中公开类型。
- ContentRadar 只读参考：`docs/design/2026-08-12-小Me换ClaudeAgentSDK-设计.md`、`docs/plans/2026-08-12-R128-AgentSDK-状态.md` 及 `services/agent_engine/*`、`api/routes/llm_gateway.py`。
