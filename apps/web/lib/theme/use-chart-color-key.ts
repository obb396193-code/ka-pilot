"use client"

import { useEffect, useState } from "react"

import { useTheme } from "@/components/business/theme/theme-provider"

/**
 * 图表的重画信号。
 *
 * ECharts 的配色是在 `option()` 里**读 CSS 变量**算出来的——变量变了图不会自己知道，
 * 得有人告诉它「该重画了」。`ChartFrame` 用 `colorKey` 当这个信号。
 *
 * 之前 `colorKey` 传的是 `session.activeWorkspace.id`（空间 id）：
 * 切空间会重画，**切颜色模式 / 换主色 / 切深浅一律不重画**——图表还是上一套颜色，
 * 壳已经变了，看着就是没刷新（审查员 C 点名）。
 *
 * 所以 key = `模式|主色|深浅`。深浅是 `.dark` 类（`globals.css` 的 `@custom-variant dark`），
 * 不由本 provider 管，所以拿 MutationObserver 盯着根元素的 class。
 */
export function useChartColorKey(): string {
  const { theme } = useTheme()
  const [isDark, setDark] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const read = () => setDark(root.classList.contains("dark"))
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return `${theme.mode}|${theme.hue}|${isDark ? "dark" : "light"}`
}
