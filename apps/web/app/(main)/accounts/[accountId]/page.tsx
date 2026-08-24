import { AccountDetailContainer } from "@/components/business/data-containers"
import { readDataViewMode, type QueryRecord } from "@/lib/data/data-view"

export default async function AccountDetailPage({ params, searchParams }: { params: Promise<{ accountId: string }>; searchParams: Promise<QueryRecord> }) {
  const [{ accountId }, query] = await Promise.all([params, searchParams])
  return <AccountDetailContainer accountId={accountId} dataView={readDataViewMode(query.data_view)} query={query} />
}
