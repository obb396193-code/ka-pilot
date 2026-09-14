import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminMembersRequest } from "@/lib/data/admin-members-server"
import { handleAdminMemberGrantsReplace } from "@/lib/data/r014/routes-server"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ identityId: string }> }) {
  return internalJsonResponse(await handleAdminMembersRequest(request, { environment: process.env }, (await context.params).identityId))
}

// v1.9.46 ① 整体替换授权（PUT /api/v1/admin/members/:identityId/grants）：作用于该身份的 active personal 空间
export async function PUT(request: Request, context: { params: Promise<{ identityId: string }> }) {
  return internalJsonResponse(await handleAdminMemberGrantsReplace(request, (await context.params).identityId, { environment: process.env }))
}
