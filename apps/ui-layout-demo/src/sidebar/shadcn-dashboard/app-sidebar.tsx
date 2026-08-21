"use client";

import * as React from "react";
import {
  IconCamera,
  IconChartBar,
  IconDashboard,
  IconDatabase,
  IconFileWord,
  IconFolder,
  IconHelp,
  IconInnerShadowTop,
  IconListDetails,
  IconReport,
  IconSearch,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";

import { NavDocuments } from "@/sidebar/shadcn-dashboard/nav-documents";
import { NavMain } from "@/sidebar/shadcn-dashboard/nav-main";
import { NavSecondary } from "@/sidebar/shadcn-dashboard/nav-secondary";
import { NavUser } from "@/sidebar/shadcn-dashboard/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/sidebar/shadcn-dashboard/ui/sidebar";

const data = {
  user: {
    name: "演示优化师",
    email: "demo@company.local",
    avatar: "/avatars/morty-account-user-provided.png",
  },
  navMain: [
    {
      title: "工作台",
      url: "#",
      icon: IconDashboard,
    },
    {
      title: "投放任务",
      url: "#",
      icon: IconListDetails,
    },
    {
      title: "数据分析",
      url: "#",
      icon: IconChartBar,
    },
    {
      title: "账户资源",
      url: "#",
      icon: IconFolder,
    },
    {
      title: "团队协作",
      url: "#",
      icon: IconUsers,
    },
  ],
  navSecondary: [
    {
      title: "系统设置",
      url: "#",
      icon: IconSettings,
    },
    {
      title: "帮助中心",
      url: "#",
      icon: IconHelp,
    },
    {
      title: "全局搜索",
      url: "#",
      icon: IconSearch,
    },
  ],
  documents: [
    {
      name: "商品素材",
      url: "#",
      icon: IconCamera,
    },
    {
      name: "报告中心",
      url: "#",
      icon: IconReport,
    },
    {
      name: "知识库",
      url: "#",
      icon: IconFileWord,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="#">
                <IconInnerShadowTop className="size-5!" />
                <span className="text-base font-semibold">KA Pilot</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavDocuments items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
