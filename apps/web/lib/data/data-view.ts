import { z } from "zod"
import type { StableDataQueryError } from "./contracts.ts"

export const dataViewModeSchema = z.enum(["ka_data", "platform", "reconcile"])
export type DataViewMode = z.infer<typeof dataViewModeSchema>
export const dataStateSchema = z.enum(["loading", "ready", "empty", "error", "unavailable", "truncated", "partial", "stale", "unauthorized", "forbidden", "timeout", "too-large"])
export type DataState = z.infer<typeof dataStateSchema>

const availableDisplayValueSchema = z.object({ value: z.number().finite(), displayValue: z.string().min(1), availability: z.literal("available") }).strict()
const unavailableDisplayValueSchema = z.object({ value: z.null(), displayValue: z.string().min(1), availability: z.enum(["missing", "denominator_zero", "partial", "stale", "error"]) }).strict()
export const displayMetricValueSchema = z.union([availableDisplayValueSchema, unavailableDisplayValueSchema])
export type MetricValue = z.infer<typeof displayMetricValueSchema>

export type SourceLineage = {
  source: "ka_data" | "platform"
  sourceLabel: string
  dataAsOf: string
  datasetVersion: string
  queryTemplateVersion: string
  metricVersion: string
  timezone: string
  dayCut: string
  coverage: string
  truncated: boolean
  partial: boolean
  stale: boolean
  warnings: string[]
}
export type LineageBundle = { mode: "single"; source: SourceLineage } | { mode: "reconcile"; kaData: SourceLineage; platform: SourceLineage; comparability: { comparable: boolean; reason: string | null } }
export type DataResponse<T> = { state: DataState; lineage: LineageBundle; data: T; message?: string; error?: StableDataQueryError; isMock: boolean }

export type QueryValue = string | string[] | undefined
export type QueryRecord = Record<string, QueryValue>
const compatibleFilterKeys = ["account_id", "start", "end", "date", "date_from", "date_to", "media", "task_id", "product_id", "owner", "state"] as const
function firstValue(value: QueryValue) { return Array.isArray(value) ? value[0] : value }
export function readDataViewMode(value: QueryValue): DataViewMode { const parsed = dataViewModeSchema.safeParse(firstValue(value)); return parsed.success ? parsed.data : "platform" }
export function readDataState(value: QueryValue): DataState { const parsed = dataStateSchema.safeParse(firstValue(value)); return parsed.success ? parsed.data : "ready" }
export function buildDataViewHref(pathname: string, dataView: DataViewMode, query: QueryRecord) {
  const params = new URLSearchParams({ data_view: dataView })
  for (const key of compatibleFilterKeys) { const value = firstValue(query[key]); if (value) params.set(key, value) }
  return `${pathname}?${params.toString()}`
}
export const dataViewLabels: Record<DataViewMode, string> = { ka_data: "KA Data 权威版", platform: "自建平台版", reconcile: "双源对账" }
export const dataStateLabels: Record<DataState, string> = { loading: "加载中", ready: "数据正常", empty: "暂无数据", error: "加载失败", unavailable: "来源不可用", truncated: "结果已截断", partial: "部分数据", stale: "数据已过期", unauthorized: "未登录", forbidden: "无访问权限", timeout: "查询超时", "too-large": "响应超过 16MB" }
