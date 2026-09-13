"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { ChartKind } from "@/components/charts/chart-frame"

/**
 * 每个图表组件的图型偏好（契约 v1.9.29：存 `saved_views.config.charts`）。
 *
 * **本机先写、后端异步落**（F8-27）：
 * 切图型是个高频小动作，等一次网络往返再变会明显发涩；而这个偏好丢了也不致命。
 * 所以本机 localStorage 立刻生效、界面秒响应，同时把整份偏好 PATCH 上去；
 * 失败**不打扰用户**——为「图型没记住」弹个红条，比这件事本身更烦。
 *
 * 换设备能不能带过去，取决于后端那次 PATCH 成没成——所以两边都写，不是只写一边。
 * localStorage 会失败（无痕窗口 / 禁用站点数据），读写都包 try：拿不到就用默认值，不能白屏。
 */

const KEY = "ka-pilot.charts"
const IS_MOCK = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"

function read(): Record<string, ChartKind> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, ChartKind> } catch { return {} }
}

/** 偏好挂在哪个视图上。没有专属视图时用页面自己的 key——后端按 `page` 找得到。 */
let viewIdCache: string | null = null

async function persist(charts: Record<string, ChartKind>): Promise<void> {
  if (IS_MOCK) return
  try {
    if (!viewIdCache) {
      const response = await fetch("/api/internal/me/views", { credentials: "same-origin", headers: { accept: "application/json" } })
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; data?: { items?: { id: string; page: string }[] } } | null
      // 挂在概览那张视图上；没有就不落库（不替用户凭空建一张视图——那会出现在他的视图列表里）
      viewIdCache = payload?.data?.items?.find((item) => item.page === "data.table")?.id ?? null
    }
    if (!viewIdCache) return
    await fetch(`/api/internal/me/views/${encodeURIComponent(viewIdCache)}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ config: { version: "view/v1", charts } }),
    })
  } catch {
    // 静默：图型没记住不值得打断用户；本机那份已经生效了
  }
}

export function useChartKind(id: string, fallback: ChartKind): [ChartKind, (kind: ChartKind) => void] {
  // 服务端渲染没有 localStorage，首帧一律用默认值，挂载后再纠正——否则 hydration 不匹配
  const [kind, setKind] = useState<ChartKind>(fallback)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { const saved = read()[id]; if (saved) setKind(saved) }, [id])

  const change = useCallback((next: ChartKind) => {
    setKind(next)
    const merged = { ...read(), [id]: next }
    try { localStorage.setItem(KEY, JSON.stringify(merged)) } catch { /* 存不下就只在本次会话生效 */ }
    // 连点几下图型只发最后一次：每点一下打一次 PATCH 是没必要的写放大
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void persist(merged) }, 800)
  }, [id])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return [kind, change]
}
