"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { Icon } from "@tabler/icons-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

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
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                isActive={item.url === "/" ? pathname === "/" : pathname.startsWith(item.url)}
              >
                <Link href={item.url}>
                  {item.icon ? <item.icon /> : null}
                  <span>{item.title}</span>
                  {item.badge ? (
                    <span
                      aria-label={`${item.badge} 项待处理`}
                      className="ml-auto min-w-5 rounded-full bg-destructive px-1.5 text-center text-[10px] font-semibold leading-5 text-white"
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
