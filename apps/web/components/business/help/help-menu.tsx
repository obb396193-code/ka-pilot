"use client"

import { useState } from "react"
import { IconDots, IconInfoCircle, IconKeyboard, IconMessage2 } from "@tabler/icons-react"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

// 侧栏底部「更多」：以前是 href="#more" 的死链，点了没反应。改成菜单：快捷键 / 关于 / 反馈。
const shortcuts: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "全局搜索：任务 / 账户 / 素材 / 文档直达" },
  { keys: ["⌘", "B"], label: "收起 / 展开左侧导航" },
  { keys: ["Esc"], label: "关掉当前弹层、抽屉或命令面板" },
  { keys: ["↑", "↓"], label: "命令面板里上下选，回车打开" },
]

export function HelpMenu() {
  const [dialog, setDialog] = useState<"shortcuts" | "about" | null>(null)
  return (
    <SidebarGroup className="mt-auto">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <IconDots />
                  <span>更多</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-52">
                <DropdownMenuItem onSelect={() => setDialog("shortcuts")}><IconKeyboard />快捷键</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog("about")}><IconInfoCircle />关于 KA Pilot</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled><IconMessage2 />反馈问题（内测期直接找对接人）</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>

      <Dialog open={dialog === "shortcuts"} onOpenChange={(open) => setDialog(open ? "shortcuts" : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>快捷键</DialogTitle><DialogDescription>Windows 上把 ⌘ 换成 Ctrl。</DialogDescription></DialogHeader>
          <dl className="flex flex-col gap-2 text-sm">
            {shortcuts.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="flex shrink-0 gap-1">{item.keys.map((key) => <kbd key={key} className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{key}</kbd>)}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "about"} onOpenChange={(open) => setDialog(open ? "about" : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>关于 KA Pilot</DialogTitle><DialogDescription>快手 KA 投放经营工作台 · 内测版</DialogDescription></DialogHeader>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">用途</dt><dd>把投放里重复的看数、对账、改配置收到一处，能自动的交给规则和 Agent，需要拍板的留给人。</dd>
            <dt className="text-muted-foreground">数据边界</dt><dd>按空间隔离，只看你被授权的账户；写操作一律先出变更集，确认后才落媒体。</dd>
            <dt className="text-muted-foreground">当前阶段</dt><dd>内测，部分模块用示例数据占位（带「示例」角标的都是）。</dd>
          </dl>
        </DialogContent>
      </Dialog>
    </SidebarGroup>
  )
}
