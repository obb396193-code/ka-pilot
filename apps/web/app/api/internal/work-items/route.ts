import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleWorkItemListRequest } from "@/lib/data/work-item-list-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return internalJsonResponse(await handleWorkItemListRequest(request, { environment: process.env }))
}
