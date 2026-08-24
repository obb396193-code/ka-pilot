import { AnalysisTable } from "@/components/data-view/analysis-table"
import { DataStateFrame } from "@/components/data-view/data-state-frame"
import { DataViewSwitcher } from "@/components/data-view/data-view-switcher"
import { PageShell } from "@/components/data-view/page-shell"
import { Badge } from "@/components/ui/badge"
import { queryData } from "@/lib/data/client"
import { readDataState, readDataViewMode, type QueryRecord } from "@/lib/data/data-view"

export default async function DataPage({ searchParams }: { searchParams: Promise<QueryRecord> }) {
  const query = await searchParams
  const dataView = readDataViewMode(query.data_view)
  const response = await queryData({ queryId: "analysis", dataView, state: readDataState(query.state), params: { accountId: typeof query.account_id === "string" ? query.account_id : "" } })
  return (
    <PageShell eyebrow="KA Pilot · 数据分析" title="账户经营数据" description="KA Data、自建平台和双源对账使用同一页面。CPA、差异、差异率与默认来源均由 domain/API 提供。" actions={<Badge variant="secondary">只读</Badge>}>
      <DataViewSwitcher pathname="/data" current={dataView} query={query} />
      <DataStateFrame response={response}><AnalysisTable data={response.data} dataView={dataView} /></DataStateFrame>
    </PageShell>
  )
}
