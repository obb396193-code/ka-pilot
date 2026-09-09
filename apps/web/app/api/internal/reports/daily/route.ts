import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleDailyReport } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Q-030：日报（v1.5 1.8）。role 是请求参数，回显的就是它，不是身份角色
export async function GET(request: Request) {
  return internalJsonResponse(await handleDailyReport(request, { environment: process.env }))
}
