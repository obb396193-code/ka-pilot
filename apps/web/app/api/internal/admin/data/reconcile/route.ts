import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminReconcile } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// F8-15 ②：对账诊断（治理后台·诊断）。需后端 DATA_DIAGNOSTIC_ENABLED 且命中授权名单；
// 没开时后端回 422 VIEW_UNSUPPORTED——诊断不是 role=admin 的隐含能力
export async function POST(request: Request) {
  return internalJsonResponse(await handleAdminReconcile(request, { environment: process.env }))
}
