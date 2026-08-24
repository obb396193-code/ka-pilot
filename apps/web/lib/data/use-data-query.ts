"use client"

import { useEffect, useMemo, useState } from "react"
import { runtimeDataClient } from "./client"
import type { DataQueryResponse, QueryRequest } from "./contracts"

function clientError(cause: unknown): DataQueryResponse {
  const message = cause instanceof Error ? cause.message : "Browser data query failed"
  const requestId = globalThis.crypto?.randomUUID?.() ?? `client-${Date.now()}`
  return { ok: false, error: { code: /timeout/i.test(message) ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE", message, retryable: true, requestId } }
}

export function useDataQuery(request: QueryRequest) {
  const key = JSON.stringify(request)
  const stableRequest = useMemo(() => request, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const runtime = useMemo(() => runtimeDataClient(), [])
  const [response, setResponse] = useState<DataQueryResponse | null>(null)
  useEffect(() => {
    if (stableRequest.mockState === "loading" && runtime.isMock) { setResponse(null); return }
    let active = true
    setResponse(null)
    runtime.client.query(stableRequest).then((value) => { if (active) setResponse(value) }, (cause) => { if (active) setResponse(clientError(cause)) })
    return () => { active = false }
  }, [runtime, stableRequest])
  return { response, isMock: runtime.isMock, loading: response === null }
}
