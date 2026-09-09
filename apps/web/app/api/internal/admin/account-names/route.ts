import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminAccountNames } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// F8-9 归属清洗：清洗列表（契约 v1.8 GET /api/v1/admin/account-names?media=&status=&q=&page=）
export async function GET(request: Request) {
  return internalJsonResponse(await handleAdminAccountNames(request, { environment: process.env }))
}
