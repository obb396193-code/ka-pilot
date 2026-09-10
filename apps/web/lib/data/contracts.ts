import { readChangeValueSchema } from "./change-value.ts"
import { z } from "zod"

import {
  canonicalQueryRowSchemaById,
  canonicalRowSchemaVersionByQueryId,
  dataQueryIdSchema,
  dimensionTypeSchema,
  pivotWindowRowsSchema,
  accountHourlyRowsSchema,
  accountGapRowsSchema,
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

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
})
const queryWindowSchema = z.object({ from: calendarDate, to: calendarDate,
  preset: z.enum(["today", "yesterday", "last_7d", "month_to_date", "last_month", "task_period", "custom"]).default("custom"),
}).strict().refine((value) => value.from <= value.to)

export const sourceLineageSchema = z.object({
  window: queryWindowSchema.optional(),
  warnings: z.array(z.string()).optional(),
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

/**
 * F8-14（契约 v1.9.10 / v1.9.13）：后端除了原来 11 个稳定码，还会返后 5 个
 * （kb 单读、账户交接撞变更集、任务详情越权、登录/改密限速、viewer 写入拦截）。
 * 它们不在枚举里时，**合法的 404/409/429 会被 BFF 判成「上游不合契约」502**，
 * 用户看到「上游坏了」而不是「这篇文档不存在」「操作太频繁」。
 */
export const stableDataQueryErrorCodeSchema = z.enum(["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "QUERY_NOT_ALLOWED", "VIEW_UNSUPPORTED", "DIMENSION_UNSUPPORTED", "SOURCE_UNAVAILABLE", "SOURCE_TRUNCATED", "UPSTREAM_INVALID_RESPONSE", "UPSTREAM_TIMEOUT", "INTERNAL_ERROR", "NOT_FOUND", "CONFLICT", "RATE_LIMITED", "INVALID_CREDENTIALS", "READ_ONLY_ROLE", "NOT_IMPLEMENTED"])
export type StableDataQueryErrorCode = z.infer<typeof stableDataQueryErrorCodeSchema>

/**
 * 稳定码 → 期望的 HTTP 状态，BFF 用它校验「状态码和 body 自洽」。
 * `null` = 状态由后端定（同一个码可能配 400/405/410），BFF 不二次判定，只要求 body 是合法信封。
 */
export const stableErrorStatus: Record<StableDataQueryErrorCode, number | null> = {
  INVALID_REQUEST: null, QUERY_NOT_ALLOWED: null, VIEW_UNSUPPORTED: null, DIMENSION_UNSUPPORTED: null,
  UNAUTHORIZED: 401, FORBIDDEN: 403, INTERNAL_ERROR: 500,
  SOURCE_TRUNCATED: 502, UPSTREAM_INVALID_RESPONSE: 502, SOURCE_UNAVAILABLE: 503, UPSTREAM_TIMEOUT: 504,
  NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429, INVALID_CREDENTIALS: 401, READ_ONLY_ROLE: 403,
  // 501：后端明说「这条一期不做」。不进枚举的话它会被判成 502「上游坏了」，
  // 用户看到的是故障，其实是功能没排期——这两件事不能混。
  NOT_IMPLEMENTED: 501,
}

/**
 * BFF 自己造错误时的 `retryable`：以前几个 handler 写死 false，
 * 于是上游超时、数据源暂时不可用、限速这些「等会儿真能好」的情况也让人干等。
 * 上游自己返回的 `retryable` 照旧透传，不被这里覆盖。
 */
const retryableCodes: ReadonlySet<string> = new Set(["SOURCE_UNAVAILABLE", "UPSTREAM_TIMEOUT", "RATE_LIMITED"])
export function isRetryableErrorCode(code: string): boolean { return retryableCodes.has(code) }

/**
 * 稳定码 → 用户能看懂的中文。没列的返 null，调用方用自己那句兜底文案
 * （别把没映射的码显成「未知错误」，也别把后端英文原文直接甩给用户）。
 */
const errorCopy: Record<string, string> = {
  RATE_LIMITED: "操作太频繁，15 分钟后再试",
  INVALID_CREDENTIALS: "用户名或密码错误",
  // 契约 v1.9.14 冻结原文，别改：访客点写按钮时唯一的解释
  READ_ONLY_ROLE: "演示空间只读，想用真数据找管理员开户",
  NOT_FOUND: "这条记录不存在，或者已经被删了",
  CONFLICT: "这条刚被别人改过，刷新后再试一次",
  UNAUTHORIZED: "登录已过期，请重新登录",
  FORBIDDEN: "你没有做这一步的权限",
  NOT_IMPLEMENTED: "这一块一期未开放",
  UPSTREAM_TIMEOUT: "上游超时了，稍后重试",
  SOURCE_UNAVAILABLE: "数据源暂时不可用，稍后重试",
}
export function stableErrorCopy(code: string): string | null { return errorCopy[code] ?? null }

/**
 * 我们自己定死文案、不让上游 message 覆盖的码：
 * 限速要说清「还要等多久」，只读身份要说清「找谁开权限」——后端那句英文/泛化提示说不了这些。
 * 其余码上游 message 更贴场景（同是 INVALID_CREDENTIALS，登录是「用户名或密码错误」、改密是「当前密码不正确」），以上游为准。
 */
const enforcedCopyCodes: ReadonlySet<string> = new Set(["RATE_LIMITED", "READ_ONLY_ROLE", "NOT_IMPLEMENTED"])
export function resolveErrorMessage(code: string, upstream?: string | null): string {
  const copy = stableErrorCopy(code)
  if (copy !== null && (enforcedCopyCodes.has(code) || !upstream)) return copy
  return upstream ?? "这一步没成功，稍后再试"
}
export const requestIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
/**
 * v1.9.19：错误信封加可选 `details`（只在该码明确声明时出现，例如 rerun 撞车的 409 CONFLICT 带 `details.jobId`）。
 * 故意收成 `looseObject`：后端往 details 里多塞一个键不该让整条响应被判成「上游不合契约」502。
 */
export const stableDataQueryErrorSchema = z.object({ code: stableDataQueryErrorCodeSchema, message: z.string().min(1), retryable: z.boolean(), requestId: requestIdSchema, details: z.looseObject({}).optional() }).strict()
export type StableDataQueryError = z.infer<typeof stableDataQueryErrorSchema>

export const dataQueryRequestSchema = z.object({
  queryId: dataQueryIdSchema.exclude(["reconcile.account_daily"]),
  params: z.record(z.string(), z.unknown()),
}).strict()
export type CanonicalDataQueryRequest = z.infer<typeof dataQueryRequestSchema>

export const sourceQueryResultSchema = z.object({
  queryId: dataQueryIdSchema,
  groupBy: z.enum(["account", "task", "biz"]).optional(),
  dimension: dimensionTypeSchema.optional(),
  dimA: dimensionTypeSchema.optional(), dimB: dimensionTypeSchema.optional(),
  rowSchemaVersion: z.string().min(1),
  status: z.enum(["ready", "unavailable"]),
  rows: z.array(z.record(z.string(), z.unknown())),
  returnedRowCount: z.number().int().nonnegative(),
  wholeResultTotal: metricValueSchema,
  lineage: sourceLineageSchema,
  warnings: z.array(z.string()),
  error: stableDataQueryErrorSchema.optional(),
}).strict().superRefine((source, context) => {
  if (source.queryId === "account.gap") {
    if (source.groupBy === undefined || !source.lineage.window || !accountGapRowsSchema.safeParse(source.rows).success)
      context.addIssue({ code: "custom", message: "Gap requires grouping/window/unique valid rows" })
  } else if (source.groupBy !== undefined) context.addIssue({ code: "custom", message: "Unexpected Gap grouping" })
  if (source.queryId === "account.hourly" && (!accountHourlyRowsSchema.safeParse(source.rows).success || !source.lineage.window ||
    source.lineage.window.from !== source.lineage.window.to)) context.addIssue({ code: "custom", message: "Invalid hourly rows or window" })
  if (source.queryId === "account.dimension") {
    if (source.dimension === undefined || !source.lineage.window || new Set(source.rows.map((row) => row.key)).size !== source.rows.length) context.addIssue({ code: "custom", message: "Invalid dimension/window/groups" })
    for (const row of source.rows) {
      if ((source.dimension === "account") !== (typeof row.media === "string" && typeof row.accountId === "string") ||
        (source.dimension === "agent_type") !== (row.agent_type !== undefined) ||
        (row.assessment as { priceSource?: unknown } | undefined)?.priceSource !== (source.lineage.workspaceKind === "team" ? "ka_daily" : "history")) {
        context.addIssue({ code: "custom", message: "Invalid dimension identity/source" })
      }
    }
  } else if (source.dimension !== undefined) context.addIssue({ code: "custom", message: "Unexpected dimension" })
  if (source.queryId === "account.pivot2") {
    if (!pivotWindowRowsSchema.safeParse({ queryId: source.queryId, rowSchemaVersion: source.rowSchemaVersion,
      dimA: source.dimA, dimB: source.dimB, rows: source.rows }).success) context.addIssue({ code: "custom", message: "Invalid pivot dimensions/cells" })
  } else if (source.dimA !== undefined || source.dimB !== undefined) context.addIssue({ code: "custom", message: "Unexpected pivot dimensions" })
  if ((source.queryId === "account.summary" || source.queryId === "account.trend" || source.queryId === "account.pivot2") && !source.lineage.window) context.addIssue({ code: "custom", message: "Window queries require lineage.window" })
  const expectedVersion = canonicalRowSchemaVersionByQueryId[source.queryId]
  if (source.rowSchemaVersion !== expectedVersion) context.addIssue({ code: "custom", path: ["rowSchemaVersion"], message: `rowSchemaVersion must be ${expectedVersion}` })
  const rowSchema = canonicalQueryRowSchemaById[source.queryId]
  source.rows.forEach((row, index) => {
    if ((source.queryId === "account.summary" || source.queryId === "account.pivot2") && (row.assessment as { priceSource?: unknown } | undefined)?.priceSource !==
      (source.lineage.workspaceKind === "team" ? "ka_daily" : "history")) context.addIssue({ code: "custom", path: ["rows", index], message: "Price source/workspace mismatch" })
    if (source.queryId === "account.trend" && source.lineage.window &&
      (typeof row.ds !== "string" || row.ds < source.lineage.window.from || row.ds > source.lineage.window.to)) context.addIssue({ code: "custom", path: ["rows", index], message: "Trend outside window" })
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
const hourlyMetaSchema = z.object({ requestId: requestIdSchema, dataAsOf: z.string().datetime({ offset: true }).nullable(),
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const d = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value
  }), workspaceKind: z.literal("personal"), selectedSource: z.literal("platform"),
}).strict()
const gapMetaSchema = hourlyMetaSchema.extend({ ruleSetVersion: z.string().min(1).max(256)
  .refine(value => value.trim() === value && [...value].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127), "Invalid rule version") }).strict()
export const dataQueryResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: dataQuerySuccessDataSchema,
    meta: z.union([z.object({ cellCoverage: z.object({ cells: z.number().int().min(0).max(10000), withData: z.number().int().min(0).max(10000),
      undeterminable: z.number().int().min(0).max(10000) }).strict().refine(value => value.withData <= value.cells && value.undeterminable <= value.cells) }).strict(), hourlyMetaSchema, gapMetaSchema]).optional(),
  }).strict().superRefine((value, context) => {
    if (value.data.mode !== "reconcile" && value.data.source.queryId === "account.gap") {
      const parsed = gapMetaSchema.safeParse(value.meta), source = value.data.source
      if (!parsed.success || value.data.mode !== "platform" || source.lineage.workspaceKind !== "personal" || source.lineage.source === "ka_data" ||
        parsed.data.dataAsOf !== source.lineage.dataAsOf || parsed.data.businessDate !== source.lineage.window?.to)
        context.addIssue({ code: "custom", message: "Gap metadata must match source and carry a rule version" })
      return
    }
    if (value.data.mode !== "reconcile" && value.data.source.queryId === "account.hourly") {
      const parsed = hourlyMetaSchema.safeParse(value.meta), source = value.data.source
      if (!parsed.success || value.data.mode !== "platform" || source.lineage.workspaceKind !== "personal" || source.lineage.source === "ka_data" ||
        parsed.data.dataAsOf !== source.lineage.dataAsOf || parsed.data.businessDate !== source.lineage.window?.from)
        context.addIssue({ code: "custom", message: "Hourly metadata must match source" })
      return
    }
    const source = value.data.mode !== "reconcile" && value.data.source.queryId === "account.pivot2" ? value.data.source : null
    if (!source) { if (value.meta !== undefined) context.addIssue({ code: "custom", message: "Unexpected pivot metadata" }); return }
    const coverage = value.meta && "cellCoverage" in value.meta ? value.meta.cellCoverage : undefined
    if (!coverage || coverage.cells !== source.rows.length || coverage.undeterminable !== source.rows.filter(row =>
      (row.assessment as { onTarget?: unknown } | undefined)?.onTarget === null).length) context.addIssue({ code: "custom", message: "Invalid pivot coverage" })
  }),
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
// NOT_FOUND 已并进共享枚举（F8-14），这里不再单独扩
const readDetailErrorSchema = stableDataQueryErrorSchema
const jsonObjectSchema = z.record(z.string(), z.unknown())
export const workItemReadModelSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), media: z.string().min(1).nullable(), accountId: z.string().min(1).nullable(),
  type: z.enum(["diagnosis", "dispatch", "self", "agent_question", "external_handled"]), taskId: z.string().nullable(), ruleId: z.string().nullable(), severity: z.enum(["P0", "P1", "P2", "opportunity"]).nullable(), title: z.string().min(1), evidenceSnapshot: jsonObjectSchema.nullable(), diagnosis: jsonObjectSchema.nullable(), status: z.enum(["open", "processing", "done", "ignored", "expired", "external_handled", "rejected", "escalated"]), ignoreReason: z.string().nullable(), mutedUntil: z.string().nullable(), assignee: z.string().uuid().nullable(), creator: z.string().uuid().nullable(), acceptanceCriteria: z.string().nullable(), slaDue: z.string().datetime({ offset: true }).nullable(), rejectReason: z.string().nullable(), t1Result: jsonObjectSchema.nullable(), createdAt: z.string().datetime({ offset: true }), resolvedAt: z.string().datetime({ offset: true }).nullable(),
}).strict().superRefine((value, context) => {
  if ((value.media === null) !== (value.accountId === null)) context.addIssue({ code: "custom", path: [value.media === null ? "media" : "accountId"], message: "media and accountId must both be present or both be null" })
})
export const changeSetReadModelSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), media: z.string().min(1), accountId: z.string().min(1), workItemId: z.string().uuid().nullable(), title: z.string().nullable(), status: z.enum(["draft", "confirmed", "sent", "executing", "success", "partial", "failed", "unknown", "expired", "rolled_back"]), initiatorUserId: z.string().uuid(), executorIdentity: z.string().nullable(), multicaIssueId: z.string().nullable(), ttlExpireAt: z.string().datetime({ offset: true }).nullable(), reasonCode: z.string().nullable(), simulation: jsonObjectSchema.nullable(), createdAt: z.string().datetime({ offset: true }), executedAt: z.string().datetime({ offset: true }).nullable(), items: z.array(z.object({ id: z.number().int().positive(), targetType: z.enum(["account", "campaign", "unit", "creative"]), targetId: z.string().min(1), field: z.string().min(1), fromValue: readChangeValueSchema, toValue: readChangeValueSchema, itemStatus: z.enum(["pending", "success", "failed"]), failReason: z.string().nullable() }).strict()),
}).strict()
export const workItemDetailResponseSchema = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), data: z.object({ kind: z.literal("work_item"), workItem: workItemReadModelSchema }).strict() }).strict(), z.object({ ok: z.literal(false), error: readDetailErrorSchema }).strict()])
export const changeSetDetailResponseSchema = z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), data: z.object({ kind: z.literal("changeset"), changeset: changeSetReadModelSchema }).strict() }).strict(), z.object({ ok: z.literal(false), error: readDetailErrorSchema }).strict()])
export type WorkItemDetailResponse = z.infer<typeof workItemDetailResponseSchema>
export type ChangeSetDetailResponse = z.infer<typeof changeSetDetailResponseSchema>
