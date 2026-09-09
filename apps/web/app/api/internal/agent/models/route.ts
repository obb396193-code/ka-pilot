import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAgentModelsRequest } from "@/lib/data/agent-models-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  return internalJsonResponse(await handleAgentModelsRequest(request, { environment: process.env }))
}
