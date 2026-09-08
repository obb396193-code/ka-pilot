# B5 Agent 后端实施计划

> **执行要求：** 严格按任务顺序，小步测试先行；每个任务完成后更新 `B5-状态.md` 和工作台账。冻结契约外的字段/表/端点只写 P-008，不在代码里偷塞。

**目标：** 在 `be/b5` 分支交付不依赖前端的 Agent 后端：会话/上下文/记忆/Run、诊断双产物、Claude Agent SDK 单运行时、复用协议网关的多模型切换、能力探针、fallback 和安全审计。

**架构：** PostgreSQL 是产品会话真相；Worker Orchestrator 装配上下文并调用 Claude Agent SDK；SDK 只用受控 in-process MCP 工具；`@the-next-ai/ai-gateway` 作为 Worker 内 localhost sidecar 负责 Anthropic/OpenAI 协议转换；短时 AES-GCM 信封把真实 provider key 隔离在网关注入层。

**技术栈：** TypeScript 5.9、Node 22、PostgreSQL 16、Vitest、Zod 4、`@anthropic-ai/claude-agent-sdk@0.3.235`、`@the-next-ai/ai-gateway@1.0.17`。

---

## Task 1：锁定依赖和 B5 可选配置

**Files:**

- Modify: `apps/worker/package.json`
- Modify: `apps/worker/package-lock.json`
- Modify: `apps/worker/.env.example`
- Modify: `apps/worker/src/config.ts`
- Create: `apps/worker/test/config.test.ts`

**Step 1：先写失败测试**

- B5 默认关闭时不要求任何 Agent/gateway 配置，既有 Worker 可原样启动。
- 开启 Agent 时要求 gateway client key、32-byte envelope key、provider profiles 和超时/轮次上限。
- provider profile JSON 不接受空模型、非 HTTP(S) base URL、重复 ID 和明文 API key 字段。

**Step 2：运行测试确认失败**

Run: `npm test -- --run test/config.test.ts`

**Step 3：安装精确版本并实现配置解析**

Run: `npm install --save-exact @anthropic-ai/claude-agent-sdk@0.3.235 @the-next-ai/ai-gateway@1.0.17`

新增可选环境变量：`AGENT_ENABLED`、`AGENT_MAX_TURNS`、`AGENT_TIMEOUT_MS`、`MODEL_GATEWAY_*`、`MODEL_PROVIDER_PROFILES_JSON`。真实 AK 不进入 env example。

**Step 4：测试和静态检查**

Run: `npm test -- --run test/config.test.ts && npm run typecheck && npm run lint`

**Step 5：提交**

Commit: `[be] 增加B5运行时配置`

## Task 2：Agent 领域类型、事件和诊断安全策略

**Files:**

- Modify: `packages/domain/package.json`
- Modify: `packages/domain/package-lock.json`
- Create: `packages/domain/src/agent-events.ts`
- Create: `packages/domain/src/agent-context.ts`
- Create: `packages/domain/src/agent-provider.ts`
- Create: `packages/domain/src/agent-diagnosis.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/domain/test/agent-events.test.ts`
- Create: `packages/domain/test/agent-diagnosis.test.ts`
- Create: `packages/domain/test/agent-provider.test.ts`

**Step 1：写失败测试**

- Run event sequence、可见事件判定、safe payload 红线。
- provider capability `unknown/probing/healthy/degraded/blocked` 和场景必需能力。
- diagnosis Zod schema、evidence ref 校验、改价≤20%、预算≤50%、历史失败降为排查。
- Markdown 由 JSON 确定性渲染，不能新增 JSON 中没有的数字。
- invalid/timeout/capability 缺失进入带 `fallback_reason` 的规则结果。

**Step 2：运行测试确认失败**

Run: `npm test -- --run test/agent-events.test.ts test/agent-diagnosis.test.ts test/agent-provider.test.ts`

**Step 3：实现纯领域代码**

Run: `npm install --save-exact zod@4.1.5`

不依赖数据库、SDK 或 HTTP；所有日期/数字语义显式，不接收 `NaN/Infinity`。

**Step 4：测试和覆盖率**

Run: `npm test -- --run && npm test -- --run --coverage && npm run typecheck && npm run lint`

**Step 5：提交**

Commit: `[be] 实现Agent诊断安全领域模型`

