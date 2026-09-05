"use client"

import { useMemo, useState } from "react"

import { AccountsTable } from "@/components/business/accounts/accounts-table"
import { PageBody, PageHeader } from "@/components/business/page-header"

import { AccountDetailView } from "@/components/business/account-detail-view"
import { useSession } from "@/components/business/session/session-provider"
import { DiagnosticDetailView } from "@/components/business/diagnostic-detail-view"
import { WorkbenchDashboard } from "@/components/business/workbench/workbench-dashboard"
import { DataStateFrame } from "@/components/data-view/data-state-frame"
import { adaptAccountDetail, adaptAnalysis, adaptChangeSetPreview, adaptWorkbench, adaptWorkItemDetail } from "@/lib/data/adapters"
import type { DataQueryResponse, QueryRequest } from "@/lib/data/contracts"
import { readDataState, shanghaiBusinessDate, type DataState, type DataViewMode, type QueryRecord } from "@/lib/data/data-view"
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
  return { date: shanghaiBusinessDate(), ...(first(query.media) ? { media: first(query.media) } : {}) }
}
function loadingResponse(): DataQueryResponse { return { ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "正在读取数据", retryable: true, requestId: "loading" } } }
function mockState(query: QueryRecord): DataState { return readDataState(query.state) }
function request(queryId: QueryRequest["queryId"], dataView: DataViewMode, query: QueryRecord, extra: Record<string, unknown> = {}): QueryRequest {
  const state = mockState(query)
  return { queryId, dataView, params: { ...dateParams(query), ...extra }, ...(state === "ready" ? {} : { mockState: state }) }
}

// 工作台：数据源由服务端按空间路由（DATA-ROUTE-001 v1.2），浏览器固定发 platform。
// mock 模式下按当前空间模拟这条路由（team→ka_data），让「切空间即切源」在本地可见；真实模式不由浏览器选源。
function WorkbenchQueries({ query, onRefresh }: { query: QueryRecord; onRefresh: () => void }) {
  const { session, isMock } = useSession()
  const dataView: DataViewMode = isMock && session?.activeWorkspace.kind === "team" ? "ka_data" : "platform"
  const summaryRequest = useMemo(() => request("account.summary", dataView, query), [dataView, query])
  const trendRequest = useMemo(() => request("account.trend", dataView, query), [dataView, query])
  const anomaliesRequest = useMemo(() => request("account.anomalies", "platform", query), [query])
  const summary = useDataQuery(summaryRequest); const trend = useDataQuery(trendRequest); const anomalies = useDataQuery(anomaliesRequest)
  const loading = summary.loading || trend.loading || anomalies.loading
  const response = adaptWorkbench({ summary: summary.response ?? loadingResponse(), trend: trend.response ?? loadingResponse(), anomalies: anomalies.response ?? loadingResponse() }, dataView, summary.isMock, loading ? "loading" : undefined)
  return <WorkbenchDashboard response={response} query={query} onRefresh={onRefresh} />
}

export function WorkbenchContainer({ query }: { query: QueryRecord }) {
  const [reload, setReload] = useState(0)
  return <WorkbenchQueries key={reload} query={query} onRefresh={() => setReload((value) => value + 1)} />
}

// 数据源由服务端按空间路由；mock 下按当前空间模拟（team→ka_data）
function useRoutedDataView(): DataViewMode {
  const { session, isMock } = useSession()
  return isMock && session?.activeWorkspace.kind === "team" ? "ka_data" : "platform"
}

// 账户池：account.table → 母版 DataTable 壳 + 账户小传抽屉
export function AccountsContainer({ query }: { query: QueryRecord }) {
  const dataView = useRoutedDataView()
  const queryRequest = useMemo(() => request("account.table", dataView, query, { page: 1, pageSize: 100 }), [dataView, query])
  const result = useDataQuery(queryRequest)
  const response = adaptAnalysis(result.response ?? loadingResponse(), dataView, result.isMock, result.loading ? "loading" : undefined)
  return (
    <PageBody>
      <PageHeader title="账户池" description="全量账户按生命周期分层；缺失值显 −，不用 0 或达标替代" isMock={result.isMock} />
      <DataStateFrame response={response} lineage="inline">
        <div className="px-4 lg:px-6"><AccountsTable rows={response.data.rows} dataView={dataView} isMock={result.isMock} initialView={(["tiles", "pipeline", "kanban"] as const).find((item) => item === (Array.isArray(query.view) ? query.view[0] : query.view)) ?? "tiles"} /></div>
      </DataStateFrame>
    </PageBody>
  )
}



export function AccountDetailContainer({ accountId, query }: { accountId: string; query: QueryRecord }) {
  const dataView = useRoutedDataView()
  const queryRequest = useMemo(() => request("account.detail", dataView, query, { accountId }), [accountId, dataView, query])
  const result = useDataQuery(queryRequest)
  const response = adaptAccountDetail(result.response ?? loadingResponse(), dataView, result.isMock, accountId, result.loading ? "loading" : undefined)
  return <AccountDetailView response={response} />
}

function MockDiagnosticDetailContainer({ findingId }: { findingId: string }) {
  const workItem = getMockWorkItemDetail(findingId)
  const changeSet = getMockChangeSetDetail()
  const response = adaptWorkItemDetail(workItem, findingId, false, true)
  const preview = adaptChangeSetPreview(changeSet)
  return <DiagnosticDetailView response={response} preview={preview} />
}

function InternalDiagnosticDetailContainer({ findingId }: { findingId: string }) {
  const workItem = useReadModel("work-items", findingId)
  const changeSetId = null
  const changeSet = useReadModel("changesets", changeSetId)
  const response = adaptWorkItemDetail(workItem.response, findingId, workItem.loading)
  const preview = adaptChangeSetPreview(changeSet.response)
  return <DiagnosticDetailView response={response} preview={preview} />
}

export function DiagnosticDetailContainer({ findingId }: { findingId: string; query: QueryRecord }) {
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  return isMock ? <MockDiagnosticDetailContainer findingId={findingId} /> : <InternalDiagnosticDetailContainer findingId={findingId} />
}
