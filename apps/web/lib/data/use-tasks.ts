"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { taskListResponseSchema } from "./task-list-contracts"
import type { TaskItem } from "@/lib/fixtures/tasks"

/**
 * 投放任务列表取数（F8-25 ⑤，`GET /api/internal/tasks` → 后端 `GET /tasks`）。
 *
 * 和账户池、工作台同一个套路：**过 schema 再用，形状对不上当取数失败**，
 * 不把半截数据画成列表。查询参数走 BFF 白名单，别处不许加。
 */

const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

export type TasksState = {
  items: TaskItem[] | null
  total: number
  loading: boolean
  error: { message: string; requestId: string | null } | null
  incomplete: string | null
  reload: () => void
}

export function useTasks(query: { page?: number; pageSize?: number; q?: string; status?: string } = {}): TasksState {
  const search = useMemo(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
    }
    return params.toString()
  }, [query])

  const [items, setItems] = useState<TaskItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null)
  const [incomplete, setIncomplete] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (IS_MOCK) return
    let active = true
    setLoading(true)
    setError(null)
    setIncomplete(null)
    fetch(`/api/internal/tasks${search ? `?${search}` : ""}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null)
        if (!active) return
        const parsed = taskListResponseSchema.safeParse(payload)
        if (!parsed.success) { setError({ message: `返回的形状和约定对不上（HTTP ${response.status}）`, requestId: null }); return }
        if (!parsed.data.ok) { setError({ message: parsed.data.error.message, requestId: parsed.data.error.requestId }); return }
        setItems(parsed.data.data.items as unknown as TaskItem[])
        setTotal(parsed.data.data.total)
        setIncomplete(parsed.data.meta.coverage.complete ? null : "这批结果不完整：后端只覆盖了一部分任务，清单可能有遗漏")
      })
      .catch(() => { if (active) setError({ message: "网络异常，稍后重试", requestId: null }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [search, nonce])

  return { items, total, loading, error, incomplete, reload }
}

export const tasksIsMock = IS_MOCK
