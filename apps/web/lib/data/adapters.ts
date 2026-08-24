import {
  accountDetailSchema,
  analysisSchema,
  changeSetPreviewSchema,
  findingDetailSchema,
  workbenchSchema,
  type AccountDetailData,
  type AnalysisData,
  type AnalysisRow,
  type BackendMetricValue,
  type ChangeSetPreviewData,
  type DataQueryResponse,
  type FindingDetailData,
  type SourceQueryResult,
  type StableDataQueryError,
  type WorkbenchData,
} from "./contracts.ts"
import type { DataResponse, DataState, DataViewMode, LineageBundle, MetricValue, SourceLineage } from "./data-view.ts"

type Row = Record<string, unknown>
const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 })
const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 2 })

function text(row: Row | undefined, ...keys: string[]) { for (const key of keys) { const value = row?.[key]; if (typeof value === "string" && value) return value } return undefined }
function numeric(row: Row | undefined, ...keys: string[]) { for (const key of keys) { const value = row?.[key]; if (typeof value === "number" && Number.isFinite(value)) return value } return undefined }
function rows(source: SourceQueryResult | undefined) { return source?.status === "ready" ? source.rows : [] }
function metric(value: number | undefined, display: string | undefined, kind: "money" | "number" | "percent" = "number", missingLabel = "该来源缺失"): MetricValue {
  if (value === undefined) return { value: null, displayValue: missingLabel, availability: "missing" }
  const rendered = display ?? (kind === "money" ? money.format(value) : kind === "percent" ? percent.format(value) : number.format(value))
  return { value, displayValue: rendered, availability: "available" }
}
function backendMetric(value: BackendMetricValue | undefined, kind: "money" | "number" | "percent" = "number"): MetricValue {
  if (!value || value.value === null) {
    const availability = !value || value.availability === "available" ? "missing" : value.availability
    return { value: null, displayValue: availability === "denominator_zero" ? "−" : "该来源缺失", availability }
  }
  return metric(value.value, undefined, kind)
}
function sourceMetrics(row: Row | undefined) {
  return {
    spend: metric(numeric(row, "cost", "cost_yuan", "spend"), text(row, "cost_display", "spend_display"), "money"),
    conversions: metric(numeric(row, "conversions", "conv"), text(row, "conversions_display", "conv_display")),
    cpa: metric(numeric(row, "cpa", "real_cpa"), text(row, "cpa_display", "real_cpa_display"), "money"),
  }
}
const missingSource = () => ({ spend: metric(undefined, undefined), conversions: metric(undefined, undefined), cpa: metric(undefined, undefined) })

