import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAssessmentPrice } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// v1.9.19：改考核价。一期「重算」= 派生指标读时按新价算，不跑批
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const resolved = await params
  return internalJsonResponse(await handleAssessmentPrice(request, resolved.taskId, { environment: process.env }))
}
