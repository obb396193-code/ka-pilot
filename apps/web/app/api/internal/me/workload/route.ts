import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleMeWorkload } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return internalJsonResponse(await handleMeWorkload(request, { environment: process.env }))
}
