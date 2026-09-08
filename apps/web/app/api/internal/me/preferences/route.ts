import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleMePreferences } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return internalJsonResponse(await handleMePreferences(request, { environment: process.env }))
}

export async function PATCH(request: Request) {
  return internalJsonResponse(await handleMePreferences(request, { environment: process.env }))
}
