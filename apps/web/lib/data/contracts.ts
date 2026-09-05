import { z } from "zod"

import {
  canonicalQueryRowSchemaById,
  canonicalRowSchemaVersionByQueryId,
  dataQueryIdSchema,
  type DataQueryId,
} from "./canonical-query-rows.ts"
import { displayMetricValueSchema, dataViewModeSchema } from "./data-view.ts"

export { dataQueryIdSchema, type DataQueryId }

export const availabilitySchema = z.enum(["available", "missing", "denominator_zero", "partial", "stale", "error"])
export type Availability = z.infer<typeof availabilitySchema>

export const metricValueSchema = z.object({
  value: z.number().finite().nullable(),
  availability: availabilitySchema,
  reason: z.string().min(1).optional(),
}).strict().superRefine((metric, context) => {
  const mayCarryValue = metric.availability === "available" || metric.availability === "stale"
  if (mayCarryValue && metric.value === null) context.addIssue({ code: "custom", path: ["value"], message: `${metric.availability} metrics require a value` })
  if (!mayCarryValue && metric.value !== null) context.addIssue({ code: "custom", path: ["value"], message: `${metric.availability} metrics cannot carry a value` })
})
export type BackendMetricValue = z.infer<typeof metricValueSchema>

const authoritySchema = z.object({
  policyVersion: z.string().min(1),
  useCase: z.enum(["cross_media_operations", "historical_analysis", "product_material_adgroup_bi", "realtime_delivery", "hourly_pacing", "diagnostics", "pre_execution_check", "effect_measurement", "source_versioned_financials"]),
  role: z.enum(["default_authoritative", "comparison_reference", "source_versioned"]),
}).strict()

export const sourceLineageSchema = z.object({
  workspaceKind: z.enum(["personal", "team"]),
  source: z.enum(["ka_data", "qihang_realtime", "qihang_offline", "canonical"]),
  datasetVersion: z.string().min(1).nullable(),
  queryTemplateVersion: z.string().min(1),
  metricVersion: z.string().min(1),
  dataAsOf: z.string().datetime({ offset: true }).nullable(),
  timezone: z.string().min(1).nullable(),
  dayCut: z.string().min(1).nullable(),
  metadataAvailability: z.enum(["known", "partial", "unknown"]),
  authority: authoritySchema,
  objectIdentity: z.object({ objectType: z.literal("account"), joinKeys: z.tuple([z.literal("workspace_id"), z.literal("media"), z.literal("account_id")]) }).strict(),
  coverage: z.object({
    complete: z.boolean(),
    reason: z.string().min(1).optional(),
    requestedObjects: z.number().int().nonnegative().optional(),
    returnedObjects: z.number().int().nonnegative().optional(),
  }).strict(),
  truncated: z.boolean(),
  partial: z.boolean(),
}).strict().superRefine((lineage, context) => {
  if (lineage.truncated && !lineage.partial) context.addIssue({ code: "custom", path: ["partial"], message: "truncated lineage must be partial" })
  const sourceMetadata = [lineage.datasetVersion, lineage.dataAsOf, lineage.timezone, lineage.dayCut]
  const known = sourceMetadata.filter((value) => value !== null).length
  if (lineage.metadataAvailability === "known" && known !== sourceMetadata.length) context.addIssue({ code: "custom", path: ["metadataAvailability"], message: "known lineage requires all source metadata" })
  if (lineage.metadataAvailability === "unknown" && known !== 0) context.addIssue({ code: "custom", path: ["metadataAvailability"], message: "unknown lineage cannot claim source metadata" })
  if (lineage.metadataAvailability === "partial" && (known === 0 || known === sourceMetadata.length)) context.addIssue({ code: "custom", path: ["metadataAvailability"], message: "partial lineage requires some but not all source metadata" })
})
export type BackendSourceLineage = z.infer<typeof sourceLineageSchema>