function errorState(error: StableDataQueryError): DataState {
  if (error.code === "UNAUTHORIZED") return "unauthorized"
  if (error.code === "FORBIDDEN") return "forbidden"
  if (error.code === "UPSTREAM_TIMEOUT") return "timeout"
  if (error.code === "UPSTREAM_INVALID_RESPONSE" && /16\s?MB/i.test(error.message)) return "too-large"
  if (error.code === "SOURCE_UNAVAILABLE") return "unavailable"
  return "error"
}
function uiLineage(source: SourceQueryResult, side: "ka_data" | "platform", isMock: boolean): SourceLineage {
  const lineage = source.lineage
  const coverage = lineage.coverage.complete ? `${lineage.coverage.returnedObjects ?? source.returnedRowCount} 个对象` : lineage.coverage.reason ?? "不完整"
  return {
    source: side,
    sourceLabel: `${side === "ka_data" ? "KA Data" : "自建平台"}${isMock ? " · 脱敏 Mock" : ""}`,
    dataAsOf: lineage.dataAsOf,
    datasetVersion: lineage.datasetVersion,
    queryTemplateVersion: lineage.queryTemplateVersion,
    metricVersion: lineage.metricVersion,
    timezone: lineage.timezone,
    dayCut: lineage.dayCut,
    metadataAvailability: lineage.metadataAvailability,
    coverage,
    truncated: lineage.truncated,
    partial: lineage.partial || !lineage.coverage.complete,
    stale: source.wholeResultTotal.availability === "stale",
    warnings: source.warnings,
  }
}
function placeholderLineage(mode: DataViewMode, error?: StableDataQueryError): LineageBundle {
  const source = (side: "ka_data" | "platform"): SourceLineage => ({ source: side, sourceLabel: `${side === "ka_data" ? "KA Data" : "自建平台"} · 未取得血缘`, dataAsOf: null, datasetVersion: null, queryTemplateVersion: "unavailable", metricVersion: "unavailable", timezone: null, dayCut: null, metadataAvailability: "unknown", coverage: "不可用", truncated: false, partial: true, stale: false, warnings: error ? [`${error.code} · requestId ${error.requestId}`] : [] })
  return mode === "reconcile" ? { mode: "reconcile", kaData: source("ka_data"), platform: source("platform"), comparability: { comparable: false, reason: "未取得双源结果" } } : { mode: "single", source: source(mode) }
}
function envelopeMeta(response: DataQueryResponse, requestedMode: DataViewMode, isMock: boolean, forcedState?: DataState) {
  if (!response.ok) return { state: forcedState ?? errorState(response.error), lineage: placeholderLineage(requestedMode, response.error), message: response.error.message, error: response.error, isMock }
  const sources = response.data.mode === "reconcile" ? [response.data.kaData, response.data.platform] : [response.data.source]
  const allRows = sources.flatMap((source) => rows(source))
  const state: DataState = forcedState === "loading" ? "loading" : sources.some((source) => source.status === "unavailable") || (response.data.mode === "reconcile" && response.data.comparison.status === "unavailable") ? "unavailable" : sources.some((source) => source.lineage.truncated) ? "truncated" : sources.some((source) => source.lineage.partial || !source.lineage.coverage.complete) ? "partial" : sources.some((source) => source.wholeResultTotal.availability === "stale") ? "stale" : allRows.length === 0 ? "empty" : "ready"
  const lineage: LineageBundle = response.data.mode === "reconcile"
    ? { mode: "reconcile", kaData: uiLineage(response.data.kaData, "ka_data", isMock), platform: uiLineage(response.data.platform, "platform", isMock), comparability: { comparable: response.data.comparison.status === "ready", reason: response.data.comparison.reason ?? null } }
    : { mode: "single", source: uiLineage(response.data.source, response.data.mode, isMock) }
  return { state, lineage, isMock, ...(state === "truncated" ? { message: "结果达到截断边界，只展示已返回部分，不参与全量结论。" } : {}), ...(state === "unavailable" ? { message: "一个或多个数据来源当前不可用。" } : {}) }
}
function sourceFor(response: DataQueryResponse, side: "ka_data" | "platform") {
  if (!response.ok) return undefined
  if (response.data.mode === "reconcile") return side === "ka_data" ? response.data.kaData : response.data.platform
  return response.data.mode === side ? response.data.source : undefined
}
function authority(response: DataQueryResponse) {
  if (!response.ok) return { defaultSource: "source_versioned" as const, status: "unavailable" as const, reason: "未取得后端权威来源元数据" }
  const candidates = response.data.mode === "reconcile" ? [{ side: "ka_data" as const, value: response.data.kaData.lineage.authority }, { side: "platform" as const, value: response.data.platform.lineage.authority }] : [{ side: response.data.mode, value: response.data.source.lineage.authority }]
  const selected = candidates.find((item) => item.value.role === "default_authoritative")
  if (!selected) return { defaultSource: "source_versioned" as const, status: "versioned" as const, reason: `后端策略 ${candidates[0]?.value.policyVersion ?? "unavailable"} 指定分来源版本` }
  return { defaultSource: selected.side, status: selected.value.useCase.includes("realtime") || selected.value.useCase.includes("diagnostics") ? "realtime" as const : "authoritative" as const, reason: `后端策略 ${selected.value.policyVersion} · ${selected.value.useCase}` }
}
function emptyWorkbench(): WorkbenchData { return { greeting: "KA 经营团队", scopeLabel: "当前查询范围", metrics: [], anomalies: [], accountCoverage: "−", healthyAccountMessage: "暂无可确认的健康账户结论", trend: [], yesterdayActions: [], todos: [], morningBrief: { title: "经营早报", summary: "当前 Contract 未返回早报内容。", details: [] }, alerts: [] } }
function emptyAnalysis(mode: DataViewMode): AnalysisData { return { mode, rows: [], summary: "当前筛选范围暂无可展示记录。" } }

