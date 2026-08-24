import { dataQueryResponseSchema, type BackendMetricValue, type DataQueryId, type DataQueryResponse, type QueryRequest, type SourceQueryResult } from "./contracts.ts"

const AS_OF = "2026-08-24T09:30:00+08:00"
const available = (value: number): BackendMetricValue => ({ value, availability: "available" })
const unavailable = (availability: Exclude<BackendMetricValue["availability"], "available" | "stale"> = "missing", reason?: string): BackendMetricValue => ({ value: null, availability, ...(reason ? { reason } : {}) })

const accountRows = [
  { ds: "2026-08-24", media: "KUAISHOU", account_id: "demo-account-07", account_name: "演示账户 · 华东 07", owner: "优化师 A", cost: 126800, cost_display: "¥ 126,800", conversions: 2940, conversions_display: "2,940", cpa: 43.13, cpa_display: "¥ 43.13", assessment_cpa: 38, assessment_cpa_display: "¥ 38.00", status: "critical", finding_id: "finding-cost-001", finding_title: "CPA 连续 3 个时段高于考核价" },
  { ds: "2026-08-24", media: "KUAISHOU", account_id: "demo-account-12", account_name: "演示账户 · 华南 12", owner: "优化师 B", cost: 98200, cost_display: "¥ 98,200", conversions: 2735, conversions_display: "2,735", cpa: 35.9, cpa_display: "¥ 35.90", assessment_cpa: 38, assessment_cpa_display: "¥ 38.00", status: "healthy" },
  { ds: "2026-08-24", media: "KUAISHOU", account_id: "demo-account-18", account_name: "演示账户 · 华北 18", owner: "优化师 C", cost: 80274, cost_display: "¥ 80,274", conversions: 2020, conversions_display: "2,020", cpa: 39.74, cpa_display: "¥ 39.74", assessment_cpa: 40, assessment_cpa_display: "¥ 40.00", status: "unavailable", finding_id: "finding-coverage-002", finding_title: "平台数据源延迟" },
]

const anomalyRows = [
  { finding_id: "finding-cost-001", account_id: "demo-account-07", account_name: "演示账户 · 华东 07", title: "CPA 连续 3 个时段高于考核价", severity: "critical", evidence: "服务端规则命中：当前 CPA ¥43.13，考核价 ¥38.00", attribution: "素材疲劳与高成本人群占比同步上升", suggested_action: "先收紧异常时段预算，再复核素材与人群", deterministic_conclusion: "确定性规则 D-CPA-003 已命中；前端只展示后端证据。", ai_interpretation: "可能与午前流量结构变化有关；建议先核查素材与人群分布。", ai_confidence: "中等 · 仅解释，不构成执行指令", evidence_items: [{ label: "当前 CPA", value: "¥ 43.13", source: "platform.metrics.cpa_display" }, { label: "考核价", value: "¥ 38.00", source: "account.assessment_cpa_display" }], change_set: { change_set_id: "changeset-demo-001", expires_at: "2026-08-24T10:00:00+08:00", items: [{ field: "计划预算", from: "¥ 50,000 / 日", to: "¥ 45,000 / 日", reason: "控制异常时段风险敞口" }], risk_checks: [{ label: "媒体写端点", passed: false, detail: "未接执行器" }] } },
  { finding_id: "finding-coverage-002", account_id: "demo-account-18", account_name: "演示账户 · 华北 18", title: "平台数据源延迟", severity: "warning", evidence: "真实 CPA −；平台批次停留在 08:30，当前不可判断", attribution: "平台取数批次延迟", suggested_action: "保持只读，等待数据恢复后重新诊断", deterministic_conclusion: "来源完整性检查未通过，不输出成本结论。", ai_interpretation: null, ai_confidence: null, evidence_items: [{ label: "真实 CPA", value: "−", source: "platform.metrics.cpa" }], change_set: null },
]

const summaryRows = [{ cost: 842600, cost_display: "¥ 842,600", real_cpa: 36.8, real_cpa_display: "¥ 36.80", assessment_cpa_display: "考核价 ¥ 38.00", compliance_rate_display: "76.4%", cost_space_display: "¥ 27,400", bi_volume_display: "18,620", risk_count_display: "7", account_coverage_display: "18 / 20" }]
const trendRows = [
  { ds: "2026-08-18", label: "8/18", cost: 724000, real_cpa: 39.1 }, { ds: "2026-08-19", label: "8/19", cost: 768000, real_cpa: 38.4 },
  { ds: "2026-08-20", label: "8/20", cost: 751000, real_cpa: null, cpa_availability: "denominator_zero" }, { ds: "2026-08-21", label: "8/21", cost: 796000, real_cpa: 37.9 },
  { ds: "2026-08-22", label: "8/22", cost: 812000, real_cpa: 37.2 }, { ds: "2026-08-23", label: "8/23", cost: 826000, real_cpa: 36.9 }, { ds: "2026-08-24", label: "8/24", cost: 842600, real_cpa: 36.8 },
]

function rowsFor(queryId: DataQueryId, request: QueryRequest) {
  if (queryId === "account.summary") return summaryRows
  if (queryId === "account.trend") return trendRows
  if (queryId === "account.anomalies") return anomalyRows
  if (queryId === "account.detail") {
    const accountId = String(request.params.accountId ?? "demo-account-07")
    return accountRows.filter((row) => row.account_id === accountId)
  }
  return accountRows
}

