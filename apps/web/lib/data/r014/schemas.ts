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

/* 任务详情总览（契约 v1.5.1 ②，GET /api/v1/tasks/:id）——F8-8 接真后端 */
const readinessSegmentSchema = z.object({
  ratio: ratioValueSchema,
  ready: z.boolean(),
  source: z.string().min(1),
  missing: z.array(z.string()),
}).strict()

const versionedValueSchema = z.object({
  current: z.number().finite().nullable(),
  effectiveDate: z.string().min(1).nullable(),
  historyCount: z.number().int().nonnegative(),
}).strict()

export const taskDetailSchema = z.object({
  task: z.object({
    taskId: z.string().min(1),
    taskName: z.string().min(1),
    bizName: z.string().nullable(),
    status: z.string().min(1),
    period: z.object({ start: z.string().min(1), end: z.string().min(1) }).strict().nullable(),
    owner: z.object({ userId: z.string().min(1), displayName: z.string().min(1) }).strict().nullable(),
    budget: metricValueSchema,
  }).strict(),
  overview: z.object({
    targetVolume: metricValueSchema,
    achieved: metricValueSchema,
    achievementRate: ratioValueSchema,
    timeProgress: ratioValueSchema,
    pacing: z.object({
      asOf: z.string().min(1),
      elapsedDays: z.number().int().nonnegative(),
      totalDays: z.number().int().nonnegative(),
      remainingDays: z.number().int().nonnegative(),
      targetProgress: ratioValueSchema,
      timeProgress: ratioValueSchema,
      projectedVolume: z.number().finite().nullable(),
      projectedCompletion: ratioValueSchema,
      projectedGap: z.number().finite().nullable(),
      requiredDailyVolume: z.number().finite().nullable(),
      sevenDayAvgVolume: z.number().finite().nullable(),
      excludedZeroDays: z.number().int().nonnegative(),
      finalAchievementRate: ratioValueSchema,
    }).strict().nullable(),
    onTarget: z.boolean().nullable(),
    costStatus: z.enum(["green", "yellow", "red"]).nullable(),
    costStatusReason: z.string().nullable(),
    cost: z.object({
      window: z.object({ from: z.string().min(1), to: z.string().min(1), preset: z.string().optional() }).strict(),
      cost: metricValueSchema,
      cashCost: metricValueSchema,
      cashCpa: ratioValueSchema,
      realCpa: ratioValueSchema,
      costSpace: metricValueSchema,
      projectedWindowCashCpa: ratioValueSchema,
      affordableDailyCashCpa: ratioValueSchema,
    }).strict().nullable(),
    anomalySummary: z.object({ p0: z.number().int().nonnegative(), p1: z.number().int().nonnegative(), opportunity: z.number().int().nonnegative() }).strict(),
    assessmentPrice: versionedValueSchema.nullable(),
    dailyBudgetCap: versionedValueSchema.nullable(),
    budgetUsageRate: ratioValueSchema.nullable(),
    budgetUsageDate: z.string().nullable(),
    stage: z.object({ value: z.string().min(1), source: z.string().min(1), changedAt: z.string().nullable() }).strict(),
    readiness: z.object({
      accounts: readinessSegmentSchema,
      recharge: readinessSegmentSchema,
      products: readinessSegmentSchema,
      materials: readinessSegmentSchema,
      strategy: readinessSegmentSchema,
      infra: readinessSegmentSchema,
      overall: ratioValueSchema,
    }).strict(),
    sopProgress: z.object({
      runId: z.string().nullable(),
      steps: z.array(z.object({ key: z.string().min(1), status: z.string().min(1), at: z.string().nullable() }).strict()),
    }).strict().nullable(),
    blockers: z.array(z.object({
      kind: z.string().min(1),
      ref: z.string().min(1),
      title: z.string().min(1),
      severity: z.string().nullable(),
    }).strict()),
    nextActions: z.array(z.object({ kind: z.string().min(1), ref: z.string().min(1), title: z.string().min(1) }).strict()),
  }).strict(),
  tabs: z.array(z.string().min(1)),
}).strict()