export function adaptAnalysis(response: DataQueryResponse, mode: DataViewMode, isMock: boolean, forcedState?: DataState): DataResponse<AnalysisData> {
  const base = emptyAnalysis(mode)
  if (!response.ok) return { ...envelopeMeta(response, mode, isMock, forcedState), data: base }
  const kaRows = rows(sourceFor(response, "ka_data")); const platformRows = rows(sourceFor(response, "platform"))
  const byId = new Map<string, { ka?: Row; platform?: Row }>()
  for (const row of kaRows) { const id = text(row, "account_id", "accountId"); if (id) byId.set(id, { ...(byId.get(id) ?? {}), ka: row }) }
  for (const row of platformRows) { const id = text(row, "account_id", "accountId"); if (id) byId.set(id, { ...(byId.get(id) ?? {}), platform: row }) }
  const comparisonById = response.data.mode === "reconcile" ? new Map(response.data.comparison.rows.map((row) => [String(row.key.account_id ?? ""), row])) : new Map()
  const authorityValue = authority(response)
  const resultRows: AnalysisRow[] = [...byId.entries()].map(([accountId, pair]) => {
    const displayRow = pair.platform ?? pair.ka
    const comparison = comparisonById.get(accountId)?.metrics.cpa
    const statusValue = text(displayRow, "status")
    return {
      accountId, accountName: text(displayRow, "account_name", "accountName") ?? "脱敏账户", owner: text(displayRow, "owner") ?? "未提供",
      kaData: pair.ka ? sourceMetrics(pair.ka) : missingSource(), platform: pair.platform ? sourceMetrics(pair.platform) : missingSource(),
      assessmentCpa: metric(numeric(displayRow, "assessment_cpa", "assessment"), text(displayRow, "assessment_cpa_display"), "money"),
      comparison: comparison ? { comparable: comparison.comparable, reason: comparison.reason ?? null, delta: backendMetric(comparison.delta, "money"), deltaRate: backendMetric(comparison.deltaRate, "percent") } : { comparable: false, reason: mode === "reconcile" ? response.data.mode === "reconcile" ? response.data.comparison.reason ?? "后端未提供可比结果" : "后端未提供可比结果" : "单源视图不生成差异", delta: metric(undefined, undefined), deltaRate: metric(undefined, undefined) },
      authorityByMetric: { spend: authorityValue, conversions: authorityValue, cpa: authorityValue, assessmentCpa: { defaultSource: "source_versioned", status: "versioned", reason: "考核价按后端来源版本展示" } },
      status: statusValue === "healthy" || statusValue === "watch" || statusValue === "critical" ? statusValue : "unavailable",
    }
  })
  const data = analysisSchema.parse({ mode, rows: resultRows, summary: `${resultRows.length} 个账户；CPA、差异和权威来源均直接使用 API 字段与元数据。` })
  return { ...envelopeMeta(response, mode, isMock, forcedState), data }
}

export function adaptWorkbench(responses: { summary: DataQueryResponse; trend: DataQueryResponse; anomalies: DataQueryResponse }, mode: DataViewMode, isMock: boolean, forcedState?: DataState): DataResponse<WorkbenchData> {
  const failed = Object.values(responses).find((response) => !response.ok)
  const response = failed ?? responses.summary
  const base = emptyWorkbench()
  if (!responses.summary.ok || !responses.trend.ok || !responses.anomalies.ok) return { ...envelopeMeta(response, mode, isMock, forcedState), data: base }
  const summary = rows(sourceFor(responses.summary, mode === "reconcile" ? "platform" : mode))[0]
  const trendRows = rows(sourceFor(responses.trend, mode === "reconcile" ? "platform" : mode))
  const anomalySource = sourceFor(responses.anomalies, "platform")
  const anomalyItems = rows(anomalySource).map((row) => ({ id: text(row, "finding_id") ?? "unknown", accountId: text(row, "account_id") ?? "unknown", accountName: text(row, "account_name") ?? "脱敏账户", title: text(row, "title") ?? "异常待核查", severity: text(row, "severity") === "critical" ? "critical" as const : text(row, "severity") === "info" ? "info" as const : "warning" as const, evidence: text(row, "evidence") ?? "后端未提供证据", attribution: text(row, "attribution") ?? "待调查", suggestedAction: text(row, "suggested_action") ?? "保持只读并复核", cta: "查看诊断" }))
  const metrics = [
    { key: "spend", label: "今日消耗", value: text(summary, "cost_display") ?? "−", delta: null, tone: "neutral" as const },
    { key: "cpa", label: "真实 CPA", value: text(summary, "real_cpa_display", "cpa_display") ?? "−", delta: text(summary, "assessment_cpa_display") ?? null, tone: "neutral" as const },
    { key: "compliance", label: "达标率", value: text(summary, "compliance_rate_display") ?? "−", delta: null, tone: "neutral" as const },
    { key: "cost_space", label: "成本空间", value: text(summary, "cost_space_display") ?? "−", delta: null, tone: "neutral" as const },
    { key: "bi_volume", label: "BI 量级", value: text(summary, "bi_volume_display") ?? "−", delta: null, tone: "neutral" as const },
    { key: "risk", label: "待处理", value: text(summary, "risk_count_display") ?? "−", delta: null, tone: "critical" as const },
  ]
  const data = workbenchSchema.parse({ ...base, greeting: "早上好，KA 经营团队", scopeLabel: isMock ? "脱敏 Mock 数据" : "内网数据", metrics, anomalies: anomalyItems, accountCoverage: text(summary, "account_coverage_display") ?? "−", trend: trendRows.map((row) => ({ label: text(row, "label", "ds") ?? "−", spend: numeric(row, "cost", "cost_yuan") ?? null, realCpa: numeric(row, "real_cpa", "cpa") ?? null })), alerts: [{ level: "P0", label: "高优先级异常", value: String(anomalyItems.filter((item) => item.severity === "critical").length), detail: "数量由异常查询返回" }], healthyAccountMessage: "未返回的账户不自动判定健康" })
  return { ...envelopeMeta(responses.summary, mode, isMock, forcedState), data }
}

