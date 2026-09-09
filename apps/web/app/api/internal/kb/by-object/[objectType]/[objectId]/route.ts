import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleKbByObject } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Q-030：8.4 反查二——某个业务对象关联了哪些文档；无关联回 items:[] 而不是 404
export async function GET(
  request: Request, { params }: { params: Promise<{ objectType: string; objectId: string }> },
) {
  const resolved = await params
  return internalJsonResponse(
    await handleKbByObject(request, resolved.objectType, resolved.objectId, { environment: process.env }),
  )
}
