import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminMembersRequest } from "@/lib/data/admin-members-server"
import { handleAdminMemberCreate } from "@/lib/data/r014/routes-server"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  return internalJsonResponse(await handleAdminMembersRequest(request, { environment: process.env }))
}

// F8-11 新增成员（契约 v1.9.5 POST /api/v1/admin/members）：
// provider=internal_test 时后端建密码并在响应里回一次性 initialPassword，之后任何接口不再返回
export async function POST(request: Request) {
  return internalJsonResponse(await handleAdminMemberCreate(request, { environment: process.env }))
}
