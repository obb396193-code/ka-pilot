"use client"

import { useCallback, useEffect, useState } from "react"

import type { ChartKind } from "@/components/charts/chart-frame"

// F8-19（v1.9.23）：每个图表的类型偏好。契约说存 `saved_views.config.charts`——
// 那条 PUT 还没接，先落本机；接上后把 load/save 换成 `/me/views` 即可，调用方不用改。
// 本机存储会失败（无痕窗口 / 禁用站点数据），所以读写都包 try：拿不到就用默认值，不能因此白屏。
const KEY = "ka-pilot.charts"

function read(): Record<string, ChartKind> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, ChartKind> } catch { return {} }
}

export function useChartKind(id: string, fallback: ChartKind): [ChartKind, (kind: ChartKind) => void] {
  // 服务端渲染没有 localStorage，首帧一律用默认值，挂载后再纠正——否则会 hydration 不匹配
  const [kind, setKind] = useState<ChartKind>(fallback)
  useEffect(() => { const saved = read()[id]; if (saved) setKind(saved) }, [id])
  const change = useCallback((next: ChartKind) => {
    setKind(next)
    try { localStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: next })) } catch { /* 存不下就只在本次会话生效 */ }
  }, [id])
  return [kind, change]
}
