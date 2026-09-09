import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminNamingRulesTest } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// F8-9 归属清洗：改规范前先干跑（契约 v1.8 POST /api/v1/admin/naming-rules/test），只算不写库
export async function POST(request: Request) {
  return internalJsonResponse(await handleAdminNamingRulesTest(request, { environment: process.env }))
}
