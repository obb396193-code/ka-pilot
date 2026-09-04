import { internalJsonResponse } from "@/lib/data/internal-api-bff"
import { handleTaskListRequest } from "@/lib/data/task-list-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return internalJsonResponse(await handleTaskListRequest(request, { environment: process.env }))
}
