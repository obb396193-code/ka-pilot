import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminNamingRules } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// F8-9 归属清洗：规范模板读写（契约 v1.8 GET/PUT /api/v1/admin/naming-rules?media=）
export async function GET(request: Request) {
  return internalJsonResponse(await handleAdminNamingRules(request, { environment: process.env }))
}

export async function PUT(request: Request) {
  return internalJsonResponse(await handleAdminNamingRules(request, { environment: process.env }))
}
