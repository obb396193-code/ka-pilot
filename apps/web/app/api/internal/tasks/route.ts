import { NextResponse } from "next/server"

import { resolveApprovedDataQueryAuthContext } from "@/lib/data/approved-auth-context"
import { handleTaskListRequest } from "@/lib/data/task-list-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const result = await handleTaskListRequest(request, {
    environment: process.env,
    approvedAuthContextResolver: resolveApprovedDataQueryAuthContext,
  })
  const requestId = result.body.ok ? result.body.meta.requestId : result.body.error.requestId
  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  })
}
