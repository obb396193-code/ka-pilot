import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleMeView } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(request: Request, { params }: { params: Promise<{ viewId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleMeView(request, resolved.viewId, { environment: process.env }))
}

export async function DELETE(request: Request, { params }: { params: Promise<{ viewId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleMeView(request, resolved.viewId, { environment: process.env }))
}
