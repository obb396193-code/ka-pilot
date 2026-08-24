import { z } from "zod"

const finiteRatioSchema = z.object({ value: z.number().finite(), state: z.literal("finite") }).strict()
const unavailableRatioSchema = z.object({ value: z.null(), state: z.enum(["undefined", "infinite"]) }).strict()
export const platformRatioSchema = z.union([finiteRatioSchema, unavailableRatioSchema])

const platformRatiosSchema = z.object({
  ctr: platformRatioSchema,
  cvr: platformRatioSchema,
  realCpa: platformRatioSchema,
  cashCpa: platformRatioSchema,
  gap: platformRatioSchema,
  potentialRate: platformRatioSchema,
  biConversionRate: platformRatioSchema,
}).strict()

export const platformMetricSummarySchema = z.object({
  rowCount: z.number().int().nonnegative(),
  accountCount: z.number().int().nonnegative(),
  cost: z.number().finite(),
  exposure: z.number().finite(),
  click: z.number().finite(),
  conversion: z.number().finite(),
  realConversion: z.number().finite(),
  cashCost: z.number().finite(),
  costSpace: z.number().finite(),
  wakeUv: z.number().finite(),
  potentialUv: z.number().finite(),
  anomalyRows: z.number().int().nonnegative(),
  ratios: platformRatiosSchema,
}).strict()
export type PlatformMetricSummary = z.infer<typeof platformMetricSummarySchema>

export const platformTrendRowSchema = z.object({
  ds: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  metrics: platformMetricSummarySchema,
}).strict()
export const platformTrendRowsSchema = z.array(platformTrendRowSchema)

const nullableFinite = z.number().finite().nullable()
export const platformTableRowSchema = z.object({
  workspaceId: z.string().uuid(),
  accountId: z.string().min(1),
  accountName: z.string().nullable(),
  media: z.string().min(1),
  ownerUserId: z.string().nullable(),
  ds: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cost: nullableFinite,
  exposure: nullableFinite,
  click: nullableFinite,
  conversion: nullableFinite,
  realConversion: nullableFinite,
  realCpa: nullableFinite,
  cashCost: nullableFinite,
  cashCpa: nullableFinite,
  costSpace: nullableFinite,
  gap: nullableFinite,
  budget: nullableFinite,
  budgetUsageRate: nullableFinite,
  deductionRate: nullableFinite,
  mainAdCostProportion: nullableFinite,
  assessmentPriceSnapshot: nullableFinite,
  wakeUv: nullableFinite,
  potentialUv: nullableFinite,
  dataAnomaly: z.boolean(),
  computedAt: z.string().datetime({ offset: true }),
  tasks: z.array(z.object({ taskId: z.string().min(1), taskName: z.string().nullable(), bizName: z.string().nullable() }).strict()),
}).strict()
export type PlatformTableRow = z.infer<typeof platformTableRowSchema>
export const platformTableRowsSchema = z.array(platformTableRowSchema)

export function platformRowsSchema(queryId: string) {
  if (queryId === "account.summary") return z.array(platformMetricSummarySchema).length(1)
  if (queryId === "account.trend") return platformTrendRowsSchema
  return platformTableRowsSchema
}
