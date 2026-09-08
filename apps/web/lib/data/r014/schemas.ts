import { z } from "zod"

// apps/web 不依赖 @ka/domain，契约按既有做法在前端侧镜像。
// 这些 schema 逐条对应 packages/domain/src/r014/*，改后端必须同步改这里——
// 不同步的后果是 BFF 以 UPSTREAM_INVALID_RESPONSE 挡住，正是这层校验的用处。
const ratioValueSchema = z.object({
  value: z.number().finite().nullable(),
  state: z.enum(["finite", "infinite", "undefined"]),
}).strict()

const metricValueSchema = z.object({
  value: z.number().finite().nullable(),
  availability: z.enum(["available", "missing", "error"]),
}).strict()

/* me/counts（v1.7.1） */
export const meCountsSchema = z.object({
  workItems: z.object({
    open: z.number().int().nonnegative(),
    p0: z.number().int().nonnegative(),
    p1: z.number().int().nonnegative(),
    opportunity: z.number().int().nonnegative(),
  }).strict(),
  approvalsToApprove: z.number().int().nonnegative(),
  dispatchesReceived: z.number().int().nonnegative(),
  runsWaitingConfirmation: z.number().int().nonnegative(),
  notificationsUnread: z.number().int().nonnegative(),
  changesetsDraft: z.number().int().nonnegative(),
}).strict()

/* me/preferences（v1.7.1） */
export const mePreferencesSchema = z.object({
  theme: z.object({
    mode: z.enum(["bw", "bwc", "full"]),
    hue: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }).strict(),
  locale: z.string().min(2).max(35).nullable(),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

/* me/workload（v1.7.4 G9） */
export const meWorkloadSchema = z.object({
  tasks: z.object({ owned: z.number().int().nonnegative(), participating: z.number().int().nonnegative() }).strict(),
  accounts: z.object({ owned: z.number().int().nonnegative(), watching: z.number().int().nonnegative() }).strict(),
  pending: z.object({
    workItems: z.number().int().nonnegative(),
    approvals: z.number().int().nonnegative(),
    dispatches: z.number().int().nonnegative(),
    runsWaitingConfirmation: z.number().int().nonnegative(),
  }).strict(),
  oncall: z.object({
    today: z.boolean(),
    next: z.object({ at: z.string().min(1), role: z.string().min(1) }).strict().nullable(),
  }).strict(),
  loadScore: z.object({
    value: ratioValueSchema,
    source: z.enum(["not_configured", "formula", "manual"]),
    formula: z.string().min(1).nullable(),
  }).strict(),
}).strict()

/* me/notifications（v1.7.8 G10） */
export const meNotificationsSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["alert", "approval", "dispatch", "run", "system"]),
    severity: z.enum(["p0", "p1", "p2", "info", "warning"]),
    title: z.string().min(1),
    body: z.string(),
    at: z.string().datetime({ offset: true }),
    read: z.boolean(),
    ref: z.object({ type: z.string().min(1), id: z.string().min(1) }).strict().nullable(),
    href: z.string().min(1),
  }).strict()),
  unread: z.number().int().nonnegative(),
  nextCursor: z.string().min(1).nullable(),
}).strict()

export const meNotificationsReadSchema = z.object({ unread: z.number().int().nonnegative() }).strict()

/* search（v1.7.4 G6 + v1.9 ⑦：后端只出机器 meta，中文由前端组装） */
export const searchResultSchema = z.object({
  items: z.array(z.object({
    type: z.enum(["account", "task", "work_item", "material", "document"]),
    id: z.string().min(1),
    title: z.string().min(1),
    meta: z.object({
      status: z.string().min(1).optional(),
      stage: z.string().min(1).optional(),
      taskName: z.string().min(1).optional(),
      accountCount: z.number().int().nonnegative().optional(),
      severity: z.string().min(1).optional(),
      kind: z.string().min(1).optional(),
      durationMs: z.number().int().nonnegative().optional(),
      analysisVersion: z.number().int().nonnegative().optional(),
    }).strict(),
    href: z.string().min(1),
    workspaceKind: z.enum(["personal", "team"]),
  }).strict()),
}).strict()

/* accounts/pipeline（v1.5.1 ①） */
export const POOL_STATUS_ORDER = [
  "available", "assigned", "pending_open", "pending_recharge", "pending_build",
  "in_delivery", "paused", "closed", "abnormal",
] as const

export const accountPipelineSchema = z.object({
  stages: z.array(z.object({
    poolStatus: z.enum(POOL_STATUS_ORDER),
    count: z.number().int().nonnegative(),
    deltaVsYesterday: metricValueSchema,
  }).strict()).length(POOL_STATUS_ORDER.length),
  asOf: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  // 九态顺序即产品语义（库存→投放→终止）；上游乱序说明后端出了问题，挡住而不是照渲染。
  if (value.stages.map((stage) => stage.poolStatus).join(",") !== POOL_STATUS_ORDER.join(",")) {
    context.addIssue({ code: "custom", message: "pipeline stages must keep the frozen nine-state order", path: ["stages"] })
  }
})

