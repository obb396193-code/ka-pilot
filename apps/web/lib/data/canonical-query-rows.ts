import { z } from "zod"

const finiteNumber = z.number().finite()
const nullableFiniteNumber = finiteNumber.nullable()
const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}, "date must be a real calendar date")

export const dataQueryIdSchema = z.enum([
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
])

export const canonicalMetricSetSchema = z.object({
  cost: canonicalMetricValueSchema,
  exposure: canonicalMetricValueSchema,
  click: canonicalMetricValueSchema,
  conversion: canonicalMetricValueSchema,
  realConversion: canonicalMetricValueSchema,
  cashCost: canonicalMetricValueSchema,
  costSpace: canonicalMetricValueSchema,
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
  compare: z.object({ mode: z.enum(["dod", "wow"]), deltas: z.object({
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

export const canonicalQueryRowSchemaById = {
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
