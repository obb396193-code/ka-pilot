# 用 OpenClaw 做工程开发：能干啥、怎么干、如何测试

> 副标题：让你的 AI Agent 不再是黑盒，一文搞定可观测插件开发全流程

---

## 🧭 先说清楚：这篇文章能给你什么

如果你正在用 OpenClaw 开发 AI Agent，并且：

- 想知道 Agent 到底调了哪些工具、耗时多少
- 想在 AOne 上管需求、用 Git 提交代码、全流程不离开命令行
- 想本地跑 Jaeger 验证 Trace 链路，别上线再踩坑

那就继续看。废话不多说，直接上干货。

---

## 一、OpenClaw + 工具链：你能干的工程类事情

OpenClaw 不只是个"跑 Agent"的平台，配合工具链，它可以是你的**工程开发神器**：

| 场景 | 工具 | 你能干啥 |
|------|------|---------|
| 需求管理 | AOne MCP | 查需求、更新状态、关联 Trace 需求 ID |
| 代码提交 | Git + AOne | 写代码 → 提交 → 推送 → 关联需求，一气呵成 |
| 可观测开发 | `openclaw-observability` 插件 | 采集工具调用 + LLM 调用的完整 Trace |
| 本地联调 | Jaeger（Docker） | 不上线，本地就能看链路 |
| 生产监控 | Sunfire + KMon | Trace + Metrics 全打通 |

---

## 二、背景：老插件哪里不行？

现有的 `diagnostics-otel` 插件只能听 `model.usage` 事件，**能力上有三个硬伤**：

1. **没有工具调用 Span**：你调了啥工具？多久？一概不知
2. **Span 全是孤儿**：每个 `model.usage` 生一个 Span，互相之间没父子关系，看 Jaeger 像在看散装葡萄
3. **没注册任何 Plugin Hook**：根本没机会拦截工具调用

所以我们要造一个新插件：`openclaw-observability`。

---

## 三、新插件能干啥：完整 Trace 长这样

```
agent_run (Root Span)        ← 一次对话的根节点
  ├── llm_call               ← 第一次 LLM 调用
  ├── tool_call: git_commit  ← 你调了 git 提交
  ├── llm_call               ← 第二次 LLM 调用
  └── tool_call: aone_update ← 你调了 AOne 更新需求状态
```

清晰、有层级、有父子关系。这才是能用的 Trace。

---

## 四、Plugin Hook 速查：字段哪些能用

### `before_tool_call` / `after_tool_call`

这俩 Hook 是工具调用 Span 的主力。

```ts
// ctx 对象（PluginHookToolContext）
{
  runId?: string       // ✅ 用来关联 Trace，重要
  toolCallId?: string  // ✅ 标识单次调用，optional，需 fallback
  toolName: string
  sessionId?: string
  agentId?: string
}

// after_tool_call 的 event 对象
{
  toolName: string
  params: unknown      // ✅ 工具入参在这里，before 阶段没有
  result?: unknown
  error?: unknown
  durationMs?: number
}
```

> ⚠️ `toolCallId` 可能为空，fallback 方案：`hash(runId + toolName + timestamp)`

---

### `agent_end`

```ts
// ctx 对象（PluginHookAgentContext）
{
  sessionId?: string   // ✅ 靠它反查 runId
  agentId?: string
  // ⚠️ 没有 runId！
}
```

> ⚠️ `agent_end` 里没有 `runId`，你需要提前维护一个映射表：
> `sessionId → [runId1, runId2, ...]`

---

### `llm_input` / `llm_output`

```ts
// llm_input event
{
  runId: string     // ✅ 直接有，用它挂 LLM Span
  sessionId: string
  provider: string
  model: string
}

// llm_output event
{
  runId: string     // ✅ 直接有
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
}
```

LLM 相关 Hook 字段最齐，`runId` 直接可用，舒坦。

---

## 五、开发五步走：带着 AOne 需求一起干

### Step 1：搭插件骨架（AOne #80191705）

```bash
# 创建插件目录
mkdir -p plugins/openclaw-observability/src

# 注册 Plugin Hook（伪代码，实际按框架 API 来）
plugin.registerHook('before_tool_call', onBeforeToolCall)
plugin.registerHook('after_tool_call', onAfterToolCall)
plugin.registerHook('llm_input', onLlmInput)
plugin.registerHook('llm_output', onLlmOutput)
plugin.registerHook('agent_end', onAgentEnd)

# 配置 OTLP exporter，本地调试指向 Jaeger
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

**提交代码 + 关联需求：**
```bash
git add plugins/openclaw-observability/
git commit -m "feat: init openclaw-observability plugin skeleton [#80191705]"
git push
```

---

### Step 2：实现 Trace Context 管理（AOne #80191715）

核心是维护两张内存 Map：

```ts
// Map 1: sessionId → runId 列表（按时间顺序）
const sessionRunMap = new Map<string, string[]>()

// Map 2: runId → Root Span
const rootSpanMap = new Map<string, Span>()

