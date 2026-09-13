import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handlePromoteAutonomy } from "@/lib/data/deferred-actions-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const values = await params
  return internalJsonResponse(await handlePromoteAutonomy(request, values.ruleId, { environment: process.env }))
}
