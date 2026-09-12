"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { z } from "zod"

import { runtimeDataClient } from "./client"
import { pivotDimensionSupported, pivotParams } from "./query-params"
import type { DataWindow } from "@/components/business/data/dashboard/window-picker"
import { isOk } from "@/lib/fixtures/contract"
import pivot2 from "@contract/fixtures/data-query/pivot2.json"

/**
 * F8-22 取数：`account.pivot2`（行维 × 列维）。
 * 段维度用 `segment:<key>` 传（契约 v1.9.27），所以这里不需要枚举段名——
 * 新增一个媒体的命名规则，前端不用改。
 */

export type PivotCell = {
  a: { key: string; label: string }
  b: { key: string; label: string } | null
  /** 选中指标在这个格子上的值；缺数为 null（不是 0） */
  value: number | null
}

// mock + production build 下 `runtimeDataClient()` 会抛「Mock provider is disabled in production」
const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

/**
 * 透视行的形状。用**真 schema** 而不是类型断言——
 * `as unknown as` 一个字段都不校验，形状对不上要等用户点开某个格子才炸（审查点名过）。
 * 这里放得松（`loose` + 指标值只要 `value`）：后端多发字段不该让整表不显示，
 * 但「a 里有没有 key/label」这种画表必需的东西必须有。
 */
const pivotValueSchema = z.looseObject({ value: z.number().nullable() })
const pivotAxisSchema = z.object({ key: z.string().min(1), label: z.string() }).loose()
const pivotRowSchema = z.looseObject({
  a: pivotAxisSchema,
  b: pivotAxisSchema.optional(),
  metrics: z.looseObject({ ratios: z.record(z.string(), pivotValueSchema).optional() }),
})
type Row = z.infer<typeof pivotRowSchema>

/** 指标名 → 从行里取值。比率在 `metrics.ratios` 下，其余在 `metrics` 顶层 */
function readMetric(row: Row, metric: string): number | null {
  const ratios = row.metrics.ratios
  if (ratios && metric in ratios) return ratios[metric]?.value ?? null
  const direct = (row.metrics as Record<string, unknown>)[metric]
  const value = (direct as { value?: unknown } | undefined)?.value
  return typeof value === "number" ? value : null
}

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
    const fixture = pivot2 as unknown as { ok: boolean; data: { source: { dimA: string; dimB: string; rows: Row[] } } }
    if (!isOk(fixture as never)) return { cells: [] as PivotCell[], note: "示例数据缺失" }
    const source = fixture.data.source
    const matches = source.dimA === rowDim && (colDim === null || source.dimB === colDim)
    if (!matches) {
      return { cells: [] as PivotCell[], note: `示例数据只覆盖「资源位 × 任务」这一个组合；「${rowDim}${colDim ? ` × ${colDim}` : ""}」要接后端才有数。` }
    }
    return {
      cells: source.rows.map((row) => ({ a: row.a, b: colDim ? row.b ?? null : null, value: readMetric(row, metric) })),
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
        if (source.status === "unavailable") { setUnavailable(source.error?.message ?? "这个维度组合暂不支持"); setCells([]); return }
        // ★不再 `as unknown as`：那种断言一个字段都不校验，形状对不上要等用户点开才炸。
        //   解析失败就照实说「返回的形状对不上」，不把半截数据画成表。
        const parsed = z.array(pivotRowSchema).safeParse(source.rows)
        if (!parsed.success) {
          setUnavailable("后端返回的透视行形状和约定对不上，已拦下不显示")
          console.error("[pivot] 行不合 schema：", parsed.error.issues.slice(0, 3))
          setCells([])
          return
        }
        setCells(parsed.data.map((row) => ({ a: row.a, b: colDim ? row.b ?? null : null, value: readMetric(row, metric) })))
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
      unavailable: `「${unsupportedDim}」这个维度后端还没接（现在只支持 账户 / 任务 / 业务）`,
      reload,
    }
  }
  if (IS_MOCK) {
    return { data: mockCells?.cells ?? [], loading: false, error: null, unavailable: mockCells?.note ?? null, reload }
  }
  return { data: cells, loading, error, unavailable, reload }
}
