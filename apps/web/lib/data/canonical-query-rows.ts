import { z } from "zod"

const finiteNumber = z.number().finite()
const nullableFiniteNumber = finiteNumber.nullable()
const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}, "date must be a real calendar date")

export const dataQueryIdSchema = z.enum([
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
}).strict().superRefine((row, ctx) => {
  if (row.assessment.onTarget !== null && (row.metrics.cashCost.availability !== "available" || row.metrics.realConversion.availability !== "available")) ctx.addIssue({ code: "custom", message: "Unavailable metrics cannot determine assessment" })
  if (row.assessment.costStatusReason === "cash_missing" && row.metrics.cashCost.availability === "available") ctx.addIssue({ code: "custom", message: "cash_missing requires missing cash" })
  if (row.assessment.costStatusReason === "conversion_missing" && (row.metrics.cashCost.availability !== "available" || row.metrics.realConversion.availability === "available")) ctx.addIssue({ code: "custom", message: "conversion_missing requires known cash and missing conversion" })
})

export const accountTrendRowSchema = z.object({
  ds: calendarDateSchema,
  metrics: canonicalMetricSetSchema,
}).strict()

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
  "account.summary": accountSummaryRowSchema,
  "account.trend": accountTrendRowSchema,
  "account.table": accountDailyRowSchema,
  "account.anomalies": accountAnomalyRowSchema,
  "account.detail": accountDailyRowSchema,
  "reconcile.account_daily": accountDailyRowSchema,
} as const

export const canonicalRowSchemaVersionByQueryId = {
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
