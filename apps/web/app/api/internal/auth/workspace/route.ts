import { handleSessionRequest, internalJsonResponse } from "@/lib/data/session-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  return internalJsonResponse(await handleSessionRequest("workspace", request, { environment: process.env }))
}
