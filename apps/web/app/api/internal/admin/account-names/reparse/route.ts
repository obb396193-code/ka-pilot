import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminAccountNamesReparse } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// 归属清洗批量重解析（v1.8）：人工改过的段不被覆盖
export async function POST(request: Request) {
  return internalJsonResponse(await handleAdminAccountNamesReparse(request, { environment: process.env }))
}
