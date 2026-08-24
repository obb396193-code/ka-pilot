import { NextResponse } from "next/server"

import { resolveApprovedDataQueryAuthContext } from "@/lib/data/approved-auth-context"
import { handleReadModelRequest } from "@/lib/data/read-model-bff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await handleReadModelRequest("work-items", id, { environment: process.env, approvedAuthContextResolver: resolveApprovedDataQueryAuthContext })
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } })
}
