import { AnalysisContainer } from "@/components/business/data-containers"
import { readDataViewMode, type QueryRecord } from "@/lib/data/data-view"

export default async function DataPage({ searchParams }: { searchParams: Promise<QueryRecord> }) {
  const query = await searchParams
  return <AnalysisContainer pathname="/data" dataView={readDataViewMode(query.data_view)} query={query} />
}
