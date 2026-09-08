import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleMeViews } from "@/lib/data/r014/routes-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return internalJsonResponse(await handleMeViews(request, { environment: process.env }))
}

export async function POST(request: Request) {
  return internalJsonResponse(await handleMeViews(request, { environment: process.env }))
}
