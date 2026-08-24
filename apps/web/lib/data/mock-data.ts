import { canonicalRowSchemaVersionByQueryId, type AccountDailyRow, type AccountSummaryRow, type DataQueryId } from "./canonical-query-rows.ts"
import {
  changeSetDetailResponseSchema,
  dataQueryResponseSchema,
  workItemDetailResponseSchema,
  type BackendMetricValue,
  type ChangeSetDetailResponse,
  type DataQueryResponse,
  type QueryRequest,
  type SourceQueryResult,
  type WorkItemDetailResponse,
} from "./contracts.ts"

const AS_OF = "2026-08-24T09:30:00+08:00"
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000024"
const available = (value: number): BackendMetricValue => ({ value, availability: "available" })
const unavailable = (availability: Exclude<BackendMetricValue["availability"], "available" | "stale"> = "missing", reason?: string): BackendMetricValue => ({ value: null, availability, ...(reason ? { reason } : {}) })
const undefinedRatio = { value: null, state: "undefined" } as const

function ratios(realCpa: number | null) {
  return {
    ctr: undefinedRatio,
    cvr: undefinedRatio,
    realCpa: realCpa === null ? undefinedRatio : { value: realCpa, state: "finite" as const },
    cashCpa: undefinedRatio,
    gap: undefinedRatio,
    potentialRate: undefinedRatio,
    biConversionRate: undefinedRatio,
  }
}

function summaryRow(cost: number, realCpa: number | null, anomalyRows: number | null): AccountSummaryRow {
  return {
    rowCount: 20,
    accountCount: 20,
    anomalyRows,
    metrics: {
      cost,
      exposure: null,
      click: null,
      conversion: null,
      realConversion: 18_620,
      cashCost: null,
      costSpace: 27_400,
      wakeUv: null,
      potentialUv: null,
      ratios: ratios(realCpa),
    },
  }
}

const summaryRows = [summaryRow(842_600, 36.8, 7)]
const trendRows = [
  ["2026-08-18", 724_000, 39.1], ["2026-08-19", 768_000, 38.4], ["2026-08-20", 751_000, null],
  ["2026-08-21", 796_000, 37.9], ["2026-08-22", 812_000, 37.2], ["2026-08-23", 826_000, 36.9], ["2026-08-24", 842_600, 36.8],
].map(([ds, cost, realCpa]) => ({ ds: String(ds), metrics: summaryRow(Number(cost), realCpa === null ? null : Number(realCpa), 7) }))

function dailyRow(input: {
  accountId: string
  accountName: string
  ownerUserId: string
  cost: number
  realConversion: number
  realCpa: number | null
  assessmentPrice: number
  dataAnomaly: boolean | null
}): AccountDailyRow {
  return {
    workspaceId: WORKSPACE_ID,
    media: "KUAISHOU",
    accountId: input.accountId,
    accountName: input.accountName,
    ownerUserId: input.ownerUserId,
    ds: "2026-08-24",
    metrics: {
      cost: input.cost,
      exposure: null,
      click: null,
      conversion: null,
      realConversion: input.realConversion,
      cashCost: null,
      costSpace: null,
      wakeUv: null,
      potentialUv: null,
      ratios: ratios(input.realCpa),
      budget: null,
      budgetUsageRate: null,
      deductionRate: null,
      mainAdCostProportion: null,
      assessmentPrice: input.assessmentPrice,
    },
    dataAnomaly: input.dataAnomaly,
    computedAt: AS_OF,
    tasks: [{ taskId: `task-${input.accountId}`, taskName: "AAC 拉新", bizName: "拉新" }],
  }
}

const accountRows = [
  dailyRow({ accountId: "demo-account-07", accountName: "演示账户 · 华东 07", ownerUserId: "优化师 A", cost: 126_800, realConversion: 2_940, realCpa: 43.13, assessmentPrice: 38, dataAnomaly: true }),
  dailyRow({ accountId: "demo-account-12", accountName: "演示账户 · 华南 12", ownerUserId: "优化师 B", cost: 98_200, realConversion: 2_735, realCpa: 35.9, assessmentPrice: 38, dataAnomaly: false }),
  dailyRow({ accountId: "demo-account-18", accountName: "演示账户 · 华北 18", ownerUserId: "优化师 C", cost: 80_274, realConversion: 2_020, realCpa: null, assessmentPrice: 40, dataAnomaly: null }),
]

