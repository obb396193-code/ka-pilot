"use client"

import { Fragment } from "react"

import { usePathname } from "next/navigation"

import { CommandEntry } from "@/components/business/command/command-entry"
import { NotificationBell } from "@/components/business/notifications/notification-bell"
import { DataHealthBar, DataHealthPill } from "@/components/business/system/data-health-banner"
import { ThemeSwitch } from "@/components/business/theme/theme-switch"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { primaryNavigation } from "@/lib/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"

const extraTitles: [string, string][] = [["/settings", "设置"], ["/admin", "治理后台"], ["/search", "搜索"], ["/403", "没有权限"]]

// 面包屑 = 当前一级页名（+ 详情）；九项与侧栏、命令面板共用 lib/navigation
function crumbsFor(pathname: string): { href: string; title: string }[] {
  if (pathname === "/") return [{ href: "/", title: "经营工作台" }]
  if (pathname.startsWith("/work-items") || pathname.startsWith("/diagnostics")) return [{ href: "/", title: "经营工作台" }, { href: pathname, title: "工作项详情" }]
  const section = primaryNavigation.find((item) => item.url !== "/" && (pathname === item.url || pathname.startsWith(`${item.url}/`)))
  // 侧栏九项之外的页（设置 / 治理后台 / 搜索 / 403）也要有名字，否则面包屑退化成「KA Pilot」
  if (!section) {
    const extra = extraTitles.find(([url]) => pathname === url || pathname.startsWith(`${url}/`))
    return [{ href: pathname, title: extra ? extra[1] : "KA Pilot" }]
  }
  const deeper = pathname.length > section.url.length
  return deeper ? [{ href: section.url, title: section.title }, { href: pathname, title: "详情" }] : [{ href: section.url, title: section.title }]
}

export function SiteHeader() {
  const pathname = usePathname()
  const crumbs = crumbsFor(pathname)

  return (
    <>
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
        <div className="flex w-full min-w-0 items-center gap-1 px-4 lg:gap-2 lg:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb className="min-w-0 shrink">
            <BreadcrumbList className="flex-nowrap text-base whitespace-nowrap [&>li]:min-w-0 [&_a]:truncate [&_span]:truncate">
              {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1
                // Separator 是独立 <li>，必须和 BreadcrumbItem 平级（嵌套 <li> 会 hydration 失败）
                return (
                  <Fragment key={crumb.href}>
                    <BreadcrumbItem>
                      {last ? (
                        <BreadcrumbPage className="font-medium">{crumb.title}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={crumb.href}>{crumb.title}</BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {last ? null : <BreadcrumbSeparator />}
                  </Fragment>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <DataHealthPill />
            <NotificationBell />
            <ThemeSwitch />
            <CommandEntry />
          </div>
        </div>
      </header>
      <DataHealthBar />
    </>
  )
}
