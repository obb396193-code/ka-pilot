"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * 大盘筛选栏的可选项（F8-27，`GET /api/internal/data-filters` → 后端 `GET /data/filters`）。
 *
 * 两个关键语义，界面要照着做：
 * ① **只列窗口内 cost>0 的项**——后端已经过滤过了。所以「选项里没有」≠「这个东西不存在」，
 *    而是「这个窗口它没花钱」。空选项要这么说，不能说「暂无数据」。
 * ② **下游随上游收窄**——选了优化师之后，任务列表只剩他的任务。
 *    所以每次上游一变就要重新拉，不能只拉一次缓存住。
 */

const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

export type FilterOption = { key: string; label: string; cost: number | null }
export type FilterOptions = {
  optimizers: FilterOption[]
  bizs: FilterOption[]
  tasks: FilterOption[]
  resource_positions: FilterOption[]
}

export type FilterSelection = { optimizer?: string[]; biz?: string[]; task_id?: string[]; resource_position?: string[] }

const EMPTY: FilterOptions = { optimizers: [], bizs: [], tasks: [], resource_positions: [] }

export function useDataFilters(
  window: { from: string; to: string },
  media: string | undefined,
  selection: FilterSelection,
): { options: FilterOptions; loading: boolean; error: string | null; reload: () => void } {
  const search = useMemo(() => {
    const params = new URLSearchParams()
    params.set("window_from", window.from)
    params.set("window_to", window.to)
    if (media) params.set("media", media)
    // 上游选中的值带上去，后端据此收窄下游选项（数组键用 `xxx[]`，BFF 白名单里两种都放行）
    for (const [key, values] of Object.entries(selection)) {
      for (const value of values ?? []) params.append(`${key}[]`, value)
    }
    return params.toString()
  }, [window.from, window.to, media, selection])

  const [options, setOptions] = useState<FilterOptions>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (IS_MOCK) return
    let active = true
    setLoading(true)
    setError(null)
    fetch(`/api/internal/data-filters?${search}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: FilterOptions; error?: { message?: string } } | null
        if (!active) return
        if (!payload?.ok || !payload.data) { setError(payload?.error?.message ?? `读取筛选项失败（HTTP ${response.status}）`); return }
        setOptions({ ...EMPTY, ...payload.data })
      })
      .catch(() => { if (active) setError("网络异常，稍后重试") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [search, nonce])

  return { options, loading, error, reload }
}

export const filtersIsMock = IS_MOCK