function rowsFor(queryId: DataQueryId, request: QueryRequest): Record<string, unknown>[] {
  if (queryId === "account.summary") return summaryRows
  if (queryId === "account.trend") return trendRows
  if (queryId === "account.anomalies") return accountRows.filter((row) => row.dataAnomaly === true)
  if (queryId === "account.detail") {
    const accountId = String(request.params.accountId ?? "demo-account-07")
    return accountRows.filter((row) => row.accountId === accountId)
  }
  return accountRows
}

function rowsForSource(queryId: DataQueryId, request: QueryRequest, source: "ka_data" | "platform") {
  const base = rowsFor(queryId, request)
  if (source === "platform" || !["account.table", "account.detail", "reconcile.account_daily"].includes(queryId)) return base
  return base.map((raw) => {
    const row = raw as AccountDailyRow
    if (row.accountId === "demo-account-07") return { ...row, metrics: { ...row.metrics, cost: 126_000, ratios: { ...row.metrics.ratios, realCpa: { value: 42.86, state: "finite" as const } } } }
    if (row.accountId === "demo-account-12") return { ...row, metrics: { ...row.metrics, cost: 99_007, ratios: { ...row.metrics.ratios, realCpa: { value: 36.2, state: "finite" as const } } } }
    return row
  })
}

function lineage(source: "ka_data" | "platform", state: QueryRequest["mockState"]) {
  const partial = state === "partial" || state === "truncated"
  return {
    source: source === "ka_data" ? "ka_data" as const : "canonical" as const,
    datasetVersion: `${source}-demo-20260824-r1`, queryTemplateVersion: "v1-mock", metricVersion: "mock-metrics-v1", dataAsOf: AS_OF, timezone: "Asia/Shanghai", dayCut: "calendar_day", metadataAvailability: "known" as const,
    authority: { policyVersion: "2026-08-24", useCase: "cross_media_operations" as const, role: source === "ka_data" ? "default_authoritative" as const : "comparison_reference" as const },
    objectIdentity: { objectType: "account" as const, joinKeys: ["workspace_id", "media", "account_id"] as ["workspace_id", "media", "account_id"] },
    coverage: { complete: !partial, ...(partial ? { reason: state === "truncated" ? "Mock result hit truncation boundary" : "Mock partial coverage" } : {}), requestedObjects: 20, returnedObjects: partial ? 18 : 20 },
    truncated: state === "truncated", partial,
  }
}

function sourceResult(queryId: DataQueryId, source: "ka_data" | "platform", rows: Record<string, unknown>[], state: QueryRequest["mockState"]): SourceQueryResult {
  const activeRows = state === "empty" ? [] : rows
  const identity = { queryId, rowSchemaVersion: canonicalRowSchemaVersionByQueryId[queryId] }
  if (state === "unavailable") {
    const sourceError = { code: "SOURCE_UNAVAILABLE" as const, message: `${source} is unavailable in the mock scenario`, retryable: true, requestId: `mock-${source}-unavailable` }
    return { ...identity, status: "unavailable", rows: [], returnedRowCount: 0, wholeResultTotal: unavailable("error", "SOURCE_UNAVAILABLE"), lineage: { ...lineage(source, "partial"), coverage: { complete: false, reason: "Source unavailable" } }, warnings: [sourceError.message], error: sourceError }
  }
  const currentLineage = lineage(source, state)
  return { ...identity, status: "ready", rows: activeRows, returnedRowCount: activeRows.length, wholeResultTotal: currentLineage.partial ? unavailable("partial", "Partial result") : available(activeRows.length), lineage: currentLineage, warnings: ["脱敏 Mock；不代表内网真实数据"] }
}

function mockError(state: QueryRequest["mockState"]): DataQueryResponse | null {
  const mapping = {
    error: ["INTERNAL_ERROR", "数据查询失败", false], unauthorized: ["UNAUTHORIZED", "登录态已失效", false], forbidden: ["FORBIDDEN", "当前身份没有账户范围权限", false], timeout: ["UPSTREAM_TIMEOUT", "内网数据查询超时", true], "too-large": ["UPSTREAM_INVALID_RESPONSE", "上游响应超过 16 MB 安全上限", false],
  } as const
  const entry = state && state in mapping ? mapping[state as keyof typeof mapping] : undefined
  return entry ? { ok: false, error: { code: entry[0], message: entry[1], retryable: entry[2], requestId: `mock-${state}-request` } } : null
}

