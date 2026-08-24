import { DiagnosticDetailContainer } from "@/components/business/data-containers"
import type { QueryRecord } from "@/lib/data/data-view"

export default async function DiagnosticDetailPage({ params, searchParams }: { params: Promise<{ findingId: string }>; searchParams: Promise<QueryRecord> }) {
  const [{ findingId }, query] = await Promise.all([params, searchParams])
  return <DiagnosticDetailContainer findingId={findingId} query={query} />
}
