"use client"

import { useEffect, useMemo, useState } from "react"

import { taskListResponseSchema, type TaskListResponse } from "@/lib/data/task-list-contracts"
import emptyFixture from "@/lib/data/fixtures/task-list/empty.json"
import errorFixtures from "@/lib/data/fixtures/task-list/errors.json"
import partialFixture from "@/lib/data/fixtures/task-list/partial.json"
import readyFixture from "@/lib/data/fixtures/task-list/ready.json"
import staleFixture from "@/lib/data/fixtures/task-list/stale.json"

export type TaskStatusFilter = "all" | "active" | "preparing" | "ended"
export type TaskListState = "ready" | "empty" | "partial" | "stale" | "401" | "403" | "400" | "502" | "503" | "504" | "500"

// TASK-LIST-001：浏览器只调 GET /api/internal/tasks。mock 模式用契约 fixtures（packages/contract/fixtures/task-list 的副本），
// ?state= 切四态与错误态；真实模式按 status 走 BFF。前端不重算 pacing / 达成率。
const fixtures: Record<string, unknown> = { ready: readyFixture, empty: emptyFixture, partial: partialFixture, stale: staleFixture, ...(errorFixtures as Record<string, unknown>) }

function browserError(message: string, code: "UPSTREAM_TIMEOUT" | "SOURCE_UNAVAILABLE"): TaskListResponse {
  return { ok: false, error: { code, message, retryable: true, requestId: globalThis.crypto?.randomUUID?.() ?? `client-${Date.now()}` } }
}

export function useTaskList({ status, state }: { status: TaskStatusFilter; state?: string }) {
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  const [response, setResponse] = useState<TaskListResponse | null>(null)
  const key = `${status}|${state ?? ""}`

  useEffect(() => {
    let active = true
    setResponse(null)
    if (isMock) {
      const raw = fixtures[state && state in fixtures ? state : "ready"]
      const parsed = taskListResponseSchema.safeParse(raw)
      const value: TaskListResponse = parsed.success ? parsed.data : browserError("fixture 不符合 TASK-LIST-001 契约", "SOURCE_UNAVAILABLE")
      const timer = setTimeout(() => { if (active) setResponse(value) }, 150)
      return () => { active = false; clearTimeout(timer) }
    }
    const search = new URLSearchParams({ page: "1", pageSize: "100" })
    if (status !== "all") search.set("status", status)
    fetch(`/api/internal/tasks?${search.toString()}`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(12_000) })
      .then(async (upstream) => taskListResponseSchema.parse(await upstream.json()))
      .then((value) => { if (active) setResponse(value) }, (cause) => { if (active) setResponse(browserError(cause instanceof Error ? cause.message : "任务列表请求失败", /timeout/i.test(String(cause)) ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE")) })
    return () => { active = false }
  }, [isMock, key, status, state])

  const items = useMemo(() => {
    if (!response?.ok) return []
    return isMock && status !== "all" ? response.data.items.filter((item) => item.status === status) : response.data.items
  }, [response, isMock, status])

  return { response, items, loading: response === null, isMock }
}
