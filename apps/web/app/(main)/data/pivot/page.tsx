import { DataTableContainer } from "@/components/business/data-containers"
import type { QueryRecord } from "@/lib/data/data-view"

export default async function DataPivotPage({ searchParams }: { searchParams: Promise<QueryRecord> }) {
  const query = await searchParams
  return <DataTableContainer query={query} pivot />
}