// toolCallId fallback
function getSpanId(ctx: PluginHookToolContext): string {
  return ctx.toolCallId
    ?? `${ctx.runId}-${ctx.toolName}-${Date.now()}`
}
```

---

### Step 3：接 `before/after_tool_call` Hook（AOne #80192767）

```ts
function onBeforeToolCall(ctx: PluginHookToolContext) {
  const spanId = getSpanId(ctx)
  const rootSpan = rootSpanMap.get(ctx.runId!)
  const toolSpan = tracer.startSpan(`tool.${ctx.toolName}`, {
    parent: rootSpan,  // 挂在 root 下，父子关系就来了
  })
  activeSpans.set(spanId, toolSpan)
}

function onAfterToolCall(ctx: PluginHookToolContext, event: PluginHookAfterToolCallEvent) {
  const spanId = getSpanId(ctx)
  const span = activeSpans.get(spanId)
  span?.setAttribute('tool.params', JSON.stringify(event.params))
  span?.setAttribute('tool.success', !event.error)
  span?.setAttribute('tool.duration_ms', event.durationMs ?? 0)
  span?.end()
}
```

---

### Step 4：接 `agent_end` + LLM Hook（AOne #80192784）

```ts
function onLlmInput(event) {
  // 建 Root Span（如果还没有的话）
  if (!rootSpanMap.has(event.runId)) {
    const rootSpan = tracer.startSpan('agent.run')
    rootSpanMap.set(event.runId, rootSpan)
    // 顺手维护 sessionId → runId 映射
    const runs = sessionRunMap.get(event.sessionId) ?? []
    runs.push(event.runId)
    sessionRunMap.set(event.sessionId, runs)
  }
  // 建 LLM Span
  const llmSpan = tracer.startSpan('llm.call', { parent: rootSpanMap.get(event.runId) })
  llmSpans.set(event.runId, llmSpan)
}

function onAgentEnd(ctx) {
  // 没有 runId，靠 sessionId 反查
  const runs = sessionRunMap.get(ctx.sessionId!) ?? []
  const lastRunId = runs[runs.length - 1]
  rootSpanMap.get(lastRunId)?.end()  // 结束根 Span
}
```

---

### Step 5：本地测试，验证 Trace 链路（AOne #80192800）

**这是最爽的一步。**

```bash
# 1. 启动本地 Jaeger（一行命令）
docker run -d \
  -p 16686:16686 \  # Web UI
  -p 4317:4317 \    # OTLP gRPC
  --name jaeger \
  jaegertracing/all-in-one

# 2. 把插件的 OTLP endpoint 指向本地
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# 3. 启动 OpenClaw，触发一次对话
# 例如："帮我查一下 AOne 上 #80191705 的需求状态，然后提交代码"

# 4. 打开 Jaeger UI 查看链路
open http://localhost:16686
```

**在 Jaeger 里你应该看到：**

```
agent_run
  ├── tool.aone_query     (50ms)
  ├── llm_call            (1200ms)
  ├── tool.git_commit     (300ms)
  └── llm_call            (800ms)
```

如果看到的是这样，恭喜，链路完整！

---

## 六、整体架构一图流

```
OpenClaw Runtime
  └── openclaw-observability Plugin
        ├── before/after_tool_call Hook
        ├── llm_input / llm_output Hook
        └── agent_end Hook
              │
              │ OTLP (gRPC)
              ▼
      OpenTelemetry Collector
              │
        ┌─────┴──────┐
        ▼            ▼
      Traces       Metrics
  (Jaeger/本地    (Prometheus/
   Sunfire/生产)   KMon/生产)
        │            │
        └─────┬──────┘
              ▼
        前端可观测平台
      (Overview / Trace / Metrics)
```

**生产接入 endpoint：**
```
http://sunfire-collector.alibaba-inc.com:4317  # 内网 gRPC
采样率：生产 10% / 调试 100%
```

---

## 七、新老插件对比，一眼看差距

| 特性 | diagnostics-otel（老） | openclaw-observability（新） |
|------|:---:|:---:|
| 工具调用 Span | ❌ | ✅ |
| LLM 调用 Span | ⚠️ 孤立 Span | ✅ 挂在 root 下 |
| 父子 Span 关系 | ❌ | ✅ |
| 完整 Trace 链路 | ❌ | ✅ |
| `params` 采集 | ❌ | ✅ |

---

## 八、三阶段交付计划

| 阶段 | 目标 | 关键交付 | AOne 需求 |
|------|------|---------|-----------|
| Phase 1 | 数据接入 | 插件 + OTEL 规范 + Sunfire 验证 | #80179703, #80179706, #80179710 |
| Phase 2 | 前端平台 | Overview + Trace + Metrics 页面 | #80179716, #80179723, #80179727, #80179730 |
| Phase 3 | 告警+权限 | 钉钉/邮件告警 + 多用户接入文档 | #80179739, #80179747 |

**Phase 3 告警规则速查：**

| 触发条件 | 通知方式 |
|----------|---------|
| 工具调用错误率 > 5% | 钉钉 + 邮件 |
| P99 延迟 > 30s | 钉钉 |
| 单次 Token > 100K | 邮件 |
| Agent 运行超 5min | 钉钉 |

---

## 九、一句话总结

> **OpenClaw + `openclaw-observability` 插件 = 你的 Agent 从黑盒变透明。**
> 本地 Jaeger 联调，生产 Sunfire 监控，AOne 管需求，Git 提代码，全链路打通，这才是工程开发该有的样子。

---

_文档由 DocBot 改写，如有幽默过量，请自行调低期望值。_
