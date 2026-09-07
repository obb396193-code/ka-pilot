"use client"

import Link from "next/link"
import {
  IconAutomation,
  IconBellRinging,
  IconBook2,
  IconCamera,
  IconChartBar,
  IconDashboard,
  IconDatabase,
  IconDots,
  IconInnerShadowTop,
  IconListDetails,
  IconReport,
} from "@tabler/icons-react"

import { WorkspaceSwitcher } from "@/components/business/session/workspace-switcher"
import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// 九项平铺（PRD 2.1 顺序）；badge 插槽保留，数值由后端计数接入后填，不写死示例数。
const navigation = [
  { title: "工作台", url: "/", icon: IconDashboard },
  { title: "投放任务", url: "/tasks", icon: IconListDetails },
  { title: "数据分析", url: "/data", icon: IconChartBar },
  { title: "账户池", url: "/accounts", icon: IconDatabase },
  { title: "自动化", url: "/automation", icon: IconAutomation },
  { title: "商品素材", url: "/materials", icon: IconCamera },
  { title: "报告", url: "/reports", icon: IconReport },
  { title: "知识库", url: "/knowledge", icon: IconBook2 },
  { title: "集成与通知", url: "/integrations", icon: IconBellRinging },
]

// 「设置」「治理后台(admin)」按 PRD 2.1 放头像菜单（见 nav-user）；侧栏底部只留「更多」，
// 保证 1366×768（视口约 660px）九项 + 更多 + 空间切换 + 用户区不出现滚动。
const secondary = [{ title: "更多", url: "#more", icon: IconDots }]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link href="/">
                <IconInnerShadowTop className="size-5!" />
                <span className="text-base font-semibold">KA Pilot</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navigation} />
        <NavSecondary items={secondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter className="gap-2">
        <WorkspaceSwitcher />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
