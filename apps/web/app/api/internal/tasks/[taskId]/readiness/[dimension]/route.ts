import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleTaskReadiness } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PUT(request: Request, { params }: { params: Promise<{ taskId: string; dimension: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleTaskReadiness(request, resolved.taskId, resolved.dimension, { environment: process.env }))
}
