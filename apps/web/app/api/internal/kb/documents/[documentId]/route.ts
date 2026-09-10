import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleKbDocument } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Q-030：单篇读 / 编辑 / 软删（DELETE 只置位，行与修订历史都留着）
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleKbDocument(request, resolved.documentId, { environment: process.env }))
}

export async function PATCH(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleKbDocument(request, resolved.documentId, { environment: process.env }))
}

export async function DELETE(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleKbDocument(request, resolved.documentId, { environment: process.env }))
}
