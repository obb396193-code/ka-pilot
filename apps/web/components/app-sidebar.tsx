"use client"

import * as React from "react"
import {
  LayoutDashboard,
  ListTodo,
  BarChart3,
  Server,
  Workflow,
  Package,
  FileText,
  BookOpen,
  Bell,
  ChevronRight,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const navItems = [
  {
    title: "工作台",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "投放任务",
    url: "/tasks",
    icon: ListTodo,
  },
  {
    title: "数据分析",
    url: "/data",
    icon: BarChart3,
  },
  {
    title: "账户资源",
    url: "/accounts",
    icon: Server,
  },
  {
    title: "自动化",
    url: "/automation",
    icon: Workflow,
  },
  {
    title: "商品素材",
    url: "/materials",
    icon: Package,
  },
  {
    title: "报告",
    url: "/reports",
    icon: FileText,
  },
  {
    title: "知识库",
    url: "/knowledge",
    icon: BookOpen,
  },
  {
    title: "集成与通知",
    url: "/integrations",
    icon: Bell,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center gap-2 px-2 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">投放Agent</span>
              <span className="text-xs text-muted-foreground">KA工作台</span>
            </div>
          </div>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                      <ChevronRight className="ml-auto" />
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
