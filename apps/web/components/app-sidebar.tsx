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
  IconInnerShadowTop,
  IconListDetails,
  IconReport,
} from "@tabler/icons-react"

import { HelpMenu } from "@/components/business/help/help-menu"
import { WorkspaceSwitcher } from "@/components/business/session/workspace-switcher"
import { NavMain } from "@/components/nav-main"
import { useSession } from "@/components/business/session/session-provider"
import { isOk } from "@/lib/fixtures/contract"
import { countsFixture } from "@/lib/fixtures/me"
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

// 九项平铺（PRD 2.1 顺序）；badge 数值 = GET /me/counts（v1.7.1 唯一计数源；mock 走 fixture me/counts.json，真实模式接口未接 → 不显）。
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

/** badge 只来自 me/counts：工作台 = 待处理工作项、自动化 = 待确认 run、集成与通知 = 未读通知；0 不显 */
function navigationWithBadges(isMock: boolean) {
  const counts = isMock && isOk(countsFixture) ? countsFixture.data : null
  if (!counts) return navigation
  const badgeFor: Record<string, number> = { "/": counts.workItems.open, "/automation": counts.runsWaitingConfirmation, "/integrations": counts.notificationsUnread }
  return navigation.map((item) => ({ ...item, badge: badgeFor[item.url] ? String(badgeFor[item.url]) : undefined }))
}

// 「设置」「治理后台(admin)」按 PRD 2.1 放头像菜单（见 nav-user）；侧栏底部只留「更多」（HelpMenu：快捷键 / 关于 / 反馈），
// 保证 1366×768（视口约 660px）九项 + 更多 + 空间切换 + 用户区不出现滚动。

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isMock } = useSession()

  return (
    <Sidebar collapsible="icon" {...props}>
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
        <NavMain items={navigationWithBadges(isMock)} />
        <HelpMenu />
      </SidebarContent>
      <SidebarFooter className="gap-2">
        <WorkspaceSwitcher />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
