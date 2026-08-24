"use client"

import Link from "next/link"
import {
  IconBell,
  IconChartBar,
  IconDashboard,
  IconDots,
  IconFileDescription,
  IconInnerShadowTop,
  IconPlugConnected,
  IconRobot,
  IconSettings,
  IconShoppingBag,
  IconTargetArrow,
  IconUsers,
} from "@tabler/icons-react"

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

const navigation = [
  { title: "工作台", url: "/", icon: IconDashboard, badge: "7" },
  { title: "投放任务", url: "/tasks", icon: IconTargetArrow },
  { title: "数据分析", url: "/data", icon: IconChartBar },
  { title: "账户池", url: "/accounts", icon: IconUsers },
  { title: "自动化", url: "/automation", icon: IconRobot },
  { title: "商品素材", url: "/materials", icon: IconShoppingBag },
  { title: "报告", url: "/reports", icon: IconFileDescription },
  { title: "知识库", url: "/knowledge", icon: IconBell },
  { title: "集成与通知", url: "/integrations", icon: IconPlugConnected, badge: "2" },
]

const secondary = [
  { title: "更多", url: "#more", icon: IconDots },
  { title: "设置", url: "#settings", icon: IconSettings },
]

const demoUser = {
  name: "快手优化师",
  email: "示例工作区",
  avatar: "/avatars/shadcn-morty-official.jpg",
}

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
      <SidebarFooter>
        <NavUser user={demoUser} />
      </SidebarFooter>
    </Sidebar>
  )
}
