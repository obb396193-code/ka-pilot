import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleTaskDetail } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// F8-8：任务详情总览透传到 data-api GET /api/v1/tasks/:id（契约 v1.5.1 ②）
export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleTaskDetail(request, resolved.taskId, { environment: process.env }))
}
