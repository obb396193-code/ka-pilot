import { z } from "zod"

const finiteNumber = z.number().finite()
const nullableFiniteNumber = finiteNumber.nullable()
const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}, "date must be a real calendar date")

export const dataQueryIdSchema = z.enum([
  "account.gap",
  "account.hourly",
  "account.pivot2",
  "account.dimension",
  "account.summary",
  "account.trend",
  "account.table",
  "account.anomalies",
  "account.detail",
  "reconcile.account_daily",
])
export type DataQueryId = z.infer<typeof dataQueryIdSchema>

export const ratioValueSchema = z.object({
  value: nullableFiniteNumber,
  state: z.enum(["finite", "infinite", "undefined"]),
}).strict().superRefine((ratio, context) => {
  if (ratio.state === "finite" && ratio.value === null) {
    context.addIssue({ code: "custom", path: ["value"], message: "finite ratios require a finite value" })
  }
  if (ratio.state !== "finite" && ratio.value !== null) {
    context.addIssue({ code: "custom", path: ["value"], message: `${ratio.state} ratios cannot carry a numeric value` })
  }
})

export const canonicalRatioSetSchema = z.object({
  ctr: ratioValueSchema,
  cvr: ratioValueSchema,
  realCpa: ratioValueSchema,
  cashCpa: ratioValueSchema,
  gap: ratioValueSchema,
  potentialRate: ratioValueSchema,
  biConversionRate: ratioValueSchema,
}).strict()

// Frozen canonical v2 values: missing is not zero; errors carry no numeric value.
export const canonicalMetricValueSchema = z.discriminatedUnion("availability", [
  z.object({ value: finiteNumber, availability: z.literal("available") }).strict(),
  z.object({ value: z.null(), availability: z.literal("missing") }).strict(),
  z.object({ value: z.null(), availability: z.literal("error") }).strict(),
  // v1.9.27：pending =「这个数还没到」（调度未跑完 / 源未回），界面显「待到」。
  // 和 missing「这次查下来就是没有」不是一回事——两者混成一个「−」，
  // 人分不清是等一会儿还是永远不会有。
  z.object({ value: z.null(), availability: z.literal("pending") }).strict(),
])

const hourlyVolumeSchema = z.object({ cost: canonicalMetricValueSchema, cashCost: canonicalMetricValueSchema,
  conversion: canonicalMetricValueSchema, realConversion: canonicalMetricValueSchema }).strict()
const hourlyKeys = ["cost", "cashCost", "conversion", "realConversion"] as const
export const accountHourlyRowSchema = z.object({
  media: z.string().regex(/^[A-Z0-9_]{1,32}$/), accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), hh: z.number().int().min(0).max(24),
  cumulative: hourlyVolumeSchema, delta: hourlyVolumeSchema,
  ratios: z.object({ cashCpa: ratioValueSchema, realCpa: ratioValueSchema }).strict(),
  velocity: z.object({ costPerHour: canonicalMetricValueSchema }).strict(), projectedDayCost: canonicalMetricValueSchema,
  budgetUsage: ratioValueSchema, lastSyncAt: z.string().datetime({ offset: true }).nullable(),
}).strict().superRefine((row, context) => {
  for (const field of hourlyKeys) if (row.cumulative[field].availability !== "available" && row.delta[field].availability === "available")
    context.addIssue({ code: "custom", message: "A delta requires its current cumulative value" })
  for (const [ratio, numerator] of [["cashCpa", "cashCost"], ["realCpa", "cost"]] as const) {
    if ((row.cumulative[numerator].availability !== "available" || row.cumulative.realConversion.availability !== "available") && row.ratios[ratio].state !== "undefined")
      context.addIssue({ code: "custom", message: "Missing CPA inputs require an undefined ratio" })
    if (row.cumulative.realConversion.value === 0 && row.ratios[ratio].state === "finite")
      context.addIssue({ code: "custom", message: "Zero denominator cannot produce a finite CPA" })
  }
})
export const accountHourlyRowsSchema = z.array(accountHourlyRowSchema).max(10000).superRefine((rows, context) => {
  const key = (row: { media: string; accountId: string; hh: number }, hh = row.hh) => JSON.stringify([row.media, row.accountId, hh])
  const indexed = new Map<string, z.infer<typeof accountHourlyRowSchema>>()
  for (const row of rows) {
    if (indexed.has(key(row))) context.addIssue({ code: "custom", message: "Duplicate media/account/hour" })
    indexed.set(key(row), row)
  }
  for (const row of rows) {
    if (row.hh === 0 || row.hh === 24) continue
    const previous = indexed.get(key(row, row.hh - 1))
    if (!previous) continue
    for (const field of hourlyKeys) if (previous.cumulative[field].availability !== "available" && row.delta[field].availability === "available")
      context.addIssue({ code: "custom", message: "A missing predecessor cannot produce an available delta" })
  }
})