function rowsForSource(queryId: DataQueryId, request: QueryRequest, source: "ka_data" | "platform") {
  const base = rowsFor(queryId, request) as Record<string, unknown>[]
  if (source === "platform" || (queryId !== "account.table" && queryId !== "account.detail" && queryId !== "reconcile.account_daily")) return base
  return base.map((row) => {
    if (row.account_id === "demo-account-07") return { ...row, cost: 126000, cost_display: "¥ 126,000", cpa: 42.86, cpa_display: "¥ 42.86" }
    if (row.account_id === "demo-account-12") return { ...row, cost: 99007, cost_display: "¥ 99,007", cpa: 36.2, cpa_display: "¥ 36.20" }
    return row
  })
}

function lineage(source: "ka_data" | "platform", state: QueryRequest["mockState"]) {
  const partial = state === "partial" || state === "truncated"
  return {
    source: source === "ka_data" ? "ka_data" as const : "canonical" as const,
    datasetVersion: `${source}-demo-20260824-r1`, queryTemplateVersion: "v1-mock", metricVersion: "mock-metrics-v1", dataAsOf: AS_OF, timezone: "Asia/Shanghai", dayCut: "calendar_day",
    authority: { policyVersion: "2026-08-24", useCase: "cross_media_operations" as const, role: source === "ka_data" ? "default_authoritative" as const : "comparison_reference" as const },
    objectIdentity: { objectType: "account" as const, joinKeys: ["workspace_id", "media", "account_id"] as ["workspace_id", "media", "account_id"] },
    coverage: { complete: !partial, ...(partial ? { reason: state === "truncated" ? "Mock result hit truncation boundary" : "Mock partial coverage" } : {}), requestedObjects: 20, returnedObjects: partial ? 18 : 20 },
    truncated: state === "truncated", partial,
  }
}

function sourceResult(source: "ka_data" | "platform", rows: Record<string, unknown>[], state: QueryRequest["mockState"]): SourceQueryResult {
  const activeRows = state === "empty" ? [] : rows
  if (state === "unavailable") {
    const sourceError = { code: "SOURCE_UNAVAILABLE" as const, message: `${source} is unavailable in the mock scenario`, retryable: true, requestId: `mock-${source}-unavailable` }
    return { status: "unavailable", rows: [], returnedRowCount: 0, wholeResultTotal: unavailable("error", "SOURCE_UNAVAILABLE"), lineage: { ...lineage(source, "partial"), coverage: { complete: false, reason: "Source unavailable" } }, warnings: [sourceError.message], error: sourceError }
  }
  const currentLineage = lineage(source, state)
  return { status: "ready", rows: activeRows, returnedRowCount: activeRows.length, wholeResultTotal: currentLineage.partial ? unavailable("partial", "Partial result") : available(activeRows.length), lineage: currentLineage, warnings: ["脱敏 Mock；不代表内网真实数据"] }
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
    { key: { workspace_id: "demo-workspace", media: "KUAISHOU", account_id: "demo-account-07" }, metrics: { cpa: comparable(42.86, 43.13, 0.27, 0.0063), spend: comparable(126000, 126800, 800, 0.00635) } },
    { key: { workspace_id: "demo-workspace", media: "KUAISHOU", account_id: "demo-account-12" }, metrics: { cpa: comparable(36.2, 35.9, -0.3, -0.0083), spend: comparable(99007, 98200, -807, -0.00815) } },
    { key: { workspace_id: "demo-workspace", media: "KUAISHOU", account_id: "demo-account-18" }, metrics: { cpa: missingPlatform, spend: { ...missingPlatform, kaData: available(80274) } } },
  ]
}

export function getMockResponse(request: QueryRequest): DataQueryResponse {
  const errorResponse = mockError(request.mockState)
  if (errorResponse) return errorResponse
  if (request.dataView === "reconcile") {
    const kaRows = rowsForSource(request.queryId, request, "ka_data")
    const platformRows = rowsForSource(request.queryId, request, "platform").filter((row) => row.account_id !== "demo-account-18")
    const kaData = sourceResult("ka_data", kaRows, request.mockState)
    const platform = sourceResult("platform", platformRows, request.mockState)
    if (request.queryId === "reconcile.account_daily") {
      kaData.lineage.authority = { policyVersion: "2026-08-24", useCase: "source_versioned_financials", role: "source_versioned" }
      platform.lineage.authority = { policyVersion: "2026-08-24", useCase: "source_versioned_financials", role: "source_versioned" }
    }
    const isUnavailable = request.mockState === "unavailable" || kaData.status === "unavailable" || platform.status === "unavailable"
    return dataQueryResponseSchema.parse({ ok: true, data: { mode: "reconcile", kaData, platform, comparison: { status: isUnavailable ? "unavailable" : "ready", ...(isUnavailable ? { reason: "source_unavailable" } : {}), rows: isUnavailable ? [] : reconcileRows(request.mockState) } } })
  }
  const source = sourceResult(request.dataView, rowsForSource(request.queryId, request, request.dataView), request.mockState)
  return dataQueryResponseSchema.parse({ ok: true, data: { mode: request.dataView, source } })
}
