"use client"

import { useEffect, useState } from "react"

import { resolveErrorMessage } from "@/lib/data/contracts"
import { normalizeEtlRun, type EtlRun } from "@/lib/fixtures/admin"

// F8-15 ①：拉数记录接真后端（BFF `GET /api/internal/system/etl-runs`，契约 v1.9.12 分页形）。
// mock 模式不请求，页面照旧用 fixture。
export type EtlRunsState =
  | { status: "loading" }
  | { status: "ok"; items: EtlRun[]; total: number }
  | { status: "error"; message: string; requestId: string | null }

export function useEtlRuns(enabled: boolean, pageSize = 50): EtlRunsState {
  const [state, setState] = useState<EtlRunsState>({ status: "loading" })

  useEffect(() => {
    if (!enabled) return
    let active = true
    setState({ status: "loading" })
    fetch(`/api/internal/system/etl-runs?page=1&pageSize=${pageSize}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!active) return
        if (!response.ok || !body?.ok) {
          setState({ status: "error", message: resolveErrorMessage(body?.error?.code ?? "", body?.error?.message ?? `请求失败（${response.status}）`), requestId: body?.error?.requestId ?? null })
          return
        }
        // warnings 两种形状并存（旧的纯字符串码 / 新的 {code,message}），归一后再进表，否则 React 渲染对象会整页崩
        setState({ status: "ok", items: (body.data?.items ?? []).map(normalizeEtlRun), total: body.data?.total ?? 0 })
      })
      .catch((cause: unknown) => {
        if (!active) return
        setState({ status: "error", message: cause instanceof Error ? cause.message : "网络异常", requestId: null })
      })
    return () => { active = false }
  }, [enabled, pageSize])

  return state
}
