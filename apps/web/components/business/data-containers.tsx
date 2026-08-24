"use client"

import { useMemo } from "react"

import { AccountDetailView } from "@/components/business/account-detail-view"
import { DiagnosticDetailView } from "@/components/business/diagnostic-detail-view"
import { WorkbenchDashboard } from "@/components/business/workbench/workbench-dashboard"
import { AnalysisTable } from "@/components/data-view/analysis-table"
import { DataStateFrame } from "@/components/data-view/data-state-frame"
import { DataViewSwitcher } from "@/components/data-view/data-view-switcher"
import { PageShell } from "@/components/data-view/page-shell"
import { Badge } from "@/components/ui/badge"
import { adaptAccountDetail, adaptAnalysis, adaptWorkbench, adaptWorkItemDetail } from "@/lib/data/adapters"
import type { DataQueryResponse, QueryRequest } from "@/lib/data/contracts"
import { readDataState, type DataState, type DataViewMode, type QueryRecord } from "@/lib/data/data-view"
import { getMockChangeSetDetail, getMockWorkItemDetail } from "@/lib/data/mock-data"
import { useDataQuery } from "@/lib/data/use-data-query"
import { useReadModel } from "@/lib/data/use-read-model"

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }
function dateParams(query: QueryRecord) {
  const date = first(query.date)
  if (date) return { date, ...(first(query.media) ? { media: first(query.media) } : {}) }
  const dateFrom = first(query.date_from) ?? first(query.start)
  const dateTo = first(query.date_to) ?? first(query.end)
  if (dateFrom && dateTo) return { dateFrom, dateTo, ...(first(query.media) ? { media: first(query.media) } : {}) }
  return { date: "2026-08-24", ...(first(query.media) ? { media: first(query.media) } : {}) }
}
function loadingResponse(): DataQueryResponse { return { ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "正在读取数据", retryable: true, requestId: "loading" } } }
function mockState(query: QueryRecord): DataState { return readDataState(query.state) }
function request(queryId: QueryRequest["queryId"], dataView: DataViewMode, query: QueryRecord, extra: Record<string, unknown> = {}): QueryRequest {
  const state = mockState(query)
  return { queryId, dataView, params: { ...dateParams(query), ...extra }, ...(state === "ready" ? {} : { mockState: state }) }
}

export function WorkbenchContainer({ dataView, query }: { dataView: DataViewMode; query: QueryRecord }) {
  const summaryRequest = useMemo(() => request("account.summary", dataView, query), [dataView, query])
  const trendRequest = useMemo(() => request("account.trend", dataView, query), [dataView, query])
  const anomaliesRequest = useMemo(() => request("account.anomalies", "platform", query), [query])
  const summary = useDataQuery(summaryRequest); const trend = useDataQuery(trendRequest); const anomalies = useDataQuery(anomaliesRequest)
  const loading = summary.loading || trend.loading || anomalies.loading
  const response = adaptWorkbench({ summary: summary.response ?? loadingResponse(), trend: trend.response ?? loadingResponse(), anomalies: anomalies.response ?? loadingResponse() }, dataView, summary.isMock, loading ? "loading" : undefined)
  return <WorkbenchDashboard response={response} dataView={dataView} query={query} />
}

export function AnalysisContainer({ pathname, dataView, query, accountPool = false }: { pathname: string; dataView: DataViewMode; query: QueryRecord; accountPool?: boolean }) {
  const queryId = dataView === "reconcile" ? "reconcile.account_daily" : "account.table"
  const queryRequest = useMemo(() => request(queryId, dataView, query, { page: 1, pageSize: 50, ...(first(query.account_id) ? { accountIds: [first(query.account_id)] } : {}) }), [queryId, dataView, query])
  const result = useDataQuery(queryRequest)
  const response = adaptAnalysis(result.response ?? loadingResponse(), dataView, result.isMock, result.loading ? "loading" : undefined)
  return (
    <PageShell eyebrow={accountPool ? "KA Pilot · 账户池" : "KA Pilot · 数据分析"} title={accountPool ? "账户池" : "账户经营数据"} description={accountPool ? "快手优化师的账户经营入口；缺失值不使用 0 或达标替代。" : "KA Data、自建平台和双源对账使用同一页面；指标与差异均来自 API。"} actions={<div className="flex gap-2"><Badge variant="outline">{accountPool ? "AAC 拉新" : "只读"}</Badge>{result.isMock ? <Badge variant="secondary">脱敏 Mock</Badge> : null}</div>}>
      <DataViewSwitcher pathname={pathname} current={dataView} query={query} />
      <DataStateFrame response={response}><AnalysisTable data={response.data} dataView={dataView} /></DataStateFrame>
    </PageShell>
  )
}

export function AccountDetailContainer({ accountId, dataView, query }: { accountId: string; dataView: DataViewMode; query: QueryRecord }) {
  const queryRequest = useMemo(() => request("account.detail", dataView, query, { accountId }), [accountId, dataView, query])
  const result = useDataQuery(queryRequest)
  const response = adaptAccountDetail(result.response ?? loadingResponse(), dataView, result.isMock, accountId, result.loading ? "loading" : undefined)
  return <AccountDetailView response={response} dataView={dataView} query={query} />
}

function MockDiagnosticDetailContainer({ findingId }: { findingId: string }) {
  const workItem = getMockWorkItemDetail(findingId)
  const changeSet = getMockChangeSetDetail()
  const response = adaptWorkItemDetail(workItem, findingId, false, true)
  const preview = changeSet.ok ? changeSet.data : null
  return <DiagnosticDetailView response={response} preview={preview} />
}

function InternalDiagnosticDetailContainer({ findingId }: { findingId: string }) {
  const workItem = useReadModel("work-items", findingId)
  const changeSetId = workItem.response?.ok ? workItem.response.data.changeSetId : null
  const changeSet = useReadModel("changesets", changeSetId)
  const response = adaptWorkItemDetail(workItem.response, findingId, workItem.loading)
  const preview = changeSet.response?.ok ? changeSet.response.data : null
  return <DiagnosticDetailView response={response} preview={preview} />
}

export function DiagnosticDetailContainer({ findingId }: { findingId: string; query: QueryRecord }) {
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  return isMock ? <MockDiagnosticDetailContainer findingId={findingId} /> : <InternalDiagnosticDetailContainer findingId={findingId} />
}