function reconcileRows(state: QueryRequest["mockState"]) {
  if (state === "unavailable") return []
  const comparable = (ka: number, platform: number, delta: number, deltaRate: number) => ({ kaData: available(ka), platform: available(platform), delta: available(delta), deltaRate: available(deltaRate), comparable: true })
  const missingPlatform = { kaData: available(39.74), platform: unavailable("missing", "该来源缺失"), delta: unavailable("missing", "该来源缺失"), deltaRate: unavailable("missing", "该来源缺失"), comparable: false, reason: "source_missing" }
  return [
    { key: { workspace_id: WORKSPACE_ID, media: "KUAISHOU", account_id: "demo-account-07" }, metrics: { cpa: comparable(42.86, 43.13, 0.27, 0.0063), spend: comparable(126_000, 126_800, 800, 0.00635) } },
    { key: { workspace_id: WORKSPACE_ID, media: "KUAISHOU", account_id: "demo-account-12" }, metrics: { cpa: comparable(36.2, 35.9, -0.3, -0.0083), spend: comparable(99_007, 98_200, -807, -0.00815) } },
    { key: { workspace_id: WORKSPACE_ID, media: "KUAISHOU", account_id: "demo-account-18" }, metrics: { cpa: missingPlatform, spend: { ...missingPlatform, kaData: available(80_274) } } },
  ]
}

export function getMockResponse(request: QueryRequest): DataQueryResponse {
  const errorResponse = mockError(request.mockState)
  if (errorResponse) return errorResponse
  if (request.dataView === "reconcile") {
    const kaRows = rowsForSource(request.queryId, request, "ka_data")
    const platformRows = rowsForSource(request.queryId, request, "platform").filter((row) => !("accountId" in row) || row.accountId !== "demo-account-18")
    const kaData = sourceResult(request.queryId, "ka_data", kaRows, request.mockState)
    const platform = sourceResult(request.queryId, "platform", platformRows, request.mockState)
    if (request.queryId === "reconcile.account_daily") {
      kaData.lineage.authority = { policyVersion: "2026-08-24", useCase: "source_versioned_financials", role: "source_versioned" }
      platform.lineage.authority = { policyVersion: "2026-08-24", useCase: "source_versioned_financials", role: "source_versioned" }
    }
    const isUnavailable = request.mockState === "unavailable" || kaData.status === "unavailable" || platform.status === "unavailable"
    return dataQueryResponseSchema.parse({ ok: true, data: { mode: "reconcile", kaData, platform, comparison: { status: isUnavailable ? "unavailable" : "ready", ...(isUnavailable ? { reason: "source_unavailable" } : {}), rows: isUnavailable ? [] : reconcileRows(request.mockState) } } })
  }
  const source = sourceResult(request.queryId, request.dataView, rowsForSource(request.queryId, request, request.dataView), request.mockState)
  return dataQueryResponseSchema.parse({ ok: true, data: { mode: request.dataView, source } })
}

export function getMockWorkItemDetail(findingId: string): WorkItemDetailResponse {
  const id = /^[0-9a-f-]{36}$/i.test(findingId) ? findingId : "00000000-0000-4000-8000-000000000701"
  return workItemDetailResponseSchema.parse({ ok: true, data: { kind: "work_item", workItem: { id, workspaceId: "00000000-0000-4000-8000-000000000024", media: "KUAISHOU", accountId: "demo-account-07", type: "diagnosis", taskId: null, ruleId: "D-CPA-003", severity: "P0", title: "CPA 连续 3 个时段高于考核价", evidenceSnapshot: { 当前CPA: "¥ 43.13", 考核价: "¥ 38.00" }, diagnosis: { conclusion: "确定性规则 D-CPA-003 已命中" }, status: "open", ignoreReason: null, mutedUntil: null, assignee: null, creator: null, acceptanceCriteria: null, slaDue: null, rejectReason: null, t1Result: null, createdAt: "2026-08-24T01:00:00.000Z", resolvedAt: null } } })
}

export function getMockChangeSetDetail(): ChangeSetDetailResponse {
  return changeSetDetailResponseSchema.parse({ ok: true, data: { kind: "changeset", changeset: { id: "00000000-0000-4000-8000-000000000702", workspaceId: "00000000-0000-4000-8000-000000000024", media: "KUAISHOU", accountId: "demo-account-07", workItemId: "00000000-0000-4000-8000-000000000701", title: "预算调整预览", status: "draft", initiatorUserId: "00000000-0000-4000-8000-000000000024", executorIdentity: null, multicaIssueId: null, ttlExpireAt: "2026-08-24T10:00:00+08:00", reasonCode: "控制异常时段风险敞口", simulation: null, createdAt: "2026-08-24T01:00:00.000Z", executedAt: null, items: [{ id: 1, targetType: "account", targetId: "demo-account-07", field: "计划预算", fromValue: "¥ 50,000 / 日", toValue: "¥ 45,000 / 日", itemStatus: "pending", failReason: null }] } } })
}
