import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminMembersRequest } from "@/lib/data/admin-members-server"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ identityId: string }> }) {
  return internalJsonResponse(await handleAdminMembersRequest(request, { environment: process.env }, (await context.params).identityId))
}
