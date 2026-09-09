import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminAccountNamesConfirm } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 归属清洗批量确认（v1.8）：只放行 parsed，conflict/failed 必须人工看
export async function POST(request: Request) {
  return internalJsonResponse(await handleAdminAccountNamesConfirm(request, { environment: process.env }))
}
