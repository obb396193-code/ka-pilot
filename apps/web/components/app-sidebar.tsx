"use client"

import * as React from "react"
import {
  IconChartBar,
  IconRocket,
  IconBriefcase,
  IconDatabase,
  IconRobot,
  IconPhoto,
  IconReportAnalytics,
  IconBooks,
  IconBell,
  IconSettings,
  IconHelp,
  IconSearch,
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

const data = {
  user: {
    name: "演示账号",
    email: "demo@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "工作台",
      url: "#",
      icon: IconBriefcase,
    },
    {
      title: "投放任务",
      url: "#",
      icon: IconRocket,
    },
    {
      title: "数据分析",
      url: "#",
      icon: IconChartBar,
    },
    {
      title: "账户资源",
      url: "#",
      icon: IconDatabase,
    },
    {
      title: "自动化",
      url: "#",
      icon: IconRobot,
    },
    {
      title: "商品素材",
      url: "#",
      icon: IconPhoto,
    },
    {
      title: "报告",
      url: "#",
      icon: IconReportAnalytics,
    },
    {
      title: "知识库",
      url: "#",
      icon: IconBooks,
    },
    {
      title: "集成与通知",
      url: "#",
      icon: IconBell,
    },
  ],
  navSecondary: [
    {
      title: "设置",
      url: "#",
      icon: IconSettings,
    },
    {
      title: "帮助",
      url: "#",
      icon: IconHelp,
    },
    {
      title: "搜索",
      url: "#",
      icon: IconSearch,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <IconRocket className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">投放管理系统</span>
                  <span className="truncate text-xs">Demo</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
