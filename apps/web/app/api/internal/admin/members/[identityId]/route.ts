import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminMemberPatch } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// v1.9.46 ① 改角色 / 停用（PATCH /api/v1/admin/members/:identityId）：身份级，停用即撤该身份全部会话
export async function PATCH(request: Request, { params }: { params: Promise<{ identityId: string }> }) {
  const { identityId } = await params
  return internalJsonResponse(await handleAdminMemberPatch(request, identityId, { environment: process.env }))
}
