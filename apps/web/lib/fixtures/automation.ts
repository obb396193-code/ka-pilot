import type { Fixture, RatioValue } from "@/lib/fixtures/contract"
import rulesList from "@contract/fixtures/rules/list.json"
import rulesExplain from "@contract/fixtures/rules/explain.json"
import rulesExplain7 from "@contract/fixtures/rules/explain-7.json"
import rulesExplain9 from "@contract/fixtures/rules/explain-9.json"
import definitions from "@contract/fixtures/workflows/definitions.json"
import graphV1 from "@contract/fixtures/workflows/graph-v1.json"
import validate from "@contract/fixtures/workflows/validate.json"
import simulate from "@contract/fixtures/workflows/simulate.json"
import runs from "@contract/fixtures/workflows/runs.json"
import runDetail from "@contract/fixtures/workflows/run-detail.json"
import capabilities from "@contract/fixtures/capabilities/list.json"
import agentRuns from "@contract/fixtures/agent/runs.json"
import agentRunEvents from "@contract/fixtures/agent/run-events.json"
import agentRunEvents1802 from "@contract/fixtures/agent/run-events-1802.json"
import health from "@contract/fixtures/system/health.json"

// 自动化（F-007 §5，契约 v1.3 rules/explain · v1.5 capabilities · v1.5.1 ③ workflow-graph/v1）fixture 读取层。不算数。

// ---- 规则 ----
export type RuleLeaf = { metric: string; operator: string; threshold: number | string; window_hours?: number }
export type RuleItem = { ruleId: number; name: string; type: "monitor" | "auto"; conditionTree: { version: string; all?: RuleLeaf[]; any?: RuleLeaf[] }; nextEvalAt: string; enabled: boolean; autonomyLevel: number; availabilityPolicy: string; notTriggeredReason: string | null; last7d: { triggered: number; succeeded: number }; owner: { userId: string; name: string } | null }
export const rulesFixture = rulesList as unknown as Fixture<{ items: RuleItem[] }>
export const notTriggeredLabel: Record<string, string> = { CONDITION_FALSE: "条件未满足", METRIC_MISSING: "指标缺数", SOURCE_STALE: "数据源过期", COLD_START_RELAXED: "冷启动放宽", INITIAL_FULL_PENDING: "首次全量未完成", MUTED: "已静音", DEDUPED: "已去重", INSUFFICIENT_SAMPLE: "样本不足" }
export const autonomyLevels = [
  { value: 0, label: "只提醒", hint: "命中只进工作项，不出草稿" },
  { value: 1, label: "出草稿", hint: "命中生成变更集草稿，人确认后执行" },
  { value: 2, label: "自动执行", hint: "命中直接执行（仍走变更集留痕），执行后回执" },
]
export type RuleExplain = { ruleId: number; accountId: string; ds: string; leaves: { metric: string; operator: string; threshold: number | string; value: number | null; availability: "available" | "missing" | "error"; pass: boolean | null }[]; notTriggeredReason: string | null; fallbackCopy: string }
export const ruleExplainFixture = rulesExplain as unknown as Fixture<RuleExplain>
// arch 第三批补了规则 7 / 9 的判定样例，按 ruleId 取
export const ruleExplainFixtures: Record<number, Fixture<RuleExplain>> = {
  3: rulesExplain as unknown as Fixture<RuleExplain>,
  7: rulesExplain7 as unknown as Fixture<RuleExplain>,
  9: rulesExplain9 as unknown as Fixture<RuleExplain>,
}
export const metricLabel: Record<string, string> = { cash_cpa: "现金 CPA", real_conversion: "真实转化", cost: "账面消耗", cash_cost: "现金消耗", ctr: "CTR", assessment_price: "考核价", exposure: "曝光", click: "点击" }
export const conditionText = (tree: RuleItem["conditionTree"]): string => {
  const leaves = tree.all ?? tree.any ?? []
  const join = tree.all ? " 且 " : " 或 "
  return leaves.map((leaf) => `${metricLabel[leaf.metric] ?? leaf.metric} ${leaf.operator} ${typeof leaf.threshold === "string" ? (metricLabel[leaf.threshold] ?? leaf.threshold) : leaf.threshold}${leaf.window_hours ? `（${leaf.window_hours}h）` : ""}`).join(join)
}

// ---- 工作流定义 / 画布 ----
export type WorkflowDefinition = { id: string; name: string; version: string; assetType: "official_template" | "personal" | "team"; risk: "low" | "medium" | "high"; avgDurationMin?: number; successRate?: RatioValue; useCount?: number; description?: string; copiedFrom?: string }
export const definitionsFixture = definitions as unknown as Fixture<{ official: WorkflowDefinition[]; mine: WorkflowDefinition[]; team: WorkflowDefinition[] }>
export const riskLabel: Record<WorkflowDefinition["risk"], string> = { low: "低风险", medium: "中风险", high: "高风险" }

