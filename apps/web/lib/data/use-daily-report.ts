"use client"

import { useCallback, useEffect, useState } from "react"

import { resolveErrorMessage } from "@/lib/data/contracts"
import type { DailyReport } from "@/lib/fixtures/reports"

// F8-13：日报接真后端（BFF `GET /api/internal/reports/daily?date=&role=`，be2 Q-030 透传）。
// mock 模式不请求，页面照旧用 fixture。日期与角色都是**请求参数**——换一个就重新拉一次快照，
// 不在前端裁剪已有数据（那样会把「这天没这个模块」和「这个角色不看这个模块」混成一件事）。
export type DailyReportState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: DailyReport }
  | { status: "empty" }
  | { status: "error"; message: string; requestId: string | null }

export function useDailyReport(date: string, role: DailyReport["role"], enabled: boolean): DailyReportState & { reload: () => void } {
  const [state, setState] = useState<DailyReportState>(enabled ? { status: "loading" } : { status: "idle" })
  const [nonce, setNonce] = useState(0)
  const reload = useCallback(() => setNonce((value) => value + 1), [])

  useEffect(() => {
    if (!enabled) { setState({ status: "idle" }); return }
    let active = true
    setState({ status: "loading" })
    const query = new URLSearchParams({ date, role })
    fetch(`/api/internal/reports/daily?${query}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!active) return
        // 这一天还没生成日报 → 空态，不是故障：别让人以为系统坏了去找排障
        if (response.status === 404) { setState({ status: "empty" }); return }
        if (!response.ok || !body?.ok) {
          setState({ status: "error", message: resolveErrorMessage(body?.error?.code ?? "", body?.error?.message ?? `请求失败（${response.status}）`), requestId: body?.error?.requestId ?? null })
          return
        }
        setState({ status: "ok", data: body.data as DailyReport })
      })
      .catch((cause: unknown) => {
        if (!active) return
        setState({ status: "error", message: cause instanceof Error ? cause.message : "网络异常", requestId: null })
      })
    return () => { active = false }
  }, [date, role, enabled, nonce])

  return { ...state, reload }
}

/** 日报默认看昨天：今天的数还在跑，看了也是半截。 */
export function yesterdayInShanghai(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
  return formatter.format(new Date(now.getTime() - 24 * 60 * 60 * 1000))
}
