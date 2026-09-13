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
    // `active` 管「别把过期结果画上去」，`controller` 管「别让过期请求继续跑」——
    // 两件事，都要做：只丢结果的话，连点几次窗口就是几次白算
    const controller = new AbortController()
    let active = true
    setResponse(null)
    runtime.client.query(stableRequest, controller.signal).then(
      (value) => { if (active) setResponse(value) },
      (cause) => {
        // 自己取消的不算失败，别在界面上报一个红条
        if (active && !controller.signal.aborted) setResponse(clientError(cause))
      },
    )
    return () => { active = false; controller.abort() }
  }, [runtime, stableRequest])
  return { response, isMock: runtime.isMock, loading: response === null }
}
