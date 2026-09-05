import { DashboardContainer } from "@/components/business/data-containers"
import type { QueryRecord } from "@/lib/data/data-view"

export default async function DataDashboardPage({ searchParams }: { searchParams: Promise<QueryRecord> }) {
  const query = await searchParams
  return <DashboardContainer query={query} />
}
