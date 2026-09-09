import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAccountTransfer } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Q-030：账户交接（v1.5 4.10）。部分成功仍 200，没动的在 skipped 里逐条列出
export async function POST(request: Request) {
  return internalJsonResponse(await handleAccountTransfer(request, { environment: process.env }))
}