export const stableDataQueryErrorCodeSchema = z.enum(["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "QUERY_NOT_ALLOWED", "VIEW_UNSUPPORTED", "SOURCE_UNAVAILABLE", "SOURCE_TRUNCATED", "UPSTREAM_INVALID_RESPONSE", "UPSTREAM_TIMEOUT", "INTERNAL_ERROR"])
export const requestIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
export const stableDataQueryErrorSchema = z.object({ code: stableDataQueryErrorCodeSchema, message: z.string().min(1), retryable: z.boolean(), requestId: requestIdSchema }).strict()
export type StableDataQueryError = z.infer<typeof stableDataQueryErrorSchema>

export const dataQueryRequestSchema = z.object({
  queryId: dataQueryIdSchema.exclude(["reconcile.account_daily"]),
  params: z.record(z.string(), z.unknown()),
}).strict()
export type CanonicalDataQueryRequest = z.infer<typeof dataQueryRequestSchema>

export const sourceQueryResultSchema = z.object({
  queryId: dataQueryIdSchema,
  rowSchemaVersion: z.string().min(1),
  status: z.enum(["ready", "unavailable"]),
  rows: z.array(z.record(z.string(), z.unknown())),
  returnedRowCount: z.number().int().nonnegative(),
  wholeResultTotal: metricValueSchema,
  lineage: sourceLineageSchema,
  warnings: z.array(z.string()),
  error: stableDataQueryErrorSchema.optional(),
}).strict().superRefine((source, context) => {
  const expectedVersion = canonicalRowSchemaVersionByQueryId[source.queryId]
  if (source.rowSchemaVersion !== expectedVersion) context.addIssue({ code: "custom", path: ["rowSchemaVersion"], message: `rowSchemaVersion must be ${expectedVersion}` })
  const rowSchema = canonicalQueryRowSchemaById[source.queryId]
  source.rows.forEach((row, index) => {
    if (!rowSchema.safeParse(row).success) context.addIssue({ code: "custom", path: ["rows", index], message: `row does not match the canonical ${source.queryId} schema` })
  })
  if (source.rows.length !== source.returnedRowCount) context.addIssue({ code: "custom", path: ["returnedRowCount"], message: "row count mismatch" })
  if (source.status === "unavailable" && !source.error) context.addIssue({ code: "custom", path: ["error"], message: "unavailable source requires error" })
  if (source.status === "unavailable" && source.rows.length) context.addIssue({ code: "custom", path: ["rows"], message: "unavailable source cannot carry rows" })
  if (source.status === "ready" && source.error) context.addIssue({ code: "custom", path: ["error"], message: "ready source cannot carry error" })
  if ((source.lineage.partial || source.lineage.truncated || !source.lineage.coverage.complete) && source.wholeResultTotal.availability === "available") context.addIssue({ code: "custom", path: ["wholeResultTotal"], message: "partial result cannot expose whole total" })
})
export type SourceQueryResult = z.infer<typeof sourceQueryResultSchema>

const reconcileMetricSchema = z.object({ kaData: metricValueSchema, platform: metricValueSchema, delta: metricValueSchema, deltaRate: metricValueSchema, comparable: z.boolean(), reason: z.string().min(1).optional() }).strict().superRefine((comparison, context) => {
  if (comparison.comparable && (comparison.kaData.availability !== "available" || comparison.platform.availability !== "available")) context.addIssue({ code: "custom", path: ["comparable"], message: "only two available source values can be comparable" })
  if (!comparison.comparable) for (const field of ["delta", "deltaRate"] as const) if (comparison[field].availability === "available") context.addIssue({ code: "custom", path: [field], message: `${field} cannot be available when values are not comparable` })
})
const reconcileRowSchema = z.object({ key: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])), metrics: z.record(z.string(), reconcileMetricSchema) }).strict()
const singleSourceSchema = z.object({ mode: z.enum(["ka_data", "platform"]), source: sourceQueryResultSchema }).strict()
const reconcileSchema = z.object({
  mode: z.literal("reconcile"),
  kaData: sourceQueryResultSchema,
  platform: sourceQueryResultSchema,
  comparison: z.object({ status: z.enum(["ready", "unavailable"]), reason: z.enum(["source_missing", "source_unavailable", "partial_source", "metric_not_comparable", "reconciliation_engine_pending"]).optional(), rows: z.array(reconcileRowSchema) }).strict(),
}).strict()

export const dataQuerySuccessDataSchema = z.discriminatedUnion("mode", [singleSourceSchema, reconcileSchema])
export const dataQueryResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: dataQuerySuccessDataSchema }).strict(),
  z.object({ ok: z.literal(false), error: stableDataQueryErrorSchema }).strict(),
])
export type DataQueryResponse = z.infer<typeof dataQueryResponseSchema>

