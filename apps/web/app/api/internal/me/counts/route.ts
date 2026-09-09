import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleMeCounts } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return internalJsonResponse(await handleMeCounts(request, { environment: process.env }))
}
