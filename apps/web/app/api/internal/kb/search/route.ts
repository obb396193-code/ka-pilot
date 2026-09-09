import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleKbSearch } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Q-030：知识库搜索（非 LLM）。中文靠子串，装了 pg_trgm 才有 similarity 分数
export async function GET(request: Request) {
  return internalJsonResponse(await handleKbSearch(request, { environment: process.env }))
}