// Local mock/display preference only. InternalApiDataClient never sends dataView.
export type QueryRequest = { queryId: DataQueryId; params: Record<string, unknown>; dataView: import("./data-view.ts").DataViewMode; mockState?: import("./data-view.ts").DataState }

const displayMetricSchema = z.object({ key: z.string(), label: z.string(), value: z.string(), delta: z.string().nullable(), tone: z.enum(["neutral", "positive", "warning", "critical"]) })
export type DisplayMetric = z.infer<typeof displayMetricSchema>

const anomalySummarySchema = z.object({ id: z.string(), findingId: z.string().nullable(), media: z.string(), accountId: z.string(), accountName: z.string(), title: z.string(), severity: z.enum(["info", "warning", "critical"]), evidence: z.string(), attribution: z.string(), suggestedAction: z.string(), cta: z.string() })
export type AnomalySummary = z.infer<typeof anomalySummarySchema>

export const workbenchSchema = z.object({
  greeting: z.string(), scopeLabel: z.string(), metrics: z.array(displayMetricSchema), anomalies: z.array(anomalySummarySchema), accountCoverage: z.string(), healthyAccountMessage: z.string(),
  trend: z.array(z.object({ label: z.string(), spend: z.number().nullable(), realCpa: z.number().nullable() })),
  yesterdayActions: z.array(z.object({ id: z.string(), title: z.string(), result: z.enum(["positive", "negative"]), evidence: z.string() })),
  todos: z.array(z.object({ label: z.string(), value: z.string(), kind: z.enum(["assigned", "self_created"]) })),
  morningBrief: z.object({ title: z.string(), summary: z.string(), details: z.array(z.string()) }),
  alerts: z.array(z.object({ level: z.enum(["P0", "P1"]), label: z.string(), value: z.string(), detail: z.string() })),
})
export type WorkbenchData = z.infer<typeof workbenchSchema>

const sourceMetricsSchema = z.object({ spend: displayMetricValueSchema, conversions: displayMetricValueSchema, cpa: displayMetricValueSchema }).strict()
const comparisonSchema = z.object({ comparable: z.boolean(), reason: z.string().nullable(), delta: displayMetricValueSchema, deltaRate: displayMetricValueSchema }).strict()
const metricAuthoritySchema = z.object({ defaultSource: z.enum(["ka_data", "platform", "source_versioned"]), status: z.enum(["authoritative", "realtime", "versioned", "unavailable"]), reason: z.string().min(1) }).strict()
export const metricAuthorityMatrixSchema = z.object({ spend: metricAuthoritySchema, conversions: metricAuthoritySchema, cpa: metricAuthoritySchema, assessmentCpa: metricAuthoritySchema }).strict()
export type MetricAuthorityMatrix = z.infer<typeof metricAuthorityMatrixSchema>
export const analysisRowSchema = z.object({ workspaceId: z.string().uuid().nullable(), media: z.string(), accountId: z.string(), accountName: z.string(), owner: z.string(), kaData: sourceMetricsSchema, platform: sourceMetricsSchema, assessmentCpa: displayMetricValueSchema, comparison: comparisonSchema, authorityByMetric: metricAuthorityMatrixSchema, status: z.enum(["healthy", "watch", "critical", "unavailable"]) }).strict()
export const analysisSchema = z.object({ mode: dataViewModeSchema, rows: z.array(analysisRowSchema), summary: z.string() })
export type AnalysisData = z.infer<typeof analysisSchema>
export type AnalysisRow = z.infer<typeof analysisRowSchema>