/* me/views（v1.5 3.10） */
const savedViewConfigSchema = z.object({
  version: z.literal("view/v1"),
  filters: z.record(z.string(), z.unknown()).optional(),
  columns: z.array(z.string().min(1)).max(200).optional(),
  sort: z.array(z.object({ by: z.string().min(1), dir: z.enum(["asc", "desc"]) }).strict()).max(20).optional(),
  window: z.record(z.string(), z.unknown()).optional(),
}).strict()

export const savedViewSchema = z.object({
  id: z.string().uuid(),
  page: z.enum(["data.table", "data.pivot", "accounts", "tasks", "work_items", "data.live"]),
  name: z.string().min(1).max(120),
  config: savedViewConfigSchema,
  isShared: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
}).strict()

export const savedViewListSchema = z.object({ items: z.array(savedViewSchema) }).strict()

/* me/watchlist（v1.5 3.5 + v1.7.4 G2） */
export const watchlistSchema = z.object({
  items: z.array(z.union([
    z.object({ type: z.literal("account"), media: z.string().min(1), accountId: z.string().min(1) }).strict(),
    z.object({ type: z.literal("task"), taskId: z.string().min(1) }).strict(),
  ])),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

/* tasks/:id/bindings（v1.7.3 + v1.9 ⑨） */
export const taskBindingsSchema = z.object({
  taskId: z.string().min(1),
  rules: z.array(z.object({
    ruleId: z.number().int().positive(),
    name: z.string().min(1),
    type: z.string().min(1).nullable(),
    enabled: z.boolean(),
    autonomyLevel: z.number().int().min(1).max(3),
    scope: z.enum(["task", "account"]),
    boundAt: z.string().datetime({ offset: true }).nullable(),
  }).strict()),
  workflows: z.array(z.object({
    workflowId: z.string().uuid(),
    name: z.string().min(1),
    version: z.number().int().positive(),
    status: z.string().min(1),
    scope: z.literal("task"),
    lastRun: z.object({
      runId: z.string().uuid(),
      status: z.string().min(1).nullable(),
      at: z.string().datetime({ offset: true }),
    }).strict().nullable(),
  }).strict()),
  sop: z.object({
    sopRunId: z.string().uuid(),
    template: z.string().min(1),
    progress: ratioValueSchema,
  }).strict().nullable(),
}).strict()

/* tasks/:id/readiness/:dimension（v1.5.1 ②） */
export const readinessOverrideSchema = z.object({
  dimension: z.enum(["accounts", "recharge", "products", "materials", "strategy", "infra"]),
  ready: z.boolean(),
  note: z.string().nullable(),
  markedBy: z.string().uuid().nullable(),
  markedAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

/* capabilities（v1.5 5.7） */
export const capabilityListSchema = z.object({
  items: z.array(z.object({
    key: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(["query", "write", "infra", "account", "material"]),
    form_schema: z.record(z.string(), z.unknown()),
    permission: z.string().min(1),
    version: z.string().min(1),
    status: z.enum(["documented_unverified", "verified", "disabled"]),
    executor: z.enum(["product_direct", "runtime", "multica_run"]),
    media: z.array(z.string().min(1)),
  }).strict()),
}).strict()

/* settings/decision-policy（v1.5 10.11） */
export const decisionPolicySchema = z.object({
  policy: z.object({
    confidenceMin: z.number().min(0).max(1),
    historicalSuccessRateMin: z.number().min(0).max(1),
    recentManualOpsWindowHours: z.number().int().positive().max(720),
    dailyCapCny: z.number().nonnegative(),
  }).strict(),
  updatedBy: z.object({ userId: z.string().uuid(), name: z.string() }).strict().nullable(),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
}).strict()

/* export / exports/:id（v1.5 7.4） */
export const exportQueuedSchema = z.object({
  exportId: z.string().uuid(),
  status: z.literal("queued"),
  kind: z.enum(["query", "view", "report"]),
  format: z.enum(["xlsx", "png", "pdf"]),
}).strict()

export const exportRecordSchema = z.object({
  exportId: z.string().uuid(),
  status: z.enum(["queued", "running", "done", "failed"]),
  kind: z.enum(["query", "view", "report"]),
  format: z.enum(["xlsx", "png", "pdf"]),
  fileRef: z.string().min(1).nullable(),
  bytes: z.number().int().nonnegative().nullable(),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
  error: z.string().min(1).nullable(),
  fileExpired: z.boolean(),
}).strict()
