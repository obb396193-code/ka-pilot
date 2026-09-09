import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminMembersRequest } from "@/lib/data/admin-members-server"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  return internalJsonResponse(await handleAdminMembersRequest(request, { environment: process.env }))
}
