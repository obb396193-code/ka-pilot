import { Suspense } from "react"

import { KnowledgePage } from "@/components/business/knowledge/knowledge-page"

export default function KnowledgeRoute() {
  return <Suspense fallback={null}><KnowledgePage /></Suspense>
}
