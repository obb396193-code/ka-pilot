import { Suspense } from "react"

import { WorkflowCanvasPage } from "@/components/business/automation/workflow-canvas"

// 工作流画布（workflow-graph/v1）；id=new 为空白
export default async function WorkflowCanvasRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Suspense fallback={null}><WorkflowCanvasPage definitionId={decodeURIComponent(id)} /></Suspense>
}
