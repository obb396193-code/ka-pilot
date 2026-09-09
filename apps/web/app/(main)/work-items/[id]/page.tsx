import { DiagnosticDetailContainer } from "@/components/business/data-containers"
import type { QueryRecord } from "@/lib/data/data-view"

// 工作项详情正名（F8-4）：旧路径 /diagnostics/[findingId] 保留跳转，站内链接一律用这里
export default async function WorkItemDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<QueryRecord> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  return <DiagnosticDetailContainer findingId={id} query={query} />
}
