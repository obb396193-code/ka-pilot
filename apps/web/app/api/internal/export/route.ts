import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleExportCreate } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return internalJsonResponse(await handleExportCreate(request, { environment: process.env }))
}
