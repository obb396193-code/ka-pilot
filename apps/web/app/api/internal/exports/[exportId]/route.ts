import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleExportDetail } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ exportId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleExportDetail(request, resolved.exportId, { environment: process.env }))
}
