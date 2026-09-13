import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleSettingsChangeLogRequest } from "@/lib/data/settings-change-log-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  return internalJsonResponse(await handleSettingsChangeLogRequest(request, { environment: process.env }))
}
