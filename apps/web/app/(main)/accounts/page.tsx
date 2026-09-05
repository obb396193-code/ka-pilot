import { AccountsContainer } from "@/components/business/data-containers"
import type { QueryRecord } from "@/lib/data/data-view"

export default async function AccountsPage({ searchParams }: { searchParams: Promise<QueryRecord> }) {
  const query = await searchParams
  return <AccountsContainer query={query} />
}
