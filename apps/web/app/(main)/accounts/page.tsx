import { AnalysisTable } from "@/components/data-view/analysis-table"
import { DataStateFrame } from "@/components/data-view/data-state-frame"
import { DataViewSwitcher } from "@/components/data-view/data-view-switcher"
import { PageShell } from "@/components/data-view/page-shell"
import { Badge } from "@/components/ui/badge"
import { queryData } from "@/lib/data/client"
import { readDataState, readDataViewMode, type QueryRecord } from "@/lib/data/data-view"

export default async function AccountsPage({ searchParams }: { searchParams: Promise<QueryRecord> }) {
  const query = await searchParams
  const dataView = readDataViewMode(query.data_view)
  const response = await queryData({ queryId: "analysis", dataView, state: readDataState(query.state) })
  return (
    <PageShell eyebrow="KA Pilot · 账户池" title="账户池" description="快手优化师的账户经营入口；数据缺失时显示不可用，不使用 0 或达标替代。" actions={<Badge variant="outline">AAC 拉新</Badge>}>
      <DataViewSwitcher pathname="/accounts" current={dataView} query={query} />
      <DataStateFrame response={response}><AnalysisTable data={response.data} dataView={dataView} /></DataStateFrame>
    </PageShell>
  )
}
