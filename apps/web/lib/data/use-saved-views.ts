"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { isOk } from "@/lib/fixtures/contract"
import { viewsFixture, type SavedView } from "@/lib/fixtures/data-analysis"

/**
 * 个人视图（F8-27，`GET/POST /api/internal/me/views`）。
 *
 * 之前「保存视图」只在内存里 push 一条：**刷新就没了**，而按钮弹的是绿色的「已保存」。
 * 和归属清洗那三个按钮同一类问题——假成功比不能用更坏，人会以为存住了。
 */

const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

export type SaveViewInput = {
  name: string
  page: SavedView["page"]
  columns: string[]
  window: { preset: string; from: string; to: string }
  filters?: Record<string, unknown>
}

export function useSavedViews(): {
  views: SavedView[]
  loading: boolean
  save: (input: SaveViewInput) => Promise<boolean>
  reload: () => void
} {
  const [views, setViews] = useState<SavedView[]>(() => (IS_MOCK && isOk(viewsFixture) ? viewsFixture.data.items : []))
  const [loading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (IS_MOCK) return
    let active = true
    setLoading(true)
    fetch("/api/internal/me/views", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: { items?: SavedView[] } } | null
        if (active && payload?.ok && Array.isArray(payload.data?.items)) setViews(payload.data.items)
      })
      .catch(() => { /* 视图列表拉不到不该挡住整页，空着就是 */ })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [nonce])

  const save = useCallback(async (input: SaveViewInput): Promise<boolean> => {
    if (IS_MOCK) {
      setViews((prev) => [{
        id: `local-${Date.now()}`, page: input.page, name: input.name,
        config: { version: "view/v1", filters: input.filters ?? {}, columns: input.columns, sort: [], window: input.window },
        isShared: false, updatedAt: new Date().toISOString(),
      } as SavedView, ...prev])
      toast("已保存视图", { description: "示例数据，改动不落库" })
      return true
    }
    try {
      const response = await fetch("/api/internal/me/views", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          page: input.page,
          name: input.name,
          config: { version: "view/v1", filters: input.filters ?? {}, columns: input.columns, sort: [], window: input.window },
        }),
      })
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: SavedView; error?: { message?: string } } | null
      if (!response.ok || !payload?.ok || !payload.data) {
        toast.error("保存视图失败", { description: payload?.error?.message ?? `请求失败（${response.status}）` })
        return false
      }
      // 用**后端回的那条**入列表，不是我本地拼的：id / updatedAt 以库为准，
      // 本地拼一条假的，下次刷新就会发现「同一个视图有两条」
      setViews((prev) => [payload.data!, ...prev])
      toast.success("已保存视图")
      return true
    } catch {
      toast.error("保存视图失败", { description: "网络异常，稍后重试" })
      return false
    }
  }, [])

  return { views, loading, save, reload }
}