export const canonicalMetricSetSchema = z.object({
  cost: canonicalMetricValueSchema,
  exposure: canonicalMetricValueSchema,
  click: canonicalMetricValueSchema,
  conversion: canonicalMetricValueSchema,
  realConversion: canonicalMetricValueSchema,
  cashCost: canonicalMetricValueSchema,
  costSpace: canonicalMetricValueSchema,
  // v1.9.27：账面里由平台激励承担的部分。**不是 costSpace**——
  // costSpace 是「成本空间」（离考核线还剩多少），两者含义无关，之前 KPI 卡绑错了。
  incentiveCost: canonicalMetricValueSchema.optional(),
  wakeUv: canonicalMetricValueSchema,
  potentialUv: canonicalMetricValueSchema,
  ratios: canonicalRatioSetSchema,
}).strict()

function refineAssessmentMetrics(row: { metrics: { cashCost: { availability: string }; realConversion: { availability: string } };
  assessment: { onTarget: boolean | null; costStatusReason: string } }, ctx: z.RefinementCtx) {
  if (row.assessment.onTarget !== null && (row.metrics.cashCost.availability !== "available" || row.metrics.realConversion.availability !== "available")) ctx.addIssue({ code: "custom", message: "Unavailable metrics cannot determine assessment" })
  if (row.assessment.costStatusReason === "cash_missing" && row.metrics.cashCost.availability === "available") ctx.addIssue({ code: "custom", message: "cash_missing requires missing cash" })
  if (row.assessment.costStatusReason === "conversion_missing" && (row.metrics.cashCost.availability !== "available" || row.metrics.realConversion.availability === "available")) ctx.addIssue({ code: "custom", message: "conversion_missing requires known cash and missing conversion" })
}

export const accountSummaryRowSchema = z.object({
  rowCount: z.number().int().nonnegative(),
  accountCount: z.number().int().nonnegative(),
  anomalyRows: z.number().int().nonnegative().nullable(),
  metrics: canonicalMetricSetSchema,
  assessment: z.object({
    priceSource: z.enum(["history", "ka_daily"]),
    price: z.object({ value: finiteNumber, effectiveDate: calendarDateSchema.nullable() }).strict().nullable(),
    priceVersions: z.number().int().min(2).optional(),
    onTarget: z.boolean().nullable(), costStatus: z.enum(["green", "yellow", "red"]).nullable(),
    costStatusReason: z.enum(["window_ok", "day_over_window_ok", "window_over", "cash_missing", "conversion_missing", "assessment_missing"]),
    budgetUsageRate: ratioValueSchema,
    /* v1.9.27 考核口径三项（camelCase）。只有 summary 和新维度带，老维度行没有 → optional。 */
    biConv: canonicalMetricValueSchema.optional(),
    /** ★MetricValue 不是 RatioValue：它是「一个 BI 转化多少钱」的金额，可缺可待到 */
    biCashCost: canonicalMetricValueSchema.optional(),
    /** 现金花费 − Σ日(考核BI数 × 当日生效考核价)；正 = 超成本，负 = 还有余量 */
    overCost: canonicalMetricValueSchema.optional(),
  }).strict().superRefine((value, ctx) => {
    const expected = { window_ok: [true, "green"], day_over_window_ok: [true, "yellow"], window_over: [false, "red"],
      cash_missing: [null, null], conversion_missing: [null, null], assessment_missing: [null, null] } as const
    const [target, color] = expected[value.costStatusReason]
    if (value.onTarget !== target || value.costStatus !== color) ctx.addIssue({ code: "custom", message: "Assessment reason mismatch" })
    if (value.price !== null && ((value.priceSource === "history") !== (value.price.effectiveDate !== null))) ctx.addIssue({ code: "custom", message: "Price source/date mismatch" })
    if (value.priceVersions !== undefined && value.price !== null) ctx.addIssue({ code: "custom", message: "Mixed prices have no representative price" })
    if (value.onTarget !== null && value.price === null && value.priceVersions === undefined) ctx.addIssue({ code: "custom", message: "Missing price evidence" })
    if (value.costStatusReason === "assessment_missing" && (value.price !== null || value.priceVersions !== undefined)) ctx.addIssue({ code: "custom", message: "Missing assessment cannot have complete prices" })
  }),
  compare: z.object({ mode: z.enum(["dod", "wow", "prev_window"]), deltas: z.object({
    cost: ratioValueSchema, cashCost: ratioValueSchema, realConversion: ratioValueSchema, cashCpa: ratioValueSchema, onTargetRate: ratioValueSchema,
  }).strict() }).strict().optional(),
}).strict().superRefine(refineAssessmentMetrics)

