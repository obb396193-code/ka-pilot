import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleEtlRunRerun } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// F8-15 ⑦ 重跑拉数（契约 v1.9.19）：成功 202 排队；同源已有排队/运行中的 → 409 CONFLICT 带 details.jobId
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  return internalJsonResponse(await handleEtlRunRerun(request, runId, { environment: process.env }))
}
