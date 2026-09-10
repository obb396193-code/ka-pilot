import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleTaskTimeline } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 任务详情八页签之一（契约 v1.5 任务域）
export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const resolved = await params
  return internalJsonResponse(
    await handleTaskTimeline(request, resolved.taskId, { environment: process.env }),
  )
}
