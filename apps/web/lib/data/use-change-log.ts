"use client"

import { useEffect, useState } from "react"

import type { ChangeLogItem } from "@/lib/fixtures/tasks"

/**
 * 某个任务的考核价变更记录（arch B，`GET /api/internal/settings/change-log`，Codex 已接通）。
 *
 * 两个字段**可以是 null**，界面必须扛住：
 * · `changedBy` —— 老行没有变更人（迁移前就存在的数据），显「—」；
 * · `at` —— 时间未知时后端给 null，**不伪造迁移时间**。所以排序用生效日，
 *   时间列显「—」；按 `at` 排会把老行全甩到一头，显成 1970 更是错的。
 */

const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

export function useChangeLog(taskId: string, enabled: boolean): {
  items: ChangeLogItem[] | null
  loading: boolean
  error: string | null
} {
  const [items, setItems] = useState<ChangeLogItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 弹层没打开就不查——变更记录只有点开「历史」才看得到
    if (IS_MOCK || !enabled || !taskId) return
    let active = true
    setLoading(true)
    setError(null)
    const search = new URLSearchParams({ kinds: "assessment_price", task_id: taskId })
    fetch(`/api/internal/settings/change-log?${search}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          { ok?: boolean; data?: { items?: ChangeLogItem[] }; error?: { message?: string } } | null
        if (!active) return
        if (!payload?.ok || !Array.isArray(payload.data?.items)) {
          setError(payload?.error?.message ?? `读取变更记录失败（HTTP ${response.status}）`)
          return
        }
        setItems(payload.data.items)
      })
      .catch(() => { if (active) setError("网络异常，稍后重试") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [taskId, enabled])

  return { items, loading, error }
}

export const changeLogIsMock = IS_MOCK
