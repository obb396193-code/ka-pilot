"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { accountListResponseSchema } from "./r014/account-list-contracts"
import type { AccountItem } from "@/lib/fixtures/accounts"

/**
 * 账户池取数（F8-25 ④，`GET /api/internal/accounts` → 后端 `GET /accounts`）。
 *
 * devix 那次改库探针就是拿这一页证的：改 account-6 的名字页面纹丝不动，
 * **九态合计 39 户而库里只有 6 户**——账户池是最容易看出假数据的一页，
 * 也是最容易被当真的一页（人会照着它去分配账户）。
 *
 * 查询参数走 BFF 白名单（`page/pageSize/q/media/stage/starred/tags/ownerUserId/...`），
 * 别处不许加：BFF 对未知键直接拒。
 */

const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

export type AccountsState = {
  items: AccountItem[] | null
  total: number
  loading: boolean
  error: { message: string; requestId: string | null } | null
  /** 后端说这批结果不完整（只覆盖了一部分账户） */
  incomplete: string | null
  reload: () => void
}

export type AccountsQuery = { page?: number; pageSize?: number; q?: string; stage?: string; starred?: boolean }

export function useAccounts(query: AccountsQuery = {}): AccountsState {
  const search = useMemo(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value))
    }
    return params.toString()
  }, [query])

  const [items, setItems] = useState<AccountItem[] | null>(null)
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
    fetch(`/api/internal/accounts${search ? `?${search}` : ""}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null)
        if (!active) return
        // 过 schema 再用：形状对不上当取数失败，不把半截数据画成账户列表
        const parsed = accountListResponseSchema.safeParse(payload)
        if (!parsed.success) { setError({ message: `返回的形状和约定对不上（HTTP ${response.status}）`, requestId: null }); return }
        if (!parsed.data.ok) { setError({ message: parsed.data.error.message, requestId: parsed.data.error.requestId }); return }
        setItems(parsed.data.data.items as unknown as AccountItem[])
        setTotal(parsed.data.data.total)
        setIncomplete(parsed.data.meta.coverage.complete ? null : "这批结果不完整：后端只覆盖了一部分账户，下面的清单可能有遗漏")
      })
      .catch(() => { if (active) setError({ message: "网络异常，稍后重试", requestId: null }) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [search, nonce])

  return { items, total, loading, error, incomplete, reload }
}

export const accountsIsMock = IS_MOCK
