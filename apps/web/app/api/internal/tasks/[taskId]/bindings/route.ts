import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleTaskBindings } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleTaskBindings(request, resolved.taskId, { environment: process.env }))
}
