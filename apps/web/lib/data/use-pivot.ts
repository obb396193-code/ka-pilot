"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { runtimeDataClient } from "./client"
import { parsePivotRows, toPivotCell, type PivotCell, type PivotRow } from "./pivot-rows"
import { pivotDimensionSupported, pivotParams } from "./query-params"
import type { DataWindow } from "@/components/business/data/dashboard/window-picker"
import { isOk } from "@/lib/fixtures/contract"
import pivot2 from "@contract/fixtures/data-query/pivot2.json"

/**
 * F8-22 取数：`account.pivot2`（行维 × 列维）。
 * 段维度用 `segment:<key>` 传（契约 v1.9.27），所以这里不需要枚举段名——
 * 新增一个媒体的命名规则，前端不用改。
 * 行 → 格子的解析在 `pivot-rows.ts`（纯逻辑，真响应回放测得到）。
 */

export type { PivotCell } from "./pivot-rows"

// mock + production build 下 `runtimeDataClient()` 会抛「Mock provider is disabled in production」
const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

export function usePivot(rowDim: string, colDim: string | null, metric: string, window: DataWindow, media: string, workspaceId: string | undefined) {
  // 参数键名一律走 query-params（pivot2 现在是 window_from/window_to/media/dimA/dimB，v1.9.34 实测）
  const params = useMemo(() => pivotParams(rowDim, colDim, window, media), [rowDim, colDim, window, media])
  // workspaceId 只进缓存 key 不进 params：空间由会话定，发出去是未知键
  const key = JSON.stringify({ params, workspaceId })
  // 后端现在只认 account/task/biz；选了别的就别发——发出去必是 DIMENSION_UNSUPPORTED，
  // 让人选完再吃一个报错，不如一开始就说清楚（v1.9.34）
  const unsupportedDim = [rowDim, colDim].filter((value): value is string => value !== null).find((value) => !pivotDimensionSupported(value))

  const [cells, setCells] = useState<PivotCell[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  // mock：契约只给了「资源位 × 任务」这一个组合。
  // 其余组合**照实说没有示例数据**，不拿别的维度的数字冒充——那会让人以为透视已经能跑了。
  const mockCells = useMemo(() => {
    if (!IS_MOCK) return null
    const fixture = pivot2 as unknown as { ok: boolean; data: { source: { dimA: string; dimB: string; rows: PivotRow[] } } }
    if (!isOk(fixture as never)) return { cells: [] as PivotCell[], note: "示例数据缺失" }
    const source = fixture.data.source
    const matches = source.dimA === rowDim && (colDim === null || source.dimB === colDim)
    if (!matches) {
      return { cells: [] as PivotCell[], note: `示例数据只覆盖「资源位 × 任务」这一个组合；「${rowDim}${colDim ? ` × ${colDim}` : ""}」要接后端才有数。` }
    }
    return {
      cells: source.rows.map((row) => toPivotCell(row, colDim, metric)),
      note: null as string | null,
    }
  }, [rowDim, colDim, metric])

  useEffect(() => {
    if (IS_MOCK || unsupportedDim) return
    let active = true
    setLoading(true)
    setError(null)
    setUnavailable(null)
    runtimeDataClient().client
      .query({ queryId: "account.pivot2", params, dataView: "platform" })
      .then((response) => {
        if (!active) return
        if (!response.ok) { setError({ message: response.error.message, requestId: response.error.requestId }); return }
        if (response.data.mode === "reconcile") { setUnavailable("这个查询返回了对账结果，不是透视"); return }
        const source = response.data.source
        if (source.status === "unavailable") {
          // 后端不支持这个维度时会在 `details.supported[]` 里列出**这个源实际可用的维度**。
          // 把那份清单原样转给用户——后端说的比前端猜的准，而且换个媒体源可用集就不一样。
          const details = (source.error as { details?: { supported?: unknown } } | undefined)?.details
          const supported = Array.isArray(details?.supported) ? details.supported.filter((item): item is string => typeof item === "string") : []
          setUnavailable(
            supported.length
              ? `${source.error?.message ?? "这个维度组合暂不支持"}。这个源现在可用的维度：${supported.join("、")}`
              : source.error?.message ?? "这个维度组合暂不支持",
          )
          setCells([])
          return
        }
        // ★不再 `as unknown as`：那种断言一个字段都不校验，形状对不上要等用户点开才炸。
        //   解析失败就照实说「返回的形状对不上」，不把半截数据画成表。
        const parsed = parsePivotRows(source.rows, colDim, metric)
        if (!parsed.ok) {
          setUnavailable("后端返回的透视行形状和约定对不上，已拦下不显示")
          console.error("[pivot] 行不合 schema：", parsed.issues)
          setCells([])
          return
        }
        setCells(parsed.cells)
      })
      .catch((cause: unknown) => { if (active) setError({ message: cause instanceof Error ? cause.message : "取数失败", requestId: null }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, metric, nonce])

  if (unsupportedDim) {
    return {
      data: [] as PivotCell[],
      loading: false,
      error: null,
      unavailable: `「${unsupportedDim}」这个维度后端还没接——它在 schema 里合法，但没有解析器产出它（v1.9.41）`,
      reload,
    }
  }
  if (IS_MOCK) {
    return { data: mockCells?.cells ?? [], loading: false, error: null, unavailable: mockCells?.note ?? null, reload }
  }
  return { data: cells, loading, error, unavailable, reload }
}
