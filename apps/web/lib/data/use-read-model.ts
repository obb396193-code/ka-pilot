"use client"

import { useEffect, useState } from "react"

import { type ChangeSetDetailResponse, type WorkItemDetailResponse } from "./contracts"
import { readInternalModel, type ReadModelResponse } from "./read-model-client"
import type { ReadModelKind } from "./read-model-bff"

function browserError(cause: unknown): ReadModelResponse {
  const message = cause instanceof Error ? cause.message : "Browser read-model request failed"
  return { ok: false, error: { code: /timeout/i.test(message) ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE", message, retryable: true, requestId: globalThis.crypto?.randomUUID?.() ?? `client-${Date.now()}` } }
}

export function useReadModel(kind: "work-items", id: string | null): { response: WorkItemDetailResponse | null; loading: boolean }
export function useReadModel(kind: "changesets", id: string | null): { response: ChangeSetDetailResponse | null; loading: boolean }
export function useReadModel(kind: ReadModelKind, id: string | null) {
  const [response, setResponse] = useState<ReadModelResponse | null>(null)
  useEffect(() => {
    if (id === null) { setResponse(null); return }
    let active = true
    setResponse(null)
    readInternalModel(kind, id).then((value) => { if (active) setResponse(value) }, (cause) => { if (active) setResponse(browserError(cause)) })
    return () => { active = false }
  }, [id, kind])
  return { response, loading: id !== null && response === null }
}
