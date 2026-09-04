import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleReadModelRequest } from "@/lib/data/read-model-bff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return internalJsonResponse(await handleReadModelRequest("changesets", id, request, { environment: process.env }))
}
