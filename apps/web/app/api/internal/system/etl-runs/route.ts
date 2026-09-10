import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleEtlRuns } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// F8-15 ①：拉数记录（契约 v1.9.12 分页形）。一行 = 一次 attempt，不做 job 聚合
export async function GET(request: Request) {
  return internalJsonResponse(await handleEtlRuns(request, { environment: process.env }))
}
