import { Suspense } from "react"

import { RunDetailPage } from "@/components/business/automation/run-detail-page"

export default async function RunDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Suspense fallback={null}><RunDetailPage runId={decodeURIComponent(id)} /></Suspense>
}
