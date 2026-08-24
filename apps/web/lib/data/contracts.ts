import { z } from "zod"

import {
  dataResponseSchema,
  dataViewModeSchema,
  metricValueSchema,
  type DataResponse,
  type DataState,
  type DataViewMode,
} from "./data-view.ts"

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
  attribution: z.string(),
  suggestedAction: z.string(),
  cta: z.string(),
})

export const workbenchSchema = z.object({
  greeting: z.string(),
  scopeLabel: z.string(),
  metrics: z.array(displayMetricSchema),
  anomalies: z.array(anomalySummarySchema),
  accountCoverage: z.string(),
  healthyAccountMessage: z.string(),
  trend: z.array(
    z.object({
      label: z.string(),
      spend: z.number(),
      realCpa: z.number().nullable(),
    }),
  ),
  yesterdayActions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      result: z.enum(["positive", "negative"]),
      evidence: z.string(),
    }),
  ),
  todos: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      kind: z.enum(["assigned", "self_created"]),
    }),
  ),
  morningBrief: z.object({
    title: z.string(),
    summary: z.string(),
    details: z.array(z.string()),
  }),
  alerts: z.array(
    z.object({
      level: z.enum(["P0", "P1"]),
      label: z.string(),
      value: z.string(),
      detail: z.string(),
    }),
  ),
})
export type WorkbenchData = z.infer<typeof workbenchSchema>

const sourceMetricsSchema = z.object({
  spend: metricValueSchema,
  conversions: metricValueSchema,
  cpa: metricValueSchema,
}).strict()

const comparisonSchema = z.object({
  comparable: z.boolean(),
  reason: z.string().nullable(),
  delta: metricValueSchema,
  deltaRate: metricValueSchema,
}).strict().superRefine((comparison, context) => {
  if (!comparison.comparable && (comparison.delta.availability === "available" || comparison.deltaRate.availability === "available")) {
    context.addIssue({ code: "custom", message: "不可比时不得提供差异主数" })
  }
})

const metricAuthoritySchema = z.object({
  defaultSource: z.enum(["ka_data", "platform", "source_versioned"]),
  status: z.enum(["authoritative", "realtime", "versioned", "unavailable"]),
  reason: z.string().min(1),
}).strict()

export const metricAuthorityMatrixSchema = z.object({
  spend: metricAuthoritySchema,
  conversions: metricAuthoritySchema,
  cpa: metricAuthoritySchema,
  assessmentCpa: metricAuthoritySchema,
}).strict()
export type MetricAuthorityMatrix = z.infer<typeof metricAuthorityMatrixSchema>

export const analysisRowSchema = z.object({
  accountId: z.string(),
  accountName: z.string(),
  owner: z.string(),
  kaData: sourceMetricsSchema,
  platform: sourceMetricsSchema,
  assessmentCpa: metricValueSchema,
  comparison: comparisonSchema,
  authorityByMetric: metricAuthorityMatrixSchema,
  status: z.enum(["healthy", "watch", "critical", "unavailable"]),
}).strict().superRefine((row, context) => {
  const sourceValues = [
    row.kaData.spend, row.kaData.conversions, row.kaData.cpa,
    row.platform.spend, row.platform.conversions, row.platform.cpa,
  ]
  if (row.comparison.comparable && sourceValues.some((metric) => metric.availability !== "available")) {
    context.addIssue({ code: "custom", message: "双方不完整时不得标记可比" })
  }
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