export type NodeType = "trigger" | "query" | "compute" | "condition" | "agent_analysis" | "changeset" | "human_confirm" | "execute" | "wait_reconcile" | "notify"
export type ExecutorIdentity = "system_automation" | "initiator" | "credential_owner"
export type SideEffect = "read" | "write" | "external"
export type GraphNode = { id: string; type: NodeType; label: string; params: Record<string, unknown>; executor_identity: ExecutorIdentity; side_effect: SideEffect; idempotency: "key_required" | "none"; retry: { max: number; backoff: "fixed" | "exponential"; base_ms: number }; timeout_ms: number; permission_scope: string[] }
export type GraphEdge = { from: string; to: string; condition: { expr: string } | null }
export type WorkflowGraph = { version: "workflow-graph/v1"; nodes: GraphNode[]; edges: GraphEdge[] }
export type WorkflowVersion = { definitionId: string; version: number; status: "draft" | "published" | "deprecated"; paramsSchema: { type: string; required?: string[]; properties?: Record<string, { type: string }> }; graph: WorkflowGraph }
export const graphFixture = graphV1 as unknown as Fixture<WorkflowVersion>
/** 节点库十类（契约 ③ 注释顺序）；默认属性只是新建节点的起手值，仍要过 validate */
export const nodeTypeMeta: Record<NodeType, { label: string; hint: string; sideEffect: SideEffect; executor: ExecutorIdentity }> = {
  trigger: { label: "触发", hint: "读取任务配置 / 定时 / 事件", sideEffect: "read", executor: "system_automation" },
  query: { label: "查数", hint: "按指定查询读指标或账户", sideEffect: "read", executor: "system_automation" },
  compute: { label: "计算", hint: "只用已冻结的口径公式", sideEffect: "read", executor: "system_automation" },
  condition: { label: "条件", hint: "按边表达式分流", sideEffect: "read", executor: "system_automation" },
  agent_analysis: { label: "Agent 分析", hint: "出诊断结论 + 证据两份产物", sideEffect: "read", executor: "system_automation" },
  changeset: { label: "变更集", hint: "生成草稿，不落媒体", sideEffect: "write", executor: "system_automation" },
  human_confirm: { label: "人工确认", hint: "写媒体前必经", sideEffect: "read", executor: "initiator" },
  execute: { label: "执行", hint: "凭证所有者身份执行", sideEffect: "write", executor: "credential_owner" },
  wait_reconcile: { label: "等待回读", hint: "冷启动或结果未知时回读媒体", sideEffect: "read", executor: "system_automation" },
  notify: { label: "通知", hint: "发钉钉卡片", sideEffect: "external", executor: "system_automation" },
}
export const nodeTypeOrder: NodeType[] = ["trigger", "query", "compute", "condition", "agent_analysis", "changeset", "human_confirm", "execute", "wait_reconcile", "notify"]
export const executorLabel: Record<ExecutorIdentity, string> = { system_automation: "系统自动", initiator: "发起人", credential_owner: "凭证所有者" }
export const sideEffectLabel: Record<SideEffect, string> = { read: "只读", write: "写媒体", external: "外部调用" }

export type ValidateResult = { schema: { check: string; pass: boolean; detail?: string }[]; permissions: { check: string; pass: boolean; detail?: string }[]; links: { check: string; pass: boolean; detail?: string }[]; missing_params: { node_id: string; param: string; required: boolean }[]; canPublish: boolean }
export const validateFixture = validate as unknown as Fixture<ValidateResult>
export type SimulateResult = { steps: { node_id: string; status: "ok" | "skipped" | "would_wait" | "error"; preview: unknown }[] }
export const simulateFixture = simulate as unknown as Fixture<SimulateResult>

// ---- 运行 ----
export type RunStatus = "RUNNING" | "WAITING_CONFIRMATION" | "PARTIAL_SUCCESS" | "UNKNOWN" | "SUCCESS" | "FAILED"
export const runStatusMeta: Record<RunStatus, { label: string; tone: "progress" | "warning" | "muted" | "success" | "critical" | "pending" }> = {
  RUNNING: { label: "运行中", tone: "progress" },
  WAITING_CONFIRMATION: { label: "待确认", tone: "warning" },
  PARTIAL_SUCCESS: { label: "部分成功", tone: "warning" },
  UNKNOWN: { label: "结果未知 · 待回读", tone: "muted" },
  SUCCESS: { label: "成功", tone: "success" },
  FAILED: { label: "失败", tone: "critical" },
}
export type RunItem = { runId: string; name: string; version: string; status: RunStatus; stepIndex: number; stepTotal: number; startedAt: string; eta: string | null; initiator: { userId: string; name: string } }
export const runsFixture = runs as unknown as Fixture<{ items: RunItem[]; page: number; pageSize: number; total: number }>
export type RunDetail = {
  run: { id: string; version: string; initiator: { userId: string; name: string }; executor_identity: ExecutorIdentity; status: RunStatus; taskId: string | null }
  stages: { node_id: string; label: string; status: "done" | "running" | "pending" | "failed" | "skipped"; started_at: string | null; finished_at: string | null; input_excerpt: unknown; output_excerpt: unknown }[]
  changeset_preview: { group_id?: string; changeset_id?: string; items: { targetType: string; targetId: string; field: string; from: { type: string; value: unknown }; to: { type: string; value: unknown }; riskLevel: "low" | "medium" | "high"; dataAsOf: string }[]; hash: string; expires_at: string } | null
  permission_checks: { check: string; pass: boolean }[]
  account_locks: { media: string; account_id: string; conflict: boolean; locked_by: string | null }[]
  trace: { correlation_id: string; trace_id: string; span_id: string }
  audit: { at: string; actor: { userId: string; name: string } | "system"; action: string; detail: string }[]
  retry_policy: { max: number; backoff: string; base_ms: number }
  reconcile_policy: { on_unknown: string; window_min: number }
  unknown_explain: string
}
export const runDetailFixture = runDetail as unknown as Fixture<RunDetail>

