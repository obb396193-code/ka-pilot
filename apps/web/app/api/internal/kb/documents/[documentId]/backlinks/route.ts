import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleKbBacklinks } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Q-030：8.4 反查一——谁引用了这篇文档
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleKbBacklinks(request, resolved.documentId, { environment: process.env }))
}
