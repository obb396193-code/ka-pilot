import { Suspense } from "react"

import { KnowledgePage } from "@/components/business/knowledge/knowledge-page"

// /knowledge/[id]：同一页面，初始选中该文档（视图收敛：树 + 正文不分家）
export default async function KnowledgeDocRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Suspense fallback={null}><KnowledgePage initialId={decodeURIComponent(id)} /></Suspense>
}