## Task 3：PostgreSQL 会话、上下文、记忆和 Run 仓储

**Files:**

- Create: `packages/db/src/agent-repository.ts`
- Modify: `packages/db/src/credential-repository.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/test/agent-repository.test.ts`

**Step 1：写 PostgreSQL 失败测试**

- 新会话默认 `page_context=NULL`，不自动带上一会话对象。
- session/message/context/memory/run 全部做 workspace+user 归属校验。
- context 重复添加幂等、删除只影响当前 session。
- 只返回未过期 memory；user scope 只返回当前用户。
- 用户消息先落库；assistant 消息与 Run 成功终态同一事务。
- 失败 Run 记录安全摘要和 raw log ref；不把异常栈/凭证写 summary。
- `idealab_ak_ref` 只返回 secret reference，不返回明文。

**Step 2：运行测试确认失败**

Run: `npm test -- --run test/agent-repository.test.ts`

**Step 3：实现 Repository**

只使用现有 `agent_*`/`users` 列；缺失的 Run 扩展字段不塞进 `summary` 冒充结构化存储。用事务 advisory lock 弥补 context 缺唯一约束，并在 P-008 保留迁移建议。

**Step 4：全包检查**

Run: `npm test -- --run && npm test -- --run --coverage && npm run typecheck && npm run lint`

**Step 5：提交**

Commit: `[be] 实现Agent会话与Run仓储`

## Task 4：短时凭证信封和网关注入插件

**Files:**

- Create: `apps/worker/src/agent/gateway/credential-envelope.ts`
- Create: `apps/worker/gateway/ka-credential-injector.mjs`
- Create: `apps/worker/test/agent/credential-envelope.test.ts`
- Create: `apps/worker/test/agent/gateway-plugin.test.ts`

**Step 1：写失败测试**

- AES-256-GCM 信封正常 round-trip，明文 key 不出现在 token 中。
- workspace/user/run/provider/model 任一绑定字段被改均拒绝。
- 过期、未来签发、错误 key、截断 token、重放到另一 Run 均拒绝。
- 插件只在目标 provider 匹配时运行，解密后注入正确上游鉴权。
- 插件移除 `authorization/x-api-key/x-ka-*` 等内部头，不把 gateway client token 转发上游。
- 任何错误只返回稳定错误码，不回显 token、key 或密文。

**Step 2：运行测试确认失败**

Run: `npm test -- --run test/agent/credential-envelope.test.ts test/agent/gateway-plugin.test.ts`

**Step 3：实现信封和插件**

信封版本化为 `kae1`；nonce 每次随机；AAD 使用固定字段顺序；默认 TTL 5 分钟，时钟可注入测试。

**Step 4：安全扫描和测试**

Run: `npm test -- --run test/agent/credential-envelope.test.ts test/agent/gateway-plugin.test.ts && npm run typecheck && npm run lint`

**Step 5：提交**

Commit: `[be] 实现模型网关短时凭证信封`

## Task 5：Provider 路由、能力矩阵、探针和首事件前 fallback

**Files:**

- Create: `apps/worker/src/agent/provider/types.ts`
- Create: `apps/worker/src/agent/provider/router.ts`
- Create: `apps/worker/src/agent/provider/capability-store.ts`
- Create: `apps/worker/src/agent/provider/probe-service.ts`
- Create: `apps/worker/src/agent/provider/fallback.ts`
- Create: `apps/worker/test/agent/provider-router.test.ts`
- Create: `apps/worker/test/agent/provider-probe.test.ts`
- Create: `apps/worker/test/agent/provider-fallback.test.ts`

**Step 1：写失败测试**

- profile 重复/禁用/模型不匹配拒绝。
- 问答、诊断、后台任务按各自 required capabilities 过滤。
- `unknown/degraded/blocked` 不得被当 healthy。
- probe 的 connectivity/stream/tool/structured/abort 结果逐项保存，版本变化使旧结果失效。
- 429/5xx/timeout 可在首个可见事件前切下一候选。
- 第一个 delta/tool 后任何错误都固定当前 provider，不重跑。

**Step 2：运行测试确认失败**

Run: `npm test -- --run test/agent/provider-*.test.ts`

**Step 3：实现**

