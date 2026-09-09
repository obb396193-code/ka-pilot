import { permanentRedirect } from "next/navigation"

// 旧路径保留：F8-4 已把工作项详情正名为 /work-items/[id]，这里 301 过去，老链接不断
export default async function DiagnosticRedirect({ params }: { params: Promise<{ findingId: string }> }) {
  const { findingId } = await params
  permanentRedirect(`/work-items/${encodeURIComponent(findingId)}`)
}
