"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconCirclePlusFilled, IconGitBranch, IconSearch, IconSend, IconTargetArrow, type Icon } from "@tabler/icons-react"

import { openCommandPalette } from "@/components/business/command/events"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// 创建类端点（任务 / 派发 / 变更集）一期只读未开放：入口保留，项禁用并注明。
const quickCreate = [
  { title: "新建任务", icon: IconTargetArrow },
  { title: "派发工作项", icon: IconSend },
  { title: "生成变更集", icon: IconGitBranch },
]

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: Icon
    badge?: string
  }[]
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  tooltip="快速新建"
                  className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground data-[state=open]:bg-primary/90 data-[state=open]:text-primary-foreground"
                >
                  <IconCirclePlusFilled />
                  <span>快速新建</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} className="w-(--radix-dropdown-menu-trigger-width) min-w-52 rounded-lg">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">创建入口将在写接口开放后启用</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {quickCreate.map((entry) => (
                  <DropdownMenuItem key={entry.title} disabled>
                    <entry.icon />
                    {entry.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
              aria-label="全局搜索与 Agent（⌘K）"
              onClick={openCommandPalette}
            >
              <IconSearch />
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => {
            const active = item.url === "/" ? pathname === "/" : pathname.startsWith(item.url)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={active}>
                  <Link href={item.url}>
                    {item.icon ? <item.icon /> : null}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
                {item.badge ? <SidebarMenuBadge aria-label={`${item.badge} 项待处理`}>{item.badge}</SidebarMenuBadge> : null}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