CapabilityStore 首期提供内存实现和接口；生产持久化留 P-008。路由返回完整决策说明，Run 可显示“为什么没选另一个模型”。

**Step 4：检查**

Run: `npm test -- --run test/agent/provider-*.test.ts && npm run typecheck && npm run lint`

**Step 5：提交**

Commit: `[be] 实现多模型能力路由与降级`

## Task 6：Claude Agent SDK 安全运行时和流式事件归一化

**Files:**

- Create: `apps/worker/src/agent/sdk/safety.ts`
- Create: `apps/worker/src/agent/sdk/tools.ts`
- Create: `apps/worker/src/agent/sdk/message-adapter.ts`
- Create: `apps/worker/src/agent/sdk/runtime.ts`
- Create: `apps/worker/test/agent/sdk-safety.test.ts`
- Create: `apps/worker/test/agent/sdk-message-adapter.test.ts`
- Create: `apps/worker/test/agent/sdk-runtime.test.ts`

**Step 1：写失败测试**

- options 必须是 `tools:[]`、精确 MCP allowlist、`dontAsk`、`settingSources:[]`、`skills:[]`、`strictMcpConfig:true`、`persistSession:false`。
- PreToolUse 对非 allowlist 工具 deny；任何人改坏安全选项，runtime 启动前自审失败。
- env 只保留最小 PATH/临时 HOME/网关变量，不继承数据库、Multica、启航和宿主 key。
- partial `text_delta` → `delta`；tool start/stop → safe `tool`；result → `done/error`；未知 SDK message 忽略并计数。
- AbortController、总 timeout、maxTurns、maxBudget、stderr 脱敏生效。
- structured output 只从 final result 读取。

**Step 2：运行测试确认失败**

Run: `npm test -- --run test/agent/sdk-*.test.ts`

**Step 3：实现真实 SDK adapter**

生产路径真实 import `query/createSdkMcpServer/tool`；测试通过注入 QueryFactory，不外呼。工具 handler 只拿服务端闭包里的 AuthContext，不信模型输入身份。

**Step 4：检查 SDK 真实可加载**

Run: `node -e "import('@anthropic-ai/claude-agent-sdk').then(m=>{if(typeof m.query!=='function')process.exit(1)})"`

Run: `npm test -- --run test/agent/sdk-*.test.ts && npm run typecheck && npm run lint`

**Step 5：提交**

Commit: `[be] 接入Claude Agent SDK安全运行时`

## Task 7：协议网关 sidecar、fake upstream 和流式链路测试

**Files:**

- Create: `apps/worker/src/agent/gateway/config-builder.ts`
- Create: `apps/worker/src/agent/gateway/process-manager.ts`
- Create: `apps/worker/src/agent/gateway/index.ts`
- Create: `apps/worker/gateway/gateway.config.example.json`
- Create: `apps/worker/test/agent/gateway-config.test.ts`
- Create: `apps/worker/test/agent/gateway-process.test.ts`
- Create: `apps/worker/test/agent/gateway-e2e.test.ts`

**Step 1：写失败测试**

- 配置只监听 127.0.0.1；manager/raw trace/MCP/内置 agent 默认关闭。
- provider 配置不含真实 key，只含 placeholder；插件必须启用。
- 子进程 readiness、启动超时、崩溃、幂等 stop、stderr 脱敏。
- fake Anthropic 上游与 fake OpenAI Chat 上游：非流式、SSE 文本、tool-use 事件、usage 和错误状态转换。
- 信封过期/篡改时 fake upstream 请求数必须为 0。

**Step 2：运行测试确认失败**

Run: `npm test -- --run test/agent/gateway-*.test.ts`

**Step 3：实现 sidecar 管理**

通过依赖包 bin 启动，不复制网关源码；运行时生成无 secret 的临时 config；client key/envelope key 只进 child env；默认不由既有 Worker 自动启动，只有 `AGENT_ENABLED=true` 才组合。

**Step 4：执行 fake E2E**

Run: `npm test -- --run test/agent/gateway-e2e.test.ts && npm run typecheck && npm run lint`

若依赖包的公开 CLI/config 行为与文档不符，记录证据并降级为“外部 gateway adapter 端口”，不得为了过测试重写协议转换。

**Step 5：提交**

Commit: `[be] 接入可切模型的本地协议网关`

