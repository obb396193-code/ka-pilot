"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { runtimeDataClient } from "./client"
import { gapParams, hourlyParams, tableParams, type GapQuery, type HourlyQuery, type TableQuery } from "./query-params"

/**
 * F8-24：盯盘（`account.hourly`）与差异对账（`account.gap`）的取数。
 *
 * 这两个走 `/api/internal/query`（不是 data-query），params 另有一套约定——
 * 全部由 `query-params.ts` 产出，这里不拼参数。
 *
 * **小时表还没灌数**（be2 Q-042 的采样 job）：后端会返 `availability:"pending"`，
 * 界面显「待到」。所以这里**不拿 fixture 顶上**——顶上去人就以为盯盘已经能用了。
 */

const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

export type OperationalState<T> = {
  rows: T[] | null
  /**
   * 这次响应的血缘。**必须跟着响应走**：三个 tab 原来固定读样例里的 lineage，
   * 真实模式下等于把假的「数据截至 / 来源」贴在真数字旁边——比不显更糟（F8-25）。
   */
  lineage: Record<string, unknown> | null
  /**
   * 这次响应的 `source.warnings[]`（字符串码）。**也必须跟着响应走**：
   * 盯盘原来把**样例**里的三个告警贴在真数字旁边——真实模式下那是三句假话。
   * 码 → 人话在 `warning-codes.ts`。
   */
  warnings: string[]
  loading: boolean
  error: { message: string; requestId: string | null } | null
  /** 后端明说这个查询当前不可用时的原因（不是报错，是「还没到」） */
  unavailable: string | null
  reload: () => void
}

function useOperationalQuery<T>(
  queryId: "account.hourly" | "account.gap" | "account.table",
  params: Record<string, unknown> | null,
  scope: string | undefined,
): OperationalState<T> {
  const key = JSON.stringify({ queryId, params, scope })
  const [rows, setRows] = useState<T[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [lineage, setLineage] = useState<Record<string, unknown> | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    // params 为 null = 还不知道要查谁（比如没选媒体）：不发请求，也不报错
    if (IS_MOCK || params === null) return
    let active = true
    setLoading(true)
    setError(null)
    setUnavailable(null)
    setWarnings([])
    runtimeDataClient("operational").client
      .query({ queryId, params, dataView: "platform" })
      .then((response) => {
        if (!active) return
        if (!response.ok) { setError({ message: response.error.message, requestId: response.error.requestId }); return }
        if (response.data.mode === "reconcile") { setUnavailable("这个查询返回了对账结果，形状对不上"); return }
        const source = response.data.source
        if (source.status === "unavailable") { setUnavailable(source.error?.message ?? "这个查询暂时没有数据"); setRows([]); return }
        setRows(source.rows as unknown as T[])
        setLineage((source.lineage ?? null) as Record<string, unknown> | null)
        // 只收字符串码：对象形的点名告警在 `lineage.warnings[]`，由 MissingDataNotice 管
        const codes = (source as { warnings?: unknown }).warnings
        setWarnings(Array.isArray(codes) ? codes.filter((code): code is string => typeof code === "string") : [])
      })
      .catch((cause: unknown) => { if (active) setError({ message: cause instanceof Error ? cause.message : "取数失败", requestId: null }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  return { rows, lineage, warnings, loading, error, unavailable, reload }
}

export function useHourly<T>(query: HourlyQuery | null, workspaceId?: string): OperationalState<T> {
  const params = useMemo(() => (query ? hourlyParams(query) : null), [query])
  return useOperationalQuery<T>("account.hourly", params, workspaceId)
}

export function useGap<T>(query: GapQuery | null, workspaceId?: string): OperationalState<T> {
  const params = useMemo(() => (query ? gapParams(query) : null), [query])
  return useOperationalQuery<T>("account.gap", params, workspaceId)
}

export function useDataTable<T>(query: TableQuery | null, workspaceId?: string): OperationalState<T> {
  const params = useMemo(() => (query ? tableParams(query) : null), [query])
  return useOperationalQuery<T>("account.table", params, workspaceId)
}

/** mock 模式下这几个 hook 一律不发请求，调用方自己给 fixture 行 */
export const operationalIsMock = IS_MOCK
