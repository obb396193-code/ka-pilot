"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { workItemListResponseSchema, type WorkItemListRequest } from "./work-item-list-contracts"
import type { WorkItem } from "@/lib/fixtures/workbench"

/**
 * 工作台待处理队列取数（F8-25 ②，`GET /api/internal/work-items` → 后端 `GET /work-items`）。
 *
 * 这个列表原来读的是契约样例——A35 开关上了之后，真实模式下它是空的。
 * 工作台是打开产品看到的第一屏，**首屏挂着假 KPI 和假队列最误导**（老板拍板「内网不放假数据」）。
 *
 * 查询参数走 BFF 的白名单（`page/pageSize/q/status/severity/type/assigneeUserId/taskId`），
 * 别处不许加：BFF 对未知键直接拒（和 data/query 一样的道理）。
 */

const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

export type WorkItemsState = {
  items: WorkItem[] | null
  loading: boolean
  error: { message: string; requestId: string | null } | null
  /** 后端说这次结果不完整时的原因（不是报错，是「只返回了一部分」） */
  incomplete: string | null
  reload: () => void
}

export function useWorkItems(query: Partial<WorkItemListRequest> = {}): WorkItemsState {
  const search = useMemo(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
    }
    return params.toString()
  }, [query])

  const [items, setItems] = useState<WorkItem[] | null>(null)
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
    fetch(`/api/internal/work-items${search ? `?${search}` : ""}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null)
        if (!active) return
        // 响应形状**过 schema 再用**：形状对不上就当取数失败，不把半截数据画成队列
        const parsed = workItemListResponseSchema.safeParse(payload)
        if (!parsed.success) {
          setError({ message: `返回的形状和约定对不上（HTTP ${response.status}）`, requestId: null })
          return
        }
        if (!parsed.data.ok) {
          setError({ message: parsed.data.error.message, requestId: parsed.data.error.requestId })
          return
        }
        setItems(parsed.data.data.items as unknown as WorkItem[])
        // coverage.complete=false：后端只查了一部分账户，队列不是全量——得说出来
        const meta = parsed.data.meta
        setIncomplete(meta.coverage.complete ? null : "这批结果不完整：后端只覆盖了一部分账户，队列可能有遗漏")
      })
      .catch(() => { if (active) setError({ message: "网络异常，稍后重试", requestId: null }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [search, nonce])

  return { items, loading, error, incomplete, reload }
}

export const workItemsIsMock = IS_MOCK