// ---- 原子能力 ----
export type FormSchema = { type: "object"; required?: string[]; properties?: Record<string, { type: string; enum?: string[]; items?: { type: string }; minimum?: number }> }
export type CapabilityItem = { key: string; name: string; category: "query" | "write" | "infra" | "account"; status: "verified" | "documented_unverified" | "disabled"; executor: string; media: string[]; permission: string; version: string; form_schema: FormSchema }
export const capabilitiesFixture = capabilities as unknown as Fixture<{ items: CapabilityItem[] }>
export const capabilityStatusMeta: Record<CapabilityItem["status"], { label: string; tone: "success" | "warning" | "muted" }> = { verified: { label: "已验证", tone: "success" }, documented_unverified: { label: "有文档未验证", tone: "warning" }, disabled: { label: "禁用", tone: "muted" } }
export const capabilityCategoryLabel: Record<CapabilityItem["category"], string> = { query: "查数", write: "写媒体", infra: "基建", account: "账户" }

// ---- Agent 运行 ----
export type AgentRunItem = { runId: string; kind: string; status: "done" | "failed" | "running"; startedAt: string; durationMs: number | null; tokens: { in: number; out: number } | null; budgetUsd: number | null; result: Record<string, string> | null; error?: string }
export const agentRunsFixture = agentRuns as unknown as Fixture<{ items: AgentRunItem[] }>
export const agentRunEventsFixture = agentRunEvents as unknown as Fixture<{ runId: string; events: { seq: number; kind: string; at: string; tool?: string; argsExcerpt?: unknown; ok?: boolean; schema?: string; status?: string }[]; rawLogAccess: "restricted" | "full" }>
// arch 第三批补了失败 run 的事件流，按 runId 取
export const agentRunEventsFixtures: Record<string, Fixture<{ runId: string; events: { seq: number; kind: string; at: string; tool?: string; argsExcerpt?: unknown; ok?: boolean; schema?: string; status?: string }[]; rawLogAccess: "restricted" | "full" }>> = {
  [(agentRunEvents as { data?: { runId?: string } }).data?.runId ?? "unknown"]: agentRunEvents as unknown as Fixture<{ runId: string; events: { seq: number; kind: string; at: string; tool?: string; argsExcerpt?: unknown; ok?: boolean; schema?: string; status?: string }[]; rawLogAccess: "restricted" | "full" }>,
  [(agentRunEvents1802 as { data?: { runId?: string } }).data?.runId ?? "unknown-2"]: agentRunEvents1802 as unknown as Fixture<{ runId: string; events: { seq: number; kind: string; at: string; tool?: string; argsExcerpt?: unknown; ok?: boolean; schema?: string; status?: string }[]; rawLogAccess: "restricted" | "full" }>,
}

// ---- 顶部健康五卡 ----
export const automationHealthFixture = health as unknown as Fixture<{ overall: "green" | "yellow" | "red"; connectors: { total: number; ok: number }; executors: { total: number; ok: number }; queue: { pending: number }; agent: { instances: number; ok: number }; healthScore: number }>

// 画布上参数名 / 权限项在界面显中文（后端仍用英文 key）
export const paramLabel: Record<string, string> = { account_scope: "账户范围", min_recharge: "最低充值额", confirmer: "确认人", task_id: "任务", window: "时间窗口", threshold: "阈值", template_id: "模板", target_group: "目标群", material_id: "素材", budget_cap: "预算上限" }
export const permissionLabel: Record<string, string> = { "accounts:read": "读账户", "changesets:write": "写变更集", "changesets:execute": "执行变更集", "notify:send": "发通知", "materials:read": "读素材", "reports:write": "写报告" }
export const paramText = (key: string) => paramLabel[key] ?? key
export const permissionText = (key: string) => permissionLabel[key] ?? key

// 媒体侧字段名在界面显中文（后端仍用英文 key）
export const fieldLabel: Record<string, string> = { bid: "出价", "bid.tool": "出价工具", cpa_bid: "转化出价", budget: "预算", day_budget: "日预算", budget_rhythm: "预算节奏", placement: "版位", schedule: "投放时段", status: "状态", audience: "人群" }
export const fieldText = (key: string) => fieldLabel[key] ?? key
