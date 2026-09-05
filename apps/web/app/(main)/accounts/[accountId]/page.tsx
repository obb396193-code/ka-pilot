import { AccountDetailContainer } from "@/components/business/data-containers"
import type { QueryRecord } from "@/lib/data/data-view"

export default async function AccountDetailPage({ params, searchParams }: { params: Promise<{ accountId: string }>; searchParams: Promise<QueryRecord> }) {
  const [{ accountId }, query] = await Promise.all([params, searchParams])
  return <AccountDetailContainer accountId={accountId} query={query} />
}
