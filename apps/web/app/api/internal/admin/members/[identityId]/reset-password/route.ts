import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminMemberResetPassword } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// F8-11 重置密码（契约 v1.9.5 POST /api/v1/admin/members/:identityId/reset-password）：
// 新初始密码只回一次，同时吊销该身份全部 session（本人会被踢下线）
export async function POST(request: Request, { params }: { params: Promise<{ identityId: string }> }) {
  const { identityId } = await params
  return internalJsonResponse(await handleAdminMemberResetPassword(request, identityId, { environment: process.env }))
}
