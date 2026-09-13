import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleStopAccountTest } from "@/lib/data/deferred-actions-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ media: string; id: string; testId: string }> }) {
  const values = await params
  return internalJsonResponse(await handleStopAccountTest(request, values.media, values.id, values.testId, { environment: process.env }))
}
