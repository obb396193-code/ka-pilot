import { WorkbenchDashboard } from "@/components/business/workbench/workbench-dashboard"
import { queryData } from "@/lib/data/client"
import { readDataState, readDataViewMode, type QueryRecord } from "@/lib/data/data-view"

export default async function WorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<QueryRecord>
}) {
  const query = await searchParams
  const dataView = readDataViewMode(query.data_view)
  const state = readDataState(query.state)
  const response = await queryData({
    queryId: "workbench",
    dataView,
    state,
    params: {
      start: Array.isArray(query.start) ? query.start[0] ?? "" : query.start ?? "",
      end: Array.isArray(query.end) ? query.end[0] ?? "" : query.end ?? "",
    },
  })

  return <WorkbenchDashboard response={response} dataView={dataView} query={query} />
}