/* 归属清洗（契约 v1.8，admin/naming-*）——F8-9 BFF 透传 */
const namingSegmentSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int().nonnegative(),
  source: z.enum(["enum", "regex", "free"]),
  values: z.array(z.string()).optional(),
  pattern: z.string().nullable().optional(),
  required: z.boolean(),
  multi: z.boolean(),
  mapsTo: z.string().nullable(),
}).strict()

export const namingRuleSchema = z.object({
  media: z.string().min(1),
  version: z.number().int().positive(),
  segments: z.array(namingSegmentSchema),
  separators: z.array(z.string().min(1)),
  effectiveFrom: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().nullable(),
}).strict()

const parsedSegmentSchema = z.object({
  key: z.string().min(1),
  value: z.string().nullable(),
  mapsTo: z.string().nullable(),
  taskIds: z.array(z.string()),
}).strict()

const parseStatusSchema = z.enum(["parsed", "partial", "failed", "conflict", "confirmed", "overridden"])

const accountNameParseSchema = z.object({
  media: z.string().min(1),
  accountId: z.string().min(1),
  accountName: z.string().min(1),
  ruleVersion: z.number().int().positive(),
  status: parseStatusSchema,
  segments: z.record(z.string(), parsedSegmentSchema),
  taskIds: z.array(z.string()),
  conflicts: z.array(z.object({
    field: z.string().min(1),
    fromNickname: z.string(),
    fromPlatform: z.string(),
  }).strict()).nullable(),
  override: z.record(z.string(), z.string()).nullable(),
  parsedAt: z.string().min(1),
  confirmedAt: z.string().nullable(),
}).strict()

export const accountNamesSchema = z.object({
  items: z.array(accountNameParseSchema),
  total: z.number().int().nonnegative(),
}).strict()

export const accountNamePatchSchema = accountNameParseSchema

export const namingRulesTestSchema = z.object({
  ruleVersion: z.number().int().positive(),
  results: z.array(z.object({
    accountName: z.string().min(1),
    status: parseStatusSchema,
    segments: z.record(z.string(), parsedSegmentSchema),
  }).strict()),
  hitRate: z.number().min(0).max(1),
  counts: z.record(z.string(), z.number().int().nonnegative()),
}).strict()

// ── Q-030：kb 七条 / 账户交接 / 自助改密 / 日报 的前端侧镜像 ─────────────────
// 逐条对应 packages/domain/src/r014/{kb,account-transfer,daily-report}-contract.ts。
// 形状以 packages/contract/fixtures 为准；后端改了这里不改，BFF 会以
// UPSTREAM_INVALID_RESPONSE 挡住——那正是这层校验存在的意义。

const kbKindSchema = z.enum(["manual", "ai_report", "case", "sop"])
const kbObjectTypeSchema = z.enum(["account", "task", "changeset", "work_item", "material"])

export const kbDocumentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  kind: kbKindSchema,
  parentId: z.string().uuid().nullable(),
  contentJson: z.unknown().nullable(),
  contentText: z.string(),
  documentLinks: z.array(z.object({ toId: z.string().uuid(), label: z.string() }).strict()),
  businessRefs: z.array(z.object({ type: kbObjectTypeSchema, id: z.string() }).strict()),
  revision: z.number().int().nonnegative(),
  updatedBy: z.object({ userId: z.string().uuid(), name: z.string() }).strict().nullable(),
  updatedAt: z.string(),
  readOnly: z.boolean(),
}).strict()

type KbTreeNode = {
  id: string; title: string; kind: z.infer<typeof kbKindSchema>
  parentId: string | null; position: string | null; children: KbTreeNode[]
}
const kbTreeNodeSchema: z.ZodType<KbTreeNode> = z.lazy(() => z.object({
  id: z.string().uuid(),
  title: z.string(),
  kind: kbKindSchema,
  parentId: z.string().uuid().nullable(),
  position: z.string().nullable(),
  children: z.array(kbTreeNodeSchema),
}).strict())

export const kbTreeSchema = z.object({
  items: z.array(kbTreeNodeSchema),
  // F-Q027-1：与 etl-runs 同形；整棵树时 pageSize = 当页行数，`truncated` 在 meta。
  page: z.number().int().min(1),
  pageSize: z.number().int().min(0),
  total: z.number().int().nonnegative(),
}).strict()

