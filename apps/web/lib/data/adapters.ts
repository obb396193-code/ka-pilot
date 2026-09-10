import { formatChangeValue } from "./change-value.ts"
import {
  accountDetailSchema,
  analysisSchema,
  findingDetailSchema,
  changeSetPreviewSchema,
  stableDataQueryErrorSchema,
  resolveErrorMessage,
  workbenchSchema,
  type AccountDetailData,
  type AnalysisData,
  type AnalysisRow,
  type BackendMetricValue,
  type DataQueryResponse,
  type FindingDetailData,
  type ChangeSetDetailResponse,
  type ChangeSetPreviewData,
  type SourceQueryResult,
  type StableDataQueryError,
  type WorkItemDetailResponse,
  type WorkbenchData,
} from "./contracts.ts"
import type { DataResponse, DataState, DataViewMode, LineageBundle, MetricValue, SourceLineage } from "./data-view.ts"
import { accountDailyRowSchema, accountSummaryRowSchema, accountTrendRowSchema, type AccountDailyRow } from "./canonical-query-rows.ts"

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 })
const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 2 })

function rows(source: SourceQueryResult | undefined) { return source?.status === "ready" ? source.rows : [] }
function metric(value: number | undefined, display: string | undefined, kind: "money" | "number" | "percent" = "number", missingLabel = "该来源缺失"): MetricValue {
  if (value === undefined) return { value: null, displayValue: missingLabel, availability: "missing" }
  const rendered = display ?? (kind === "money" ? money.format(value) : kind === "percent" ? percent.format(value) : number.format(value))
  return { value, displayValue: rendered, availability: "available" }
}
function finiteRatioValue(ratio: { value: number | null; state: "finite" | "infinite" | "undefined" } | undefined) {
  return ratio?.state === "finite" && ratio.value !== null ? ratio.value : undefined
}
function backendMetric(value: BackendMetricValue | undefined, kind: "money" | "number" | "percent" = "number"): MetricValue {
  if (!value || value.value === null) {
    const availability = !value || value.availability === "available" ? "missing" : value.availability
    return { value: null, displayValue: availability === "denominator_zero" ? "−" : availability === "error" ? "取数失败" : "该来源缺失", availability }
  }
  return metric(value.value, undefined, kind)
}
function canonicalSourceMetrics(row: AccountDailyRow | undefined) {
  const realCpa = finiteRatioValue(row?.metrics.ratios.realCpa)
  return {
    spend: backendMetric(row?.metrics.cost, "money"),
    conversions: backendMetric(row?.metrics.realConversion),
    cpa: realCpa === undefined ? metric(undefined, undefined, "money", "−") : metric(realCpa, undefined, "money"),
  }
}
const missingSource = () => ({ spend: metric(undefined, undefined), conversions: metric(undefined, undefined), cpa: metric(undefined, undefined) })

