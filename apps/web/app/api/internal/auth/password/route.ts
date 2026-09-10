import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAuthPassword } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Q-030：自助改密（v1.7.6 + G11）。当前密码错回 401 INVALID_CREDENTIALS「当前密码不正确」
export async function POST(request: Request) {
  return internalJsonResponse(await handleAuthPassword(request, { environment: process.env }))
}
