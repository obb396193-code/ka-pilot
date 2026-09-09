import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleDecisionPolicy } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return internalJsonResponse(await handleDecisionPolicy(request, { environment: process.env }))
}

export async function PUT(request: Request) {
  return internalJsonResponse(await handleDecisionPolicy(request, { environment: process.env }))
}
