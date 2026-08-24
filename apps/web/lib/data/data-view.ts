import { z } from "zod"

export const dataViewModeSchema = z.enum(["ka_data", "platform", "reconcile"])
export type DataViewMode = z.infer<typeof dataViewModeSchema>

export const dataStateSchema = z.enum([
  "loading",
  "empty",
  "error",
  "no-access",
  "partial",
  "stale",
  "success",
])
export type DataState = z.infer<typeof dataStateSchema>

export const availabilitySchema = z.enum([
  "available",
  "missing",
  "denominator_zero",
  "partial",
  "stale",
  "error",
])
export type Availability = z.infer<typeof availabilitySchema>

const availableMetricValueSchema = z.object({
  value: z.number().finite(),
  displayValue: z.string().min(1),
  availability: z.literal("available"),
}).strict()

const unavailableMetricValueSchema = z.object({
  value: z.null(),
  displayValue: z.string().min(1),
  availability: availabilitySchema.exclude(["available"]),
}).strict()

export const metricValueSchema = z.union([
  availableMetricValueSchema,
  unavailableMetricValueSchema,
])
export type MetricValue = z.infer<typeof metricValueSchema>

export const sourceLineageSchema = z.object({
  source: z.enum(["ka_data", "platform"]),
  sourceLabel: z.string().min(1),
  dataAsOf: z.string().datetime({ offset: true }),
  datasetVersion: z.string().min(1),
  queryTemplateVersion: z.string().min(1),
  timezone: z.string().min(1),
  dayCut: z.string().min(1),
  coverage: z.string().min(1),
  truncated: z.boolean(),
  partial: z.boolean(),
  stale: z.boolean(),
  warnings: z.array(z.string()),
}).strict()
export type SourceLineage = z.infer<typeof sourceLineageSchema>

export const lineageBundleSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("single"), source: sourceLineageSchema }).strict(),
  z.object({
    mode: z.literal("reconcile"),
    kaData: sourceLineageSchema,
    platform: sourceLineageSchema,
    comparability: z.object({ comparable: z.boolean(), reason: z.string().nullable() }).strict(),
  }).strict(),
])
export type LineageBundle = z.infer<typeof lineageBundleSchema>

export const dataResponseSchema = z.object({
  state: dataStateSchema,
  lineage: lineageBundleSchema,
  data: z.unknown(),
  message: z.string().optional(),
}).strict()

export type DataResponse<T> = {
  state: DataState
  lineage: LineageBundle
  data: T
  message?: string
}

export type QueryValue = string | string[] | undefined
export type QueryRecord = Record<string, QueryValue>

const compatibleFilterKeys = [
  "account_id",
  "start",
  "end",
  "date",
  "date_from",
  "date_to",
  "media",
  "task_id",
  "product_id",
  "owner",
  "state",
] as const

function firstValue(value: QueryValue) {
  return Array.isArray(value) ? value[0] : value
}

export function readDataViewMode(value: QueryValue): DataViewMode {
  const parsed = dataViewModeSchema.safeParse(firstValue(value))
  return parsed.success ? parsed.data : "platform"
}

export function readDataState(value: QueryValue): DataState {
  const parsed = dataStateSchema.safeParse(firstValue(value))
  return parsed.success ? parsed.data : "success"
}

export function buildDataViewHref(
  pathname: string,
  dataView: DataViewMode,
  query: QueryRecord,
) {
  const params = new URLSearchParams({ data_view: dataView })

  for (const key of compatibleFilterKeys) {
    const value = firstValue(query[key])
    if (value) params.set(key, value)
  }

  return `${pathname}?${params.toString()}`
}

export const dataViewLabels: Record<DataViewMode, string> = {
  ka_data: "KA Data 权威版",
  platform: "自建平台版",
  reconcile: "双源对账",
}

export const dataStateLabels: Record<DataState, string> = {
  loading: "加载中",
  empty: "暂无数据",
  error: "加载失败",
  "no-access": "无访问权限",
  partial: "部分数据",
  stale: "数据已过期",
  success: "数据正常",
}
