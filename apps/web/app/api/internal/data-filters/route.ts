import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleDataFilters } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// F8-27 筛选栏（契约 v1.9.29 `GET /api/v1/data/filters`，be2 Q-041 ①）。
// handler 早在 main，只是一直没有浏览器侧路由——所以前端「从未接」。
export async function GET(request: Request) {
  return internalJsonResponse(await handleDataFilters(request, { environment: process.env }))
}
