import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleImpactEstimate } from "@/lib/data/deferred-actions-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PUT(request: Request) {
  return internalJsonResponse(await handleImpactEstimate(request, { environment: process.env }))
}