## Task 8：上下文装配、诊断服务和 Orchestrator 闭环

**Files:**

- Create: `apps/worker/src/agent/context-assembler.ts`
- Create: `apps/worker/src/agent/diagnosis-service.ts`
- Create: `apps/worker/src/agent/orchestrator.ts`
- Create: `apps/worker/src/agent/index.ts`
- Modify: `apps/worker/src/runtime.ts`
- Create: `apps/worker/test/agent/context-assembler.test.ts`
- Create: `apps/worker/test/agent/diagnosis-service.test.ts`
- Create: `apps/worker/test/agent/orchestrator.test.ts`

**Step 1：写失败测试**

覆盖完整路径：用户消息先落库；session/context/memory 每 Run 重新鉴权；数值事实带 evidence ID 和口径；路由只选 capability 通过的 provider；流式事件顺序稳定；非法诊断走规则 fallback；assistant 消息+Run 成功原子完成；异常/取消如实记 Run；跨租户、过期 memory、重复完成、首事件后 fallback 全部拒绝。

**Step 2：运行测试确认失败**

Run: `npm test -- --run test/agent/context-assembler.test.ts test/agent/diagnosis-service.test.ts test/agent/orchestrator.test.ts`

**Step 3：实现 Orchestrator**

依赖全部通过端口注入：Repository、ContextObjectResolver、SecretResolver、RunLogStore、EventSink、AgentRuntime、CapabilityStore。现有 Worker composition 只在 Agent 配置完整时注册，不能影响 ETL/B2/B3/B4 handler。

**Step 4：全 Worker 检查**

Run: `npm test -- --run && npm test -- --run --coverage && npm run typecheck && npm run lint`

**Step 5：提交**

Commit: `[be] 完成Agent诊断运行闭环`

## Task 9：实际 SDK + fake 网关烟测

**Files:**

- Create: `apps/worker/test/agent/sdk-gateway-smoke.test.ts`
- Create: `docs/evidence/B5-SDK-fake-gateway烟测.md`

**Step 1：写 opt-in 烟测**

烟测启动 fake OpenAI upstream → 本地协议 gateway → 真 Claude Agent SDK `query()` 子进程，验证至少收到 system init、partial text delta、result；路由匹配；Agent 进程环境只有加密信封；Abort 后退出；不访问真实 provider。

**Step 2：运行烟测**

Run: `KA_RUN_AGENT_SDK_SMOKE=1 npm test -- --run test/agent/sdk-gateway-smoke.test.ts`

如果 SDK 对 fake 模型输出有未公开控制协议要求导致无法完成，报告必须写明卡点和已完成的链路层级，不能把 unit mock 说成真 SDK E2E。

**Step 3：提交**

Commit: `[be] 验证Agent SDK本地网关链路`

## Task 10：全量质量门禁和交付

**Files:**

- Create: `docs/evidence/B5-代码质量报告.md`
- Modify: `docs/plans/B5-状态.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1：全包测试**

分别在 `packages/domain`、`packages/db`、`apps/worker`、`apps/dingtalk-gateway` 运行测试、coverage、typecheck、lint 和 `npm audit --audit-level=high`。

**Step 2：数据库和回归**

- PostgreSQL 16 healthy；全部迁移重放通过。
- 既有 B1-B4 测试不得减少，不得通过跳过/删除断言“修绿”。
- Agent 配置关闭时既有 Worker 启动/consumer 组合不变。

**Step 3：安全审计**

- secret/header/prompt/raw payload 日志扫描。
- 动态执行、shell 注入、SSRF、任意 path、宽工具权限扫描。
- 依赖许可证与漏洞扫描；记录 Claude Agent SDK 商业条款和 Next AI Gateway MIT 边界。
- 复杂度、重复代码、未覆盖错误分支检查。

**Step 4：交付留痕**

- 质量报告列测试数、覆盖率、依赖审计、fake/真联调边界。
- `B5-状态.md` 全项更新；工作台账新增交付；P-008 写 B5 SHA 和 arch 必审红线。

**Step 5：最终提交与自查**

Commit: `[be] 记录B5 Agent后端交付`

Run: `git show --stat HEAD && git status --short`

交付后不 push；等待 arch/Claude 对 P-008、SDK 安全选项、凭证插件和网关 sidecar 做逐项审计。
