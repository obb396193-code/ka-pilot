import { NextResponse } from "next/server"

import { resolveApprovedDataQueryAuthContext } from "@/lib/data/approved-auth-context"
import { handleDataQueryRequest } from "@/lib/data/bff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const result = await handleDataQueryRequest(request, {
    environment: process.env,
    approvedAuthContextResolver: resolveApprovedDataQueryAuthContext,
  })
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } })
}
