import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleTaskReviewLatest } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// v1.9.19：最近一次复盘，一期 501
export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleTaskReviewLatest(request, resolved.taskId, { environment: process.env }))
}