export function adaptAccountDetail(response: DataQueryResponse, mode: DataViewMode, isMock: boolean, accountId: string, forcedState?: DataState): DataResponse<AccountDetailData> {
  const source = sourceFor(response, mode === "reconcile" ? "platform" : mode); const sourceRows = rows(source); const row = sourceRows[0]
  const data = accountDetailSchema.parse({ accountId, accountName: text(row, "account_name", "accountName") ?? "脱敏账户", owner: text(row, "owner") ?? "未提供", status: ["healthy", "watch", "critical"].includes(text(row, "status") ?? "") ? text(row, "status") : "unavailable", metrics: [{ key: "spend", label: "消耗", value: text(row, "cost_display") ?? "−", delta: null, tone: "neutral" }, { key: "cpa", label: "真实 CPA", value: text(row, "cpa_display") ?? "−", delta: text(row, "assessment_cpa_display") ?? null, tone: "neutral" }], trend: sourceRows.map((item) => ({ label: text(item, "ds", "label") ?? "−", cpa: numeric(item, "cpa", "real_cpa") ?? null, assessmentCpa: numeric(item, "assessment_cpa", "assessment") ?? null })), currentFindingId: text(row, "finding_id") ?? null, currentFindingTitle: text(row, "finding_title") ?? null })
  return { ...envelopeMeta(response, mode, isMock, forcedState), data }
}

export function adaptFinding(response: DataQueryResponse, findingId: string, isMock: boolean, forcedState?: DataState): DataResponse<FindingDetailData> {
  const source = sourceFor(response, "platform"); const row = rows(source).find((item) => text(item, "finding_id") === findingId)
  const evidence = Array.isArray(row?.evidence_items) ? row.evidence_items.filter((item): item is Row => !!item && typeof item === "object" && !Array.isArray(item)).map((item) => ({ label: text(item, "label") ?? "证据", value: text(item, "value") ?? "−", source: text(item, "source") ?? "未提供" })) : []
  const data = findingDetailSchema.parse({ findingId, accountId: text(row, "account_id") ?? "unknown", accountName: text(row, "account_name") ?? "脱敏账户", title: text(row, "title") ?? "诊断详情不可用", severity: text(row, "severity") === "critical" ? "critical" : text(row, "severity") === "info" ? "info" : "warning", deterministicConclusion: text(row, "deterministic_conclusion") ?? "后端未返回确定性诊断结论。", evidence, aiInterpretation: text(row, "ai_interpretation") ?? null, aiConfidence: text(row, "ai_confidence") ?? null, changeSetId: row?.change_set && typeof row.change_set === "object" ? text(row.change_set as Row, "change_set_id") ?? null : null })
  const adapted = { ...envelopeMeta(response, "platform", isMock, forcedState), data }
  return row ? adapted : { ...adapted, state: adapted.state === "ready" ? "empty" : adapted.state, message: adapted.message ?? "未找到该诊断记录。" }
}

export function adaptChangeSet(response: DataQueryResponse, findingId: string): ChangeSetPreviewData | null {
  const source = sourceFor(response, "platform"); const row = rows(source).find((item) => text(item, "finding_id") === findingId); const raw = row?.change_set
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const change = raw as Row; const items = Array.isArray(change.items) ? change.items.filter((item): item is Row => !!item && typeof item === "object" && !Array.isArray(item)).map((item) => ({ field: text(item, "field") ?? "字段", from: text(item, "from") ?? "−", to: text(item, "to") ?? "−", reason: text(item, "reason") ?? "未提供" })) : []
  const riskChecks = Array.isArray(change.risk_checks) ? change.risk_checks.filter((item): item is Row => !!item && typeof item === "object" && !Array.isArray(item)).map((item) => ({ label: text(item, "label") ?? "检查", passed: item.passed === true, detail: text(item, "detail") ?? "未提供" })) : []
  return changeSetPreviewSchema.parse({ changeSetId: text(change, "change_set_id") ?? `preview-${findingId}`, accountId: text(row, "account_id") ?? "unknown", accountName: text(row, "account_name") ?? "脱敏账户", status: "preview_only", expiresAt: text(change, "expires_at") ?? "2026-08-24T10:00:00+08:00", items, riskChecks, executionEndpointConfigured: false })
}