function errorState(error: StableDataQueryError): DataState {
  if (error.code === "UNAUTHORIZED" || error.code === "INVALID_CREDENTIALS") return "unauthorized"
  if (error.code === "FORBIDDEN" || error.code === "READ_ONLY_ROLE") return "forbidden"
  // 「查的这条不存在」是空态不是故障态：别让用户以为系统坏了去找排障（F8-14）
  if (error.code === "NOT_FOUND") return "empty"
  if (error.code === "UPSTREAM_TIMEOUT") return "timeout"
  if (error.code === "UPSTREAM_INVALID_RESPONSE" && /16\s?MB/i.test(error.message)) return "too-large"
  if (error.code === "SOURCE_UNAVAILABLE") return "unavailable"
  return "error"
}
function contractDrift(message: string): DataQueryResponse {
  return { ok: false, error: { code: "UPSTREAM_INVALID_RESPONSE", message, retryable: false, requestId: "frontend-canonical-contract" } }
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
  if (response.ok) mode = response.data.mode
  const base = emptyAnalysis(mode)
  if (!response.ok) return { ...envelopeMeta(response, mode, isMock, forcedState), data: base }
  const kaBatch = accountDailyRowSchema.array().safeParse(rows(sourceFor(response, "ka_data")))
  const platformBatch = accountDailyRowSchema.array().safeParse(rows(sourceFor(response, "platform")))
  if (!kaBatch.success || !platformBatch.success) return { ...envelopeMeta(contractDrift("Account rows failed the strict canonical contract"), mode, isMock), data: base }
  const byId = new Map<string, { media: string; ka?: AccountDailyRow; platform?: AccountDailyRow }>()
  for (const row of kaBatch.data) { const key = `${row.media}\u0000${row.accountId}`; byId.set(key, { ...(byId.get(key) ?? { media: row.media }), ka: row }) }
  for (const row of platformBatch.data) { const key = `${row.media}\u0000${row.accountId}`; byId.set(key, { ...(byId.get(key) ?? { media: row.media }), platform: row }) }
  const comparisonById = response.data.mode === "reconcile" ? new Map(response.data.comparison.rows.map((row) => [`${String(row.key.media ?? "")}\u0000${String(row.key.account_id ?? "")}`, row])) : new Map()
  const authorityValue = authority(response)
  const resultRows: AnalysisRow[] = [...byId.entries()].map(([identityKey, pair]) => {
    const accountId = identityKey.slice(identityKey.indexOf("\u0000") + 1)
    const displayRow = pair.platform ?? pair.ka
    const comparison = comparisonById.get(identityKey)?.metrics.cpa
    return {
      workspaceId: displayRow?.workspaceId ?? null, media: pair.media, accountId, accountName: displayRow?.accountName ?? "脱敏账户", owner: displayRow?.ownerUserId ?? "未提供",
      kaData: pair.ka ? canonicalSourceMetrics(pair.ka) : missingSource(), platform: pair.platform ? canonicalSourceMetrics(pair.platform) : missingSource(),
      assessmentCpa: backendMetric(displayRow?.metrics.assessmentPrice, "money"),
      comparison: comparison ? { comparable: comparison.comparable, reason: comparison.reason ?? null, delta: backendMetric(comparison.delta, "money"), deltaRate: backendMetric(comparison.deltaRate, "percent") } : { comparable: false, reason: mode === "reconcile" ? response.data.mode === "reconcile" ? response.data.comparison.reason ?? "后端未提供可比结果" : "后端未提供可比结果" : "单源视图不生成差异", delta: metric(undefined, undefined), deltaRate: metric(undefined, undefined) },
      authorityByMetric: { spend: authorityValue, conversions: authorityValue, cpa: authorityValue, assessmentCpa: { defaultSource: "source_versioned", status: "versioned", reason: "考核价按后端来源版本展示" } },
      status: displayRow?.dataAnomaly === true ? "critical" : displayRow?.dataAnomaly === false ? "healthy" : "unavailable",
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
  mode = responses.summary.data.mode
  if (responses.trend.data.mode !== mode || responses.anomalies.data.mode !== mode) return { ...envelopeMeta(contractDrift("Workbench source modes do not match"), mode, isMock), data: base }
  const summarySource = sourceFor(responses.summary, mode === "reconcile" ? "platform" : mode)
  const trendSource = sourceFor(responses.trend, mode === "reconcile" ? "platform" : mode)
  const summary = rows(summarySource)[0]
  const trendRows = rows(trendSource)
  const anomalySource = sourceFor(responses.anomalies, mode === "reconcile" ? "platform" : mode)
  const canonicalSummary = accountSummaryRowSchema.safeParse(summary)
  const canonicalTrend = accountTrendRowSchema.array().safeParse(trendRows)
  const canonicalAnomalies = accountDailyRowSchema.array().safeParse(rows(anomalySource))
  if (!canonicalSummary.success || !canonicalTrend.success || !canonicalAnomalies.success) return { ...envelopeMeta(contractDrift("Workbench rows failed the strict canonical contract"), mode, isMock), data: base }
  const summaryMetrics = canonicalSummary.data.metrics
  const anomalyItems = canonicalAnomalies.data.map((row) => ({ id: `${row.media}-${row.accountId}-${row.ds}`, findingId: null, media: row.media, accountId: row.accountId, accountName: row.accountName ?? "脱敏账户", title: "数据异常待核查", severity: "warning" as const, evidence: `dataAnomaly=true · ${row.ds}`, attribution: "待工作项详情接口返回诊断归因", suggestedAction: "保持只读，并从账户详情核查指标与来源", cta: "查看账户" }))
  const summaryRealCpa = finiteRatioValue(summaryMetrics.ratios.realCpa)
  const canonicalMetrics = [{ key: "spend", label: "今日消耗", value: backendMetric(summaryMetrics.cost, "money").displayValue, delta: null, tone: "neutral" as const }, { key: "cpa", label: "真实 CPA", value: summaryRealCpa === undefined ? "−" : money.format(summaryRealCpa), delta: null, tone: "neutral" as const }, { key: "compliance", label: "达标率", value: "−", delta: null, tone: "neutral" as const }, { key: "cost_space", label: "成本空间", value: backendMetric(summaryMetrics.costSpace, "money").displayValue, delta: null, tone: "neutral" as const }, { key: "bi_volume", label: "BI 量级", value: backendMetric(summaryMetrics.realConversion, "number").displayValue, delta: null, tone: "neutral" as const }, { key: "risk", label: "待处理", value: canonicalSummary.data.anomalyRows === null ? "−" : number.format(canonicalSummary.data.anomalyRows), delta: null, tone: "critical" as const }]
  const canonicalTrendData = canonicalTrend.data.map((row) => ({ label: row.ds, spend: row.metrics.cost.value, realCpa: finiteRatioValue(row.metrics.ratios.realCpa) ?? null }))
  const data = workbenchSchema.parse({ ...base, greeting: "早上好，KA 经营团队", scopeLabel: isMock ? "脱敏 Mock 数据" : "内网数据", metrics: canonicalMetrics, anomalies: anomalyItems, accountCoverage: `${canonicalSummary.data.accountCount} 个账户`, trend: canonicalTrendData, alerts: [{ level: "P0", label: "高优先级异常", value: canonicalSummary.data.anomalyRows === null ? "−" : String(canonicalSummary.data.anomalyRows), detail: "数量由异常查询返回" }], healthyAccountMessage: "未返回的账户不自动判定健康" })
  return { ...envelopeMeta(responses.summary, mode, isMock, forcedState), data }
}

export function adaptAccountDetail(response: DataQueryResponse, mode: DataViewMode, isMock: boolean, accountId: string, forcedState?: DataState): DataResponse<AccountDetailData> {
  if (response.ok) mode = response.data.mode
  const source = sourceFor(response, mode === "reconcile" ? "platform" : mode); const sourceRows = rows(source)
  const canonicalBatch = accountDailyRowSchema.array().safeParse(sourceRows)
  if (!canonicalBatch.success) return { ...envelopeMeta(contractDrift("Account detail rows failed the strict canonical contract"), mode, isMock), data: accountDetailSchema.parse({ media: "UNKNOWN", accountId, accountName: "脱敏账户", owner: "未提供", status: "unavailable", metrics: [], trend: [], currentFindingId: null, currentFindingTitle: null }) }
  const canonicalRows = canonicalBatch.data
  const canonical = canonicalRows[0]
  const realCpa = finiteRatioValue(canonical?.metrics.ratios.realCpa)
  const data = accountDetailSchema.parse({ media: canonical?.media ?? "UNKNOWN", accountId, accountName: canonical?.accountName ?? "脱敏账户", owner: canonical?.ownerUserId ?? "未提供", status: canonical?.dataAnomaly === true ? "critical" : canonical?.dataAnomaly === false ? "healthy" : "unavailable", metrics: [{ key: "spend", label: "消耗", value: backendMetric(canonical?.metrics.cost, "money").displayValue, delta: null, tone: "neutral" }, { key: "cpa", label: "真实 CPA", value: realCpa === undefined ? "−" : money.format(realCpa), delta: canonical?.metrics.assessmentPrice.value === null || canonical?.metrics.assessmentPrice === undefined ? null : money.format(canonical.metrics.assessmentPrice.value), tone: "neutral" }], trend: canonicalRows.map((item) => ({ label: item.ds, cpa: finiteRatioValue(item.metrics.ratios.realCpa) ?? null, assessmentCpa: item.metrics.assessmentPrice.value })), currentFindingId: null, currentFindingTitle: null })
  return { ...envelopeMeta(response, mode, isMock, forcedState), data }
}

export function adaptWorkItemDetail(response: WorkItemDetailResponse | null, findingId: string, loading: boolean, isMock = false): DataResponse<FindingDetailData> {
  const empty = findingDetailSchema.parse({ findingId, media: null, accountId: "unknown", accountName: "脱敏账户", title: "诊断详情暂不可用", severity: "warning", deterministicConclusion: "只读工作项详情接口尚未返回确定性结论。", evidence: [], aiInterpretation: null, aiConfidence: null, changeSetId: null })
  if (loading || response === null) return { state: "loading", lineage: placeholderLineage("platform"), data: empty, message: "正在读取工作项详情", isMock }
  if (!response.ok) {
    // 原来 NOT_FOUND 要洗成 SOURCE_UNAVAILABLE 才过共享枚举，「这条不存在」被显成「来源不可用」；
    // F8-14 并进枚举后原样传下去，errorState 把它落到空态。
    const error = stableDataQueryErrorSchema.parse(response.error)
    return { state: errorState(error), lineage: placeholderLineage("platform", error), data: empty, message: resolveErrorMessage(error.code, error.message), error, isMock }
  }
  const workItem = response.data.workItem
  const severity = workItem.severity === "P0" ? "critical" : workItem.severity === "P2" || workItem.severity === "opportunity" ? "info" : "warning"
  const evidence = Object.entries(workItem.evidenceSnapshot ?? {}).map(([label, value]) => ({ label, value: typeof value === "string" ? value : JSON.stringify(value), source: `workItem.evidenceSnapshot.${label}` }))
  const deterministicConclusion = workItem.diagnosis === null ? "只读工作项未提供结构化诊断。" : JSON.stringify(workItem.diagnosis)
  const data = findingDetailSchema.parse({ findingId: workItem.id, media: workItem.media, accountId: workItem.accountId, accountName: "脱敏账户", title: workItem.title, severity, deterministicConclusion, evidence, aiInterpretation: null, aiConfidence: null, changeSetId: null })
  return { state: "ready", lineage: placeholderLineage("platform"), data, isMock }
}

export function adaptChangeSetPreview(response: ChangeSetDetailResponse | null): ChangeSetPreviewData | null {
  if (response === null || !response.ok || response.data.changeset.ttlExpireAt === null) return null
  const changeSet = response.data.changeset
  return changeSetPreviewSchema.parse({
    changeSetId: changeSet.id,
    accountId: changeSet.accountId,
    accountName: "脱敏账户",
    status: "preview_only",
    expiresAt: changeSet.ttlExpireAt,
    items: changeSet.items.map((item) => ({ field: item.field, from: formatChangeValue(item.fromValue), to: formatChangeValue(item.toValue), reason: item.failReason ?? changeSet.reasonCode ?? "只读变更预览" })),
    riskChecks: [{ label: "媒体写端点", passed: false, detail: "当前只读集成未注册执行入口" }],
    executionEndpointConfigured: false,
  })
}
