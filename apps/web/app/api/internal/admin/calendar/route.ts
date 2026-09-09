import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleAdminCalendarRequest } from "@/lib/data/admin-calendar-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  return internalJsonResponse(await handleAdminCalendarRequest(request, { environment: process.env }))
}
