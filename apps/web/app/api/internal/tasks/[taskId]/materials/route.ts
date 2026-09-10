import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleTaskDeferredTab } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 契约明写一期 501：透传下去让前端拿到 501 而不是 404，「不做」和「路径错」要分得开
export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const resolved = await params
  return internalJsonResponse(
    await handleTaskDeferredTab(request, resolved.taskId, "materials", { environment: process.env }),
  )
}
