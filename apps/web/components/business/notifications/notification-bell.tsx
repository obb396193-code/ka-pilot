"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { IconAlertTriangle, IconBell, IconChecks, IconGavel, IconInbox, IconInfoCircle, IconPlayerPlay, IconSend } from "@tabler/icons-react"

import { StatusChip } from "@/components/business/data-grid/data-grid"
import { useSession } from "@/components/business/session/session-provider"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fmtTime, isOk } from "@/lib/fixtures/contract"
import { notificationKindLabel, notificationTone, notificationsFixture, type NotificationItem } from "@/lib/fixtures/me"

// 顶栏通知铃：读统一通知流（G10 / 契约 v1.7.8 `GET /me/notifications`，未读数与 me/counts 同源）。
// 标已读走 `POST /me/notifications/read`；接口接入前先在本地置灰未读数，不造数。
const kindIcon: Record<NotificationItem["kind"], typeof IconBell> = {
  alert: IconAlertTriangle,
  approval: IconGavel,
  dispatch: IconSend,
  run: IconPlayerPlay,
  system: IconInfoCircle,
}

export function NotificationBell() {
  const { isMock } = useSession()
  const [open, setOpen] = useState(false)
  const [readAll, setReadAll] = useState(false)

  const data = isMock && isOk(notificationsFixture) ? notificationsFixture.data : null
  const items = useMemo<NotificationItem[]>(() => (data ? [...data.items].sort((a, b) => b.at.localeCompare(a.at)) : []), [data])
  const unread = readAll ? 0 : data?.unread ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={unread ? `通知，${unread} 条未读` : "通知"}
              className="relative inline-flex size-8 items-center justify-center rounded-full border bg-background transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <IconBell className="size-4" />
              {unread ? <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-status-critical px-1 text-[10px] leading-4 font-medium text-white tabular-nums">{unread > 99 ? "99+" : unread}</span> : null}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">通知：告警 / 待审批 / 派给我 / 运行 / 系统</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={8} className="w-90 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="text-sm font-medium">通知{unread ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unread} 条未读</span> : null}</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!unread} onClick={() => setReadAll(true)}><IconChecks className="size-3.5" />全部标已读</Button>
        </div>
        <Separator />
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-3 py-10 text-center">
              <IconInbox className="size-6 text-muted-foreground" />
              <p className="text-sm">没有待处理的通知</p>
              <p className="text-xs text-muted-foreground">告警、待你审批的、派给你的活都会出现在这儿。</p>
            </div>
          ) : items.map((item) => {
            const Icon = kindIcon[item.kind]
            const isUnread = !item.read && !readAll
            return (
              <Link key={item.id} href={item.href} onClick={() => setOpen(false)} className="flex gap-2.5 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/60">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <StatusChip tone={notificationTone[item.severity]}>{notificationKindLabel[item.kind]}</StatusChip>
                    <span className={cnUnread(isUnread)}>{item.title}</span>
                  </div>
                  {item.body ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.body}</p> : null}
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-muted-foreground tabular-nums">{fmtTime(item.at).slice(5)}</span>
                  {isUnread ? <span className="size-1.5 rounded-full bg-status-critical" aria-label="未读" /> : null}
                </span>
              </Link>
            )
          })}
        </div>
        <Separator />
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] text-muted-foreground">免打扰时段只压 P1 / P2</span>
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs"><Link href="/integrations?tab=messages" onClick={() => setOpen(false)}>查看全部</Link></Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const cnUnread = (unread: boolean) => (unread ? "truncate text-sm font-medium" : "truncate text-sm")
