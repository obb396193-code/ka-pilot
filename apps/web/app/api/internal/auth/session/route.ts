import { handleSessionRequest, internalJsonResponse } from "@/lib/data/session-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  return internalJsonResponse(await handleSessionRequest("session", request, { environment: process.env }))
}

export async function DELETE(request: Request): Promise<Response> {
  return internalJsonResponse(await handleSessionRequest("session", request, { environment: process.env }))
}