export const kbSearchSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(), title: z.string(), kind: kbKindSchema,
    snippet: z.string(), score: z.number(),
  }).strict()),
}).strict()

const kbRefItemSchema = z.object({
  id: z.string().uuid(), title: z.string(), kind: kbKindSchema,
}).strict()

export const kbBacklinksSchema = z.object({ items: z.array(kbRefItemSchema) }).strict()

export const kbByObjectSchema = z.object({
  objectType: kbObjectTypeSchema,
  objectId: z.string(),
  items: z.array(kbRefItemSchema),
}).strict()

/** 软删只回置位时间——行还在，前端据此显示「已删除于…」而不是让文档凭空消失。 */
export const kbDeletedSchema = z.object({ deletedAt: z.string() }).strict()

export const accountTransferSchema = z.object({
  transferId: z.string().uuid(),
  moved: z.object({
    accounts: z.number().int().nonnegative(),
    workItems: z.number().int().nonnegative(),
    dispatches: z.number().int().nonnegative(),
  }).strict(),
  notifiedUserIds: z.array(z.string().uuid()),
  /** 没交接成的逐条列出，前端要显示哪几户没动、为什么——不静默吞掉。 */
  skipped: z.array(z.object({
    media: z.string(),
    accountId: z.string(),
    reason: z.enum(["blocked_by_changeset", "not_authorized", "not_found"]),
    detail: z.string().min(1),
  }).strict()),
}).strict()

export const passwordChangedSchema = z.object({
  changedAt: z.string(),
  /** 改密后被下线的其他设备数；当前这台保留。 */
  otherSessionsRevoked: z.number().int().nonnegative(),
}).strict()

/** 日报模块形状各异（六卡 / 趋势 / 健康度 / 维度行），这里只锁到「有 key 和 title」。 */
export const dailyReportSchema = z.object({
  schema: z.literal("daily-report/v1"),
  date: z.string(),
  role: z.enum(["optimizer", "lead", "exec"]),
  dataAsOf: z.string().nullable(),
  modules: z.array(z.object({ key: z.string().min(1), title: z.string().min(1) }).passthrough()),
  actions: z.object({ pushDingtalk: z.boolean(), exportPdf: z.boolean() }).strict(),
  delivery: z.object({
    status: z.enum(["not_sent", "queued", "sent", "failed"]),
    at: z.string().nullable(),
    target: z.string().nullable(),
  }).strict(),
}).strict()

/* 新增成员 / 重置密码（契约 v1.9.5）——F8-11 BFF 透传 */
const memberRowSchema = z.object({
  identityId: z.string().uuid(),
  displayName: z.string().min(1),
  provider: z.enum(["internal_test", "buc", "sso"]),
  // v1.9.21：workspace-local UUID，不是登录名——登录名在创建响应的 loginName 里
  userId: z.string().min(1),
  role: z.enum(["admin", "lead", "operator", "viewer", "optimizer"]),
  isActive: z.boolean(),
  joinedAt: z.string().min(1),
  grantsCount: z.number().int().nonnegative(),
  lastSeenAt: z.string().nullable(),
  mustChangePassword: z.boolean(),
})

/**
 * `POST /admin/members` 的响应比列表行多一个 `initialPassword`——**只在这一次回**。
 * 不 strict：后端以后往行里加字段（v1.9.5 的 mustChangePassword 就是这么来的）不该让整条透传变 502。
 */
export const memberCreatedSchema = memberRowSchema.extend({
  initialPassword: z.string().min(1),
  // v1.9.21：登录名从 userId 挪到这个键（userId 现在是 workspace-local UUID，不是人输入的登录名）
  loginName: z.string().min(1),
})

/** `POST /admin/members/:identityId/reset-password` → 新初始密码只回一次 + 该身份全部 session 吊销 */
export const memberPasswordResetSchema = z.object({
  identityId: z.string().uuid(),
  initialPassword: z.string().min(1),
  sessionsRevoked: z.number().int().nonnegative(),
})

// ── 补齐三条此前漏掉的透传（BFF 覆盖绊线抓出来的）─────────────────────────────

