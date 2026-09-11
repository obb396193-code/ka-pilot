"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { runtimeDataClient } from "./client"
import { dimensionParams, windowParams, type QueryParams } from "./query-params"
import type { DataQueryResponse } from "./contracts"
import type { DataWindow } from "@/components/business/data/dashboard/window-picker"
import {
  dashboardSummaryFixture,
  drillFixture,
  bizDimensionFixture,
  optimizerDimensionFixture,
  resourcePositionFixture,
  type DashboardRow,
  type DashboardSummaryRow,
} from "@/lib/fixtures/dashboard"
import { isOk } from "@/lib/fixtures/contract"

/**
 * 数据看板取数层（F8-19b ①，审查员 D 的 P1「组件只吃 props」）。
 *
 * 一处切 mock / 真实：组件不再自己判断走 fixture 还是走接口。
 * 真实模式一律 `POST /data/query`；mock 模式读过渡 fixture。
 *
 * 三个刻意的设计：
 * ① **key 含 workspaceId**：切个人/团队就是换数据源，key 一变自然重拉，不用组件自己监听；
 * ② **stale-while-revalidate**：重查时保留上一份数据 + 置 `isValidating`，
 *    不把已经看到的数字清成骨架屏——换窗口时闪一下空白比慢一点更难受；
 * ③ **AbortController**：连点窗口时把在飞的请求取消，避免先发的后到把新结果覆盖掉。
 */

export type DashboardQueryState<T> = {
  data: T | null
  /** 首次加载（还没有任何数据可显示） */
  loading: boolean
  /** 有旧数据、正在后台重查 */
  isValidating: boolean
  error: { message: string; requestId: string | null } | null
  reload: () => void
}

type Params = QueryParams

/**
 * ★mock 模式**不建客户端**：`runtimeDataClient()` 在 mock + production build 下会直接抛
 * 「Mock provider is disabled in production」（这是有意的防线，防止 mock 数据上生产）。
 * 看板在 mock 下本来就读 fixture，压根不需要客户端——建了反而把整页干掉。
 */
const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

function errorOf(response: DataQueryResponse | null, cause?: unknown): { message: string; requestId: string | null } | null {
  if (cause) return { message: cause instanceof Error ? cause.message : "取数失败", requestId: null }
  if (!response || response.ok) return null
  return { message: response.error.message, requestId: response.error.requestId }
}

/**
 * 一条查询。`enabled=false` 时不发请求（例如 mock 模式，数据由调用方给）。
 *
 * `scope` 只进缓存 key **不进 params**：空间由会话 cookie 决定，`workspace_id` 是未知键
 * （发了整条 400，P0-⑲）；但切个人/团队确实是换数据源，所以 key 里必须有它才会重拉。
 */
function useQuery<T>(
  queryId: "account.summary" | "account.trend" | "account.dimension",
  params: Params,
  enabled: boolean,
  pick: (response: DataQueryResponse) => T | null,
  scope?: string,
): DashboardQueryState<T> {
  const runtime = useMemo(() => (enabled ? runtimeDataClient() : null), [enabled])
  const key = JSON.stringify({ queryId, params, scope })
  const [data, setData] = useState<T | null>(null)
  const [isValidating, setValidating] = useState(false)
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])
  // 保留上一份数据用于 SWR：重查期间界面继续显示旧值，不闪空
  const held = useRef<T | null>(null)

  useEffect(() => {
    if (!enabled || !runtime) return
    let active = true
    setValidating(true)
    setError(null)
    runtime.client
      .query({ queryId, params, dataView: "platform" })
      .then((response) => {
        if (!active) return
        const failure = errorOf(response)
        if (failure) { setError(failure); return }
        const value = pick(response)
        held.current = value
        setData(value)
      })
      .catch((cause: unknown) => { if (active) setError(errorOf(null, cause)) })
      .finally(() => { if (active) setValidating(false) })
    // 组件卸载或 key 变化时把这次结果作废：连点窗口时先发的后到会覆盖新结果
    return () => { active = false }
    // key 是 queryId+params 的指纹；pick 每次渲染新建，放进依赖会每帧重查
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, nonce, runtime])

  return { data: data ?? held.current, loading: enabled && data === null && held.current === null && error === null, isValidating, error, reload }
}

