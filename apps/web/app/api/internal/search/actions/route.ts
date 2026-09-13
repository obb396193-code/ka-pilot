import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleSearchAction } from "@/lib/data/deferred-actions-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return internalJsonResponse(await handleSearchAction(request, { environment: process.env }))
}