export const poolStatusRecordSchema = z.object({
  media: z.string(),
  accountId: z.string(),
  poolStatus: z.enum(POOL_STATUS_ORDER),
  poolStatusSource: z.enum(["system", "manual"]),
  /** 人工改过才有时间；系统态没有改动时间，是 null 不是 now()。 */
  poolStatusChangedAt: z.string().nullable(),
}).strict()

export const accountNamesConfirmSchema = z.object({
  confirmed: z.number().int().nonnegative(),
  /** 没确认成的逐条列出——批量确认只放行 parsed，conflict/failed 必须人工看。 */
  skipped: z.array(z.object({
    media: z.string(), accountId: z.string(), status: z.string(),
  }).strict()),
}).strict()

export const accountNamesReparseSchema = z.object({
  reparsed: z.number().int().nonnegative(),
  /** 该 media 没配命名规范 → 跳过；不拿一份默认规范硬解，硬解出来的段全是错的。 */
  skippedNoRule: z.number().int().nonnegative(),
  byStatus: z.record(z.string(), z.number().int().nonnegative()),
}).strict()

// ── 任务详情补的两签（timeline / funnel）─────────────────────────────────────

const timelineActorSchema = z.union([
  z.object({ userId: z.string().uuid(), name: z.string().nullable() }).strict(),
  z.literal("system"),
  z.literal("external"),
])

export const taskTimelineSchema = z.object({
  items: z.array(z.object({
    at: z.string(),
    kind: z.enum(["changeset", "assessment_price", "dispatch", "external_change", "work_item", "escalation"]),
    actor: timelineActorSchema,
    summary: z.string().min(1),
    ref: z.object({ type: z.string().min(1), id: z.string().min(1) }).strict(),
  }).strict()),
  nextCursor: z.string().nullable(),
}).strict()

export const taskFunnelSchema = z.object({
  online: z.object({
    exposure: metricValueSchema, click: metricValueSchema,
    conversion: metricValueSchema, realConversion: metricValueSchema,
  }).strict(),
  /** 线下链路的源（account_offline）还没有 → 三项 missing，不拿线上数顶替。 */
  offline: z.object({
    wakeUv: metricValueSchema, potentialUv: metricValueSchema, realConversion: metricValueSchema,
  }).strict(),
  rates: z.object({
    ctr: ratioValueSchema, cvr: ratioValueSchema, gap: ratioValueSchema,
    potentialRate: ratioValueSchema, biCvr: ratioValueSchema,
  }).strict(),
}).strict()

/** v1.9.19 `POST /tasks/:id/assessment-price`；键名照契约是 snake_case。 */
export const assessmentPriceChangeSchema = z.object({
  task_id: z.string().min(1),
  old_price: z.number().nullable(),
  new_price: z.number(),
  effective_date: z.string(),
  /** 生效日至今的天数——有多少天的派生指标会跟着变，一期不跑批。 */
  recomputed_days: z.number().int().nonnegative(),
  notified_user_ids: z.array(z.string().uuid()),
}).strict()

/* F8-15 ①：拉数记录分页形（契约 v1.9.12，`GET /system/etl-runs`） */
const etlWarningSchema = z.union([z.string().min(1), z.looseObject({ code: z.string().min(1) })])
export const etlRunsPageSchema = z.object({
  items: z.array(z.looseObject({
    runId: z.string().min(1),
    jobId: z.string().min(1),
    // 旧 run 没有 execution 记录 → null（同时带 LEGACY_NO_ATTEMPT 警告），别当 1
    attempt: z.number().int().positive().nullable(),
    jobType: z.string().min(1),
    status: z.enum(["done", "failed", "running", "queued"]),
    businessDate: z.string().min(1),
    startedAt: z.string().min(1),
    finishedAt: z.string().nullable(),
    // 阶段未到 → 整个 rows 为 null；只跑到 raw → canonical 为 null。两种都不是 0
    rows: z.object({ raw: z.number().int().nonnegative().nullable(), canonical: z.number().int().nonnegative().nullable() }).nullable(),
    warnings: z.array(etlWarningSchema),
  })),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
})
