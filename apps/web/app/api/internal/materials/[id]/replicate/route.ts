import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleReplicateMaterial } from "@/lib/data/deferred-actions-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const values = await params
  return internalJsonResponse(await handleReplicateMaterial(request, values.id, { environment: process.env }))
}
