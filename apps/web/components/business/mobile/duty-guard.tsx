"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconDeviceMobileMessage } from "@tabler/icons-react"

// F8-1 移动端值班最小路径（PRD P1）：手机上只保三件事——
// ① 看工作项详情、② 确认变更集（工作项里的弹层）、③ 看数据是否新鲜（顶栏健康条，全站都有）。
// 其余页在 <md 顶部挂一条「请到桌面处理」，并隐藏页面级写入口（新建 / 批量 / 导入这类）。
// 只做加法：不改任何页面的 DOM 结构，桌面端（≥md）完全不受影响。
const MOBILE_ALLOWED = ["/work-items", "/diagnostics"]

export function isMobileDutyPath(pathname: string) {
  return MOBILE_ALLOWED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function MobileDutyBanner() {
  const pathname = usePathname()
  if (isMobileDutyPath(pathname)) return null
  return (
    <div className="flex items-start gap-2 border-b bg-muted/60 px-4 py-2.5 text-xs md:hidden" role="status">
      <IconDeviceMobileMessage className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="text-muted-foreground">
        手机上只做值班三件事：看工作项、确认变更集、看数据是否新鲜。这一页的新建 / 批量操作请到电脑上处理。
        <Link href="/" className="ml-1 font-medium text-foreground underline underline-offset-2">回工作台</Link>
      </p>
    </div>
  )
}

/** 包住内容区：非值班路径 + 窄屏时，隐藏带 data-write-actions 的页面级写入口（样式在 globals.css） */
export function MobileDutyScope({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return <div data-mobile-duty={isMobileDutyPath(pathname) ? "allowed" : "restricted"} className="flex flex-1 flex-col">{children}</div>
}
