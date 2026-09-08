import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAccountListRequest } from "@/lib/data/r014/account-list-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return internalJsonResponse(await handleAccountListRequest(request, { environment: process.env }))
}
