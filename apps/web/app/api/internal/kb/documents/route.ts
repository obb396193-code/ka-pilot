import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleKbDocuments } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Q-030：知识库树/列表与新建，透传到 data-api /api/v1/kb/documents（契约 v1.4 8.x）
export async function GET(request: Request) {
  return internalJsonResponse(await handleKbDocuments(request, { environment: process.env }))
}

export async function POST(request: Request) {
  return internalJsonResponse(await handleKbDocuments(request, { environment: process.env }))
}
