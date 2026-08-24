import { z } from "zod"

import {
  dataResponseSchema,
  dataViewModeSchema,
  type DataResponse,
  type DataState,
  type DataViewMode,
} from "./data-view"

const displayMetricSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  delta: z.string().nullable(),
  tone: z.enum(["neutral", "positive", "warning", "critical"]),
})
export type DisplayMetric = z.infer<typeof displayMetricSchema>

const anomalySummarySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  title: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  evidence: z.string(),
  cta: z.string(),
})

export const workbenchSchema = z.object({
  greeting: z.string(),
  scopeLabel: z.string(),
  metrics: z.array(displayMetricSchema),
  anomalies: z.array(anomalySummarySchema),
  accountCoverage: z.string(),
})
export type WorkbenchData = z.infer<typeof workbenchSchema>

const analysisCellSchema = z.object({
  value: z.string().nullable(),
  availability: z.enum(["available", "unavailable", "not-applicable"]),
})

export const analysisRowSchema = z.object({
  accountId: z.string(),
  accountName: z.string(),
  owner: z.string(),
  spend: analysisCellSchema,
  conversions: analysisCellSchema,
  cpa: analysisCellSchema,
  assessmentCpa: analysisCellSchema,
  difference: analysisCellSchema,
  differenceRate: analysisCellSchema,
  status: z.enum(["healthy", "watch", "critical", "unavailable"]),
})

export const analysisSchema = z.object({
  mode: dataViewModeSchema,
  rows: z.array(analysisRowSchema),
  summary: z.string(),
})
export type AnalysisData = z.infer<typeof analysisSchema>
export type AnalysisRow = z.infer<typeof analysisRowSchema>

const trendPointSchema = z.object({
  label: z.string(),
  cpa: z.number().nullable(),
  assessmentCpa: z.number().nullable(),
})

export const accountDetailSchema = z.object({
  accountId: z.string(),
  accountName: z.string(),
  owner: z.string(),
  status: z.enum(["healthy", "watch", "critical"]),
  metrics: z.array(displayMetricSchema),
  trend: z.array(trendPointSchema),
  currentFindingId: z.string().nullable(),
  currentFindingTitle: z.string().nullable(),
})
export type AccountDetailData = z.infer<typeof accountDetailSchema>

const evidenceItemSchema = z.object({
  label: z.string(),
  value: z.string(),
  source: z.string(),
})

export const findingDetailSchema = z.object({
  findingId: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  title: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  deterministicConclusion: z.string(),
  evidence: z.array(evidenceItemSchema),
  aiInterpretation: z.string().nullable(),
  aiConfidence: z.string().nullable(),
  changeSetId: z.string().nullable(),
})
export type FindingDetailData = z.infer<typeof findingDetailSchema>

const changeItemSchema = z.object({
  field: z.string(),
  from: z.string(),
  to: z.string(),
  reason: z.string(),
})

export const changeSetPreviewSchema = z.object({
  changeSetId: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  status: z.literal("preview_only"),
  expiresAt: z.string().datetime({ offset: true }),
  items: z.array(changeItemSchema),
  riskChecks: z.array(
    z.object({
      label: z.string(),
      passed: z.boolean(),
      detail: z.string(),
    }),
  ),
  executionEndpointConfigured: z.boolean(),
})
export type ChangeSetPreviewData = z.infer<typeof changeSetPreviewSchema>

export const queryRegistry = {
  workbench: workbenchSchema,
  analysis: analysisSchema,
  accountDetail: accountDetailSchema,
  findingDetail: findingDetailSchema,
  changeSetPreview: changeSetPreviewSchema,
} as const

export type QueryId = keyof typeof queryRegistry
export type QueryData<T extends QueryId> = z.infer<(typeof queryRegistry)[T]>

export type QueryRequest<T extends QueryId = QueryId> = {
  queryId: T
  dataView: DataViewMode
  state?: DataState
  params?: Record<string, string>
}

export function parseQueryResponse<T extends QueryId>(
  queryId: T,
  input: unknown,
): DataResponse<QueryData<T>> {
  const envelope = dataResponseSchema.parse(input)
  return {
    ...envelope,
    data: queryRegistry[queryId].parse(envelope.data) as QueryData<T>,
  }
}
