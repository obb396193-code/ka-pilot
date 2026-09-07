"use client"

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react"

import { applyTheme, DEFAULT_THEME, HEX_PATTERN, readStoredTheme, storeTheme, type ThemeMode, type ThemeState } from "@/lib/theme/theme"

type ThemeContextValue = {
  theme: ThemeState
  setMode(mode: ThemeMode): void
  setHue(hex: string): void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// 现在存浏览器 localStorage；正式版应记在用户账号（契约缺口已写 inbox-arch）。
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeState>(DEFAULT_THEME)

  useEffect(() => { setTheme(readStoredTheme()) }, [])
  // 用 layout effect：必须早于子组件的 useEffect（ECharts 在 effect 里读 CSS 变量重画），否则切主题时图表拿到旧色
  useLayoutEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => { storeTheme(theme) }, [theme])

  const setMode = useCallback((mode: ThemeMode) => setTheme((current) => ({ ...current, mode })), [])
  const setHue = useCallback((hex: string) => {
    if (!HEX_PATTERN.test(hex)) return
    setTheme((current) => ({ ...current, hue: hex.toLowerCase() }))
  }, [])

  const value = useMemo(() => ({ theme, setMode, setHue }), [theme, setMode, setHue])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error("useTheme must be used inside ThemeProvider")
  return value
}
