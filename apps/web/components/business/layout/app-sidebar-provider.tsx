"use client"

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react"

import { SidebarProvider } from "@/components/ui/sidebar"

// F8-10：内网同事多是 1366×768 @125%（CSS 视口 1093px），288px 的展开侧栏会把内容挤扁。
// < 1280 默认折叠成 3rem 图标栏，≥ 1280 默认展开；**用户手动收放过就一直听用户的**。
// 用受控模式的原因：SidebarProvider 的 setOpen 每次都会写 cookie，
// 直接调它做自动折叠会把「窗口窄」记成「用户的选择」，之后再也不跟随窗口了。
const SIDEBAR_COOKIE_NAME = "sidebar_state"
const WIDE = "(min-width: 1280px)"

function readCookie(): boolean | null {
  const hit = document.cookie.split("; ").find((item) => item.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
  if (!hit) return null
  return hit.slice(SIDEBAR_COOKIE_NAME.length + 1) === "true"
}

export function AppSidebarProvider({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  // 服务端首帧按展开渲染，客户端挂载后按 cookie / 窗口宽定夺
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const manual = readCookie()
    if (manual !== null) { setOpen(manual); return }
    const query = window.matchMedia(WIDE)
    setOpen(query.matches)
    // 没手动选过时跟随窗口；一旦用户自己收放（写了 cookie）就不再接管
    const onChange = (event: MediaQueryListEvent) => { if (readCookie() === null) setOpen(event.matches) }
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  // 用户点收放：SidebarProvider 内部会写 cookie，这里只同步状态
  const onOpenChange = useCallback((next: boolean) => setOpen(next), [])

  return <SidebarProvider open={open} onOpenChange={onOpenChange} style={style}>{children}</SidebarProvider>
}
