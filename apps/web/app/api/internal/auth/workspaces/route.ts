import { handleSessionRequest, internalJsonResponse } from "@/lib/data/session-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  return internalJsonResponse(await handleSessionRequest("workspaces", request, { environment: process.env }))
}
