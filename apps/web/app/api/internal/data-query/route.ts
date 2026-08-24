import { NextResponse } from "next/server"

import { forwardDataQuery } from "@/lib/data/bff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { body = null }
  const result = await forwardDataQuery(body, {
    backendOrigin: process.env.KA_DATA_BACKEND_ORIGIN ?? "",
    serviceToken: process.env.KA_DATA_SERVICE_TOKEN,
  })
  return NextResponse.json(result.body, { status: result.status, headers: { "cache-control": "no-store" } })
}