export const accountDetailSchema = z.object({ media: z.string(), accountId: z.string(), accountName: z.string(), owner: z.string(), status: z.enum(["healthy", "watch", "critical", "unavailable"]), metrics: z.array(displayMetricSchema), trend: z.array(z.object({ label: z.string(), cpa: z.number().nullable(), assessmentCpa: z.number().nullable() })), currentFindingId: z.string().nullable(), currentFindingTitle: z.string().nullable() })
export type AccountDetailData = z.infer<typeof accountDetailSchema>
export const findingDetailSchema = z.object({ findingId: z.string(), media: z.string().nullable(), accountId: z.string(), accountName: z.string(), title: z.string(), severity: z.enum(["info", "warning", "critical"]), deterministicConclusion: z.string(), evidence: z.array(z.object({ label: z.string(), value: z.string(), source: z.string() })), aiInterpretation: z.string().nullable(), aiConfidence: z.string().nullable(), changeSetId: z.string().nullable() })
export type FindingDetailData = z.infer<typeof findingDetailSchema>
export const changeSetPreviewSchema = z.object({ changeSetId: z.string(), accountId: z.string(), accountName: z.string(), status: z.literal("preview_only"), expiresAt: z.string().datetime({ offset: true }), items: z.array(z.object({ field: z.string(), from: z.string(), to: z.string(), reason: z.string() })), riskChecks: z.array(z.object({ label: z.string(), passed: z.boolean(), detail: z.string() })), executionEndpointConfigured: z.literal(false) })
export type ChangeSetPreviewData = z.infer<typeof changeSetPreviewSchema>
const readDetailErrorSchema = z.object({ code: z.union([stableDataQueryErrorCodeSchema, z.literal("NOT_FOUND")]), message: z.string().min(1), retryable: z.boolean(), requestId: requestIdSchema }).strict()
const jsonObjectSchema = z.record(z.string(), z.unknown())
export const workItemReadModelSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), media: z.string().min(1).nullable(), accountId: z.string().min(1).nullable(),
  type: z.enum(["diagnosis", "dispatch", "self", "agent_question", "external_handled"]), taskId: z.string().nullable(), ruleId: z.string().nullable(), severity: z.enum(["P0", "P1", "P2", "opportunity"]).nullable(), title: z.string().min(1), evidenceSnapshot: jsonObjectSchema.nullable(), diagnosis: jsonObjectSchema.nullable(), status: z.enum(["open", "processing", "done", "ignored", "expired", "external_handled", "rejected", "escalated"]), ignoreReason: z.string().nullable(), mutedUntil: z.string().nullable(), assignee: z.string().uuid().nullable(), creator: z.string().uuid().nullable(), acceptanceCriteria: z.string().nullable(), slaDue: z.string().datetime({ offset: true }).nullable(), rejectReason: z.string().nullable(), t1Result: jsonObjectSchema.nullable(), createdAt: z.string().datetime({ offset: true }), resolvedAt: z.string().datetime({ offset: true }).nullable(),
}).strict().superRefine((value, context) => {
  if ((value.media === null) !== (value.accountId === null)) context.addIssue({ code: "custom", path: [value.media === null ? "media" : "accountId"], message: "media and accountId must both be present or both be null" })
})
export const changeSetReadModelSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), media: z.string().min(1), accountId: z.string().min(1), workItemId: z.string().uuid().nullable(), title: z.string().nullable(), status: z.enum(["draft", "confirmed", "sent", "executing", "success", "partial", "failed", "unknown", "expired", "rolled_back"]), initiatorUserId: z.string().uuid(), executorIdentity: z.string().nullable(), multicaIssueId: z.string().nullable(), ttlExpireAt: z.string().datetime({ offset: true }).nullable(), reasonCode: z.string().nullable(), simulation: jsonObjectSchema.nullable(), createdAt: z.string().datetime({ offset: true }), executedAt: z.string().datetime({ offset: true }).nullable(), items: z.array(z.object({ id: z.number().int().positive(), targetType: z.enum(["account", "campaign", "unit", "creative"]), targetId: z.string().min(1), field: z.string().min(1), fromValue: z.string().nullable(), toValue: z.string().nullable(), itemStatus: z.enum(["pending", "success", "failed"]), failReason: z.string().nullable() }).strict()),
}).strict()
export const workItemDetailResponseSchema = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), data: z.object({ kind: z.literal("work_item"), workItem: workItemReadModelSchema }).strict() }).strict(), z.object({ ok: z.literal(false), error: readDetailErrorSchema }).strict()])
export const changeSetDetailResponseSchema = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), data: z.object({ kind: z.literal("changeset"), changeset: changeSetReadModelSchema }).strict() }).strict(), z.object({ ok: z.literal(false), error: readDetailErrorSchema }).strict()])
export type WorkItemDetailResponse = z.infer<typeof workItemDetailResponseSchema>
export type ChangeSetDetailResponse = z.infer<typeof changeSetDetailResponseSchema>
