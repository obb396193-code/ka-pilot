import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleMeNotificationsRead } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return internalJsonResponse(await handleMeNotificationsRead(request, { environment: process.env }))
}
