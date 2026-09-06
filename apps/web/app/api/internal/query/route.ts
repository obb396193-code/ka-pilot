import { handleSemanticQueryRequest } from "@/lib/data/bff"
import { internalJsonResponse } from "@/lib/data/internal-api-bff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return internalJsonResponse(await handleSemanticQueryRequest(request, { environment: process.env }))
}

// Preserve requestId and the stable error envelope for unsupported methods.
export { POST as GET, POST as PUT, POST as PATCH, POST as DELETE, POST as OPTIONS, POST as HEAD }