export const accountTrendRowSchema = z.object({
  ds: calendarDateSchema,
  metrics: canonicalMetricSetSchema,
}).strict()

export const dimensionTypeSchema = z.enum(["account", "task", "biz", "agent_type", "resource_position", "bid_tool", "ubp", "deduction_range"])
const dimensionFields = { key: z.string().min(1).nullable(), label: z.string().nullable(),
  metrics: canonicalMetricSetSchema, assessment: accountSummaryRowSchema.shape.assessment, anomaly: z.boolean() }
export const dimensionWindowRowSchema = z.union([
  z.object({ ...dimensionFields, key: z.string().min(1), media: z.string().regex(/^[A-Z0-9_]{1,32}$/), accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }).strict()
    .refine((row) => row.key === `${row.media}:${row.accountId}`),
  z.object({ ...dimensionFields, agent_type: z.enum(["agency", "self"]), agency_name: z.string().min(1).optional() }).strict(),
  z.object(dimensionFields).strict(),
]).superRefine(refineAssessmentMetrics)

const pivotAxis = z.object({ key: z.string().min(1).nullable(), label: z.string().nullable() }).strict()
export const pivotWindowRowSchema = z.object({ a: pivotAxis, b: pivotAxis,
  metrics: canonicalMetricSetSchema, assessment: accountSummaryRowSchema.shape.assessment,
}).strict().superRefine(refineAssessmentMetrics)
export const pivotWindowRowsSchema = z.object({ queryId: z.literal("account.pivot2"), rowSchemaVersion: z.literal("account.pivot2/v1"),
  dimA: dimensionTypeSchema, dimB: dimensionTypeSchema, rows: z.array(pivotWindowRowSchema).max(10000),
}).strict().superRefine((value, context) => {
  const pairs = new Set<string>(), labels = new Map<string, string | null>()
  for (const row of value.rows) {
    const pair = JSON.stringify([row.a.key, row.b.key])
    if (pairs.has(pair)) context.addIssue({ code: "custom", message: "Duplicate pivot cell" })
    pairs.add(pair)
    for (const [side, dim] of [["a", value.dimA], ["b", value.dimB]] as const) {
      const axis = row[side], key = JSON.stringify([dim, axis.key])
      if (labels.has(key) && labels.get(key) !== axis.label) context.addIssue({ code: "custom", message: "Conflicting axis label" })
      labels.set(key, axis.label)
      if (dim === "account" && (axis.key === null || !/^[A-Z0-9_]{1,32}:[A-Za-z0-9_-]{1,128}$/.test(axis.key))) {
        context.addIssue({ code: "custom", message: "Account axis requires media/account identity" })
      }
    }
    if (value.dimA === value.dimB && row.a.key !== row.b.key) context.addIssue({ code: "custom", message: "Same dimensions must agree" })
  }
})