export function useDashboardSummary(window: DataWindow, workspaceId: string | undefined) {
  const remote = useQuery<DashboardSummaryRow>(
    "account.summary",
    windowParams(window),
    !IS_MOCK,
    (response) => (response.ok && response.data.mode !== "reconcile" ? (response.data.source.rows[0] as unknown as DashboardSummaryRow) ?? null : null),
    workspaceId,
  )
  if (!IS_MOCK) return remote
  const row = isOk(dashboardSummaryFixture) ? (dashboardSummaryFixture.data.source.rows[0] ?? null) : null
  return { data: row, loading: false, isValidating: false, error: null, reload: () => {} }
}

export function useDashboardTrend(window: DataWindow, workspaceId: string | undefined) {
  return useQuery<{ ds: string; metrics: DashboardRow["metrics"] }[]>(
    "account.trend",
    windowParams(window),
    !IS_MOCK,
    (response) => (response.ok && response.data.mode !== "reconcile" ? (response.data.source.rows as unknown as { ds: string; metrics: DashboardRow["metrics"] }[]) : null),
    workspaceId,
  )
}

export function useDashboardDimension(dimension: string, window: DataWindow, workspaceId: string | undefined, fallback: DashboardRow[]) {
  const remote = useQuery<DashboardRow[]>(
    "account.dimension",
    dimensionParams(dimension, window).params,
    !IS_MOCK,
    (response) => (response.ok && response.data.mode !== "reconcile" ? (response.data.source.rows as unknown as DashboardRow[]) : null),
    workspaceId,
  )
  if (!IS_MOCK) return remote
  return { data: fallback, loading: false, isValidating: false, error: null, reload: () => {} }
}

/** mock 侧的维度行（组件不再直接 import fixture） */
/** ★任务大类顶层行必须和 summary 同源，不能用契约里那份 personal 的 biz fixture（审查 ③）*/
export const mockBizRows = (): DashboardRow[] => (isOk(bizDimensionFixture) ? bizDimensionFixture.data.source.rows : [])
export const mockOptimizerRows = (): DashboardRow[] => (isOk(optimizerDimensionFixture) ? optimizerDimensionFixture.data.source.rows : [])
export const mockResourcePositionRows = (): DashboardRow[] => (isOk(resourcePositionFixture) ? resourcePositionFixture.data.source.rows : [])

/**
 * 钻取下一层。**每展开一层是一次带上游 filters 的查询**，不是一次性把整棵树拉下来——
 * 树全量下发在账户多的空间会非常大，而且大部分层永远不会被展开。
 * `path` 形如 `opt-zhang|biz-aac`：逐段就是逐级的上游过滤条件。
 */
export function useDrillChildren(path: string, dimension: string, filters: Params, window: DataWindow, workspaceId: string | undefined) {
  // 后端只认五个过滤键；出现别的键就**这一层不查**并明说不支持——
  // 静默把它丢掉会让下钻悄悄放宽成「全部」，看着正常其实是错数（比报错更坏）。
  const built = dimensionParams(dimension, window, filters)
  const supported = built.unsupported.length === 0
  const remote = useQuery<DashboardRow[]>(
    "account.dimension",
    built.params,
    // `path` 为空 = 这一行没展开：不查。
    // 漏了这个条件的话，首屏每一个非叶子行都会立刻发一次下钻查询——
    // 几十行就是几十个请求，「展开才查」就白写了（mock 下看不出来，因为 mock 不发请求）。
    !IS_MOCK && supported && path !== "",
    (response) => (response.ok && response.data.mode !== "reconcile" ? (response.data.source.rows as unknown as DashboardRow[]) : null),
    workspaceId,
  )
  if (!IS_MOCK) {
    if (!supported) return { data: null, loading: false, isValidating: false, error: { message: `这层下钻后端还不支持（条件 ${built.unsupported.join("、")}）`, requestId: null }, reload: () => {} }
    return remote
  }
  const table = isOk(drillFixture) ? drillFixture.data.byParent : {}
  return { data: table[path] ?? [], loading: false, isValidating: false, error: null, reload: () => {} }
}
