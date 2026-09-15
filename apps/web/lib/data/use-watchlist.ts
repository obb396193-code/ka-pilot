"use client"

import { useCallback, useEffect, useState } from "react"

import { clearWatchlist, saveWatchlist } from "@/lib/data/use-me-actions"
import { isOk } from "@/lib/fixtures/contract"
import { watchlistFixture } from "@/lib/fixtures/settings"

/**
 * 盯盘 / 关注名单（`GET/PUT /api/internal/me/watchlist` → `/api/v1/me/watchlist`）。
 *
 * 起因（arch 2026-09-14 真浏览器截图）：五个页面都直接读 `watchlistFixture`，
 * **真实模式下样例是空的 → 名单空 → 盯盘不发小时查询 → 0–23 时全「−」**，
 * 而同一天 data-api 的 `account.hourly` 明明回了 150 行。不是没数，是没人问。
 *
 * 写那一半（PUT）早就在 `use-me-actions.ts` 里了，这里**不再抄一遍 fetch**：
 * 这个 hook 只负责「读回来 + 存在 state 里 + 写完重读」。
 *
 * ★契约是**整体替换**不是增删单条：调用方得把替换后的完整名单传进来。
 *   `saveWatchlist` 对空名单直接拦（多半是上游算错了），真要清空走 `clear()`。
 */

const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

/** 契约 api.md:762 / :989：名单条目两型，account 带 media+accountId，task 只有 taskId */
export type WatchlistItem =
  | { type: "account"; media: string; accountId: string }
  | { type: "task"; taskId: string }

export type WatchlistState = {
  items: WatchlistItem[]
  updatedAt: string | null
  loading: boolean
  /** 名单**拉不到**（≠ 拉到了但是空的）。两者要分开说：退成空名单会让人以为自己没加过账户 */
  error: string | null
  /** 整份覆盖；成功后重读，以库里那份为准 */
  replace: (next: WatchlistItem[]) => Promise<boolean>
  /** 明知故犯地清空（移除最后一条时走这条，不是 replace([])） */
  clear: () => Promise<boolean>
  reload: () => void
}

export function useWatchlist(): WatchlistState {
  const fixture = IS_MOCK && isOk(watchlistFixture) ? watchlistFixture.data : null
  const [items, setItems] = useState<WatchlistItem[]>(() => (fixture?.items as WatchlistItem[] | undefined) ?? [])
  const [updatedAt, setUpdatedAt] = useState<string | null>(fixture?.updatedAt ?? null)
  const [loading, setLoading] = useState(!IS_MOCK)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (IS_MOCK) return
    let active = true
    setLoading(true)
    setError(null)
    fetch("/api/internal/me/watchlist", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { ok?: boolean; data?: { items?: WatchlistItem[]; updatedAt?: string | null }; error?: { message?: string } } | null
        if (!active) return
        if (!response.ok || !payload?.ok || !Array.isArray(payload.data?.items)) {
          setError(payload?.error?.message ?? `名单没拉到（${response.status}）`)
          return
        }
        setItems(payload.data.items)
        setUpdatedAt(payload.data.updatedAt ?? null)
      })
      .catch(() => { if (active) setError("名单没拉到：网络异常") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [nonce])

  /**
   * mock 下没有真接口可写，就地改 state（`saveWatchlist` 自己会弹「示例数据，改动不落库」）。
   * 真实模式下**写完重读**，不拿本地拼的那份当准：去重、字段规范化以库为准，
   * 本地留一份可能和库不一样，下次刷新就会「怎么又变了」。
   */
  const commit = useCallback(async (next: WatchlistItem[], write: () => Promise<boolean>): Promise<boolean> => {
    const done = await write()
    if (!done) return false
    if (IS_MOCK) { setItems(next); return true }
    reload()
    return true
  }, [reload])

  const replace = useCallback((next: WatchlistItem[]) => commit(next, () => saveWatchlist(next)), [commit])
  const clear = useCallback(() => commit([], () => clearWatchlist()), [commit])

  return { items, updatedAt, loading, error, replace, clear, reload }
}

/** 同一个账户不重复进名单（媒体 + 账户 ID 才是一条，光比账户 ID 会把两个媒体的同号当一个） */
export function sameWatchItem(a: WatchlistItem, b: WatchlistItem): boolean {
  if (a.type === "account" && b.type === "account") return a.media === b.media && a.accountId === b.accountId
  if (a.type === "task" && b.type === "task") return a.taskId === b.taskId
  return false
}

/** 整份名单覆盖时用：空了就走 clear，否则 replace——省得每个调用方自己判 */
export function commitWatchlist(state: WatchlistState, next: WatchlistItem[]): Promise<boolean> {
  return next.length === 0 ? state.clear() : state.replace(next)
}