export const relatedTaskRowSchema = z.object({
  taskId: z.string().min(1),
  taskName: z.string().nullable(),
  bizName: z.string().nullable(),
}).strict()

export const accountDailyMetricSetSchema = canonicalMetricSetSchema.extend({
  budget: canonicalMetricValueSchema,
  budgetUsageRate: canonicalMetricValueSchema,
  deductionRate: canonicalMetricValueSchema,
  mainAdCostProportion: canonicalMetricValueSchema,
  assessmentPrice: canonicalMetricValueSchema,
}).strict()

export const accountDailyRowSchema = z.object({
  workspaceId: z.string().uuid(),
  media: z.string().min(1),
  accountId: z.string().min(1),
  accountName: z.string().nullable(),
  ownerUserId: z.string().nullable(),
  ds: calendarDateSchema,
  metrics: accountDailyMetricSetSchema,
  dataAnomaly: z.boolean().nullable(),
  computedAt: z.string().datetime({ offset: true }).nullable(),
  tasks: z.array(relatedTaskRowSchema),
}).strict()

export const accountAnomalyRowSchema = accountDailyRowSchema.extend({
  dataAnomaly: z.literal(true),
}).strict()

export const accountGapRowSchema = z.object({
  group: z.object({ key: z.string().min(1).nullable(), label: z.string().nullable() }).strict(),
  conversion: canonicalMetricValueSchema, realConversion: canonicalMetricValueSchema,
  gap: ratioValueSchema, preDeductionGap: ratioValueSchema, deductionRate: ratioValueSchema,
  gapStatus: z.enum(["normal", "high", "missing"]),
}).strict().superRefine((row, ctx) => {
  if ((row.conversion.availability !== "available" || row.realConversion.availability !== "available") &&
    (row.gap.state !== "undefined" || row.gapStatus !== "missing")) ctx.addIssue({ code: "custom", message: "Missing Gap inputs" })
  if (row.gap.state === "undefined" && row.gapStatus !== "missing") ctx.addIssue({ code: "custom", message: "Undefined Gap cannot be classified" })
  if (row.realConversion.value === 0 && row.gap.state === "finite") ctx.addIssue({ code: "custom", message: "Zero denominator" })
})
export const accountGapRowsSchema = z.array(accountGapRowSchema).max(10000).refine(rows =>
  new Set(rows.map(row => row.group.key)).size === rows.length, "Duplicate Gap groups")

export const canonicalQueryRowSchemaById = {
  "account.gap": accountGapRowSchema,
  "account.hourly": accountHourlyRowSchema,
  "account.pivot2": pivotWindowRowSchema,
  "account.dimension": dimensionWindowRowSchema,
  "account.summary": accountSummaryRowSchema,
  "account.trend": accountTrendRowSchema,
  "account.table": accountDailyRowSchema,
  "account.anomalies": accountAnomalyRowSchema,
  "account.detail": accountDailyRowSchema,
  "reconcile.account_daily": accountDailyRowSchema,
} as const

export const canonicalRowSchemaVersionByQueryId = {
  "account.gap": "account.gap/v1",
  "account.hourly": "account.hourly/v1",
  "account.pivot2": "account.pivot2/v1",
  "account.dimension": "account.dimension/v3",
  "account.summary": "account.summary/v3",
  "account.trend": "account.trend/v3",
  "account.table": "account.table/v2",
  "account.anomalies": "account.anomalies/v2",
  "account.detail": "account.detail/v2",
  "reconcile.account_daily": "reconcile.account_daily/v2",
} as const

export type AccountSummaryRow = z.infer<typeof accountSummaryRowSchema>
export type AccountTrendRow = z.infer<typeof accountTrendRowSchema>
export type AccountDailyRow = z.infer<typeof accountDailyRowSchema>

export function canonicalQueryRowsSchema(queryId: DataQueryId) {
  return z.array(canonicalQueryRowSchemaById[queryId])
}
