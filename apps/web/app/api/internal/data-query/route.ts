import { handleDataQueryRequest } from "@/lib/data/bff"
import { internalJsonResponse } from "@/lib/data/internal-api-bff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return internalJsonResponse(await handleDataQueryRequest(request, { environment: process.env }))
}
