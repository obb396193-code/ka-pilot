"use client"

import { useCallback, useEffect, useState } from "react"

import type { TaskOverview } from "@/lib/fixtures/tasks"

// F8-8：任务详情总览接真后端 —— 走 BFF `GET /api/internal/tasks/:id`（后端 `GET /api/v1/tasks/:id`，契约 v1.5.1 ②）。
// mock 模式下不请求，页面照旧用 fixture；真实模式下 404 交给页面走「没有这个任务」空态。
export type TaskDetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: TaskOverview }
  | { status: "not_found" }
  | { status: "error"; message: string; requestId: string | null }

export function useTaskDetail(taskId: string, enabled: boolean): TaskDetailState & { reload: () => void } {
  const [state, setState] = useState<TaskDetailState>(enabled ? { status: "loading" } : { status: "idle" })
  // 勾完就绪要重拉才看得到结果——不然人以为没生效又点一次
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (!enabled) { setState({ status: "idle" }); return }
    let active = true
    setState({ status: "loading" })
    fetch(`/api/internal/tasks/${encodeURIComponent(taskId)}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!active) return
        if (response.status === 404) { setState({ status: "not_found" }); return }
        if (!response.ok || !body?.ok) {
          setState({ status: "error", message: body?.error?.message ?? `请求失败（${response.status}）`, requestId: body?.error?.requestId ?? null })
          return
        }
        setState({ status: "ok", data: body.data as TaskOverview })
      })
      .catch((cause: unknown) => {
        if (!active) return
        setState({ status: "error", message: cause instanceof Error ? cause.message : "网络异常", requestId: null })
      })
    return () => { active = false }
  }, [taskId, enabled, nonce])

  return { ...state, reload }
}
