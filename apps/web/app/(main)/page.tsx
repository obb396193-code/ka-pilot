import { WorkbenchContainer } from "@/components/business/data-containers"
import { readDataViewMode, type QueryRecord } from "@/lib/data/data-view"

export default async function WorkbenchPage({ searchParams }: { searchParams: Promise<QueryRecord> }) {
  const query = await searchParams
  return <WorkbenchContainer dataView={readDataViewMode(query.data_view)} query={query} />
}
