"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { IconAlertTriangle, IconBell, IconChecks, IconInbox, IconSend, IconGavel } from "@tabler/icons-react"

import { StatusChip } from "@/components/business/data-grid/data-grid"
import { useSession } from "@/components/business/session/session-provider"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fmtTime, isOk } from "@/lib/fixtures/contract"
import { countsFixture } from "@/lib/fixtures/me"
import { alertsStreamFixture, approvalsFixture, dispatchesFixture, severityMeta } from "@/lib/fixtures/workbench"

// 顶栏通知铃：未读数唯一来源 = me/counts；下拉汇总三类真会打断人的事——升级中的告警 / 派给我的活 / 等我审批。
// 统一的「通知流」端点契约里还没有（已写 inbox-arch），所以这里按现有三个来源合并，时间倒序，不造数。
type Item = { id: string; kind: "alert" | "dispatch" | "approval"; title: string; hint: string; at: string; href: string; tone: "critical" | "warning" | "muted" | "success" | "pending" }

const kindMeta: Record<Item["kind"], { label: string; icon: typeof IconBell }> = {
  alert: { label: "告警", icon: IconAlertTriangle },
  dispatch: { label: "派给我", icon: IconSend },
  approval: { label: "待审批", icon: IconGavel },
}

export function NotificationBell() {
  const { isMock } = useSession()
  const [open, setOpen] = useState(false)
  const [readAt, setReadAt] = useState<string | null>(null)

  const counts = isMock && isOk(countsFixture) ? countsFixture.data : null
  const items = useMemo<Item[]>(() => {
    if (!isMock) return []
    const list: Item[] = []
    if (isOk(alertsStreamFixture)) {
      for (const alert of alertsStreamFixture.data.items) {
        if (alert.status === "closed") continue
        list.push({
          id: alert.escalationId, kind: "alert", title: alert.title,
          hint: `${severityMeta[alert.severity].label} · ${alert.status === "acked" ? `${alert.ackBy?.name ?? "他人"}已认领` : "无人认领"}`,
          at: alert.escalateAt, href: `/diagnostics/${alert.workItemId}`,
          tone: alert.severity === "P0" ? "critical" : alert.severity === "P1" ? "warning" : "muted",
        })
      }
    }
    if (isOk(dispatchesFixture)) {
      for (const dispatch of dispatchesFixture.data.received) {
        if (dispatch.receipt) continue
        list.push({
          id: dispatch.dispatchId, kind: "dispatch", title: dispatch.acceptanceCriteria,
          hint: `${dispatch.from.name} 派给你${dispatch.slaDue ? ` · ${fmtTime(dispatch.slaDue)} 前回执` : ""}`,
          at: dispatch.slaDue ?? "", href: `/diagnostics/${dispatch.workItemId}`, tone: "pending",
        })
      }
    }
    if (isOk(approvalsFixture)) {
      for (const approval of approvalsFixture.data.toApprove) {
        if (approval.status !== "pending") continue
        list.push({
          id: approval.approvalId, kind: "approval", title: approval.title,
          hint: `${approval.requester?.name ?? "他人"} 申请${approval.autoPass ? " · 命中自动通过" : ""}`,
          at: approval.createdAt, href: "/?tab=collab", tone: "warning",
        })
      }
    }
    return list.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
  }, [isMock])

  const unread = readAt ? 0 : counts?.notificationsUnread ?? 0

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
        <TooltipContent side="bottom">通知：告警 / 派给我的活 / 等我审批</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" sideOffset={8} className="w-90 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="text-sm font-medium">通知{unread ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unread} 条未读</span> : null}</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!unread} onClick={() => setReadAt(new Date().toISOString())}><IconChecks className="size-3.5" />全部标已读</Button>
        </div>
        <Separator />
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-3 py-10 text-center">
              <IconInbox className="size-6 text-muted-foreground" />
              <p className="text-sm">没有待处理的通知</p>
              <p className="text-xs text-muted-foreground">告警、派给你的活、等你审批的都会出现在这儿。</p>
            </div>
          ) : items.map((item) => {
            const Icon = kindMeta[item.kind].icon
            return (
              <Link key={`${item.kind}-${item.id}`} href={item.href} onClick={() => setOpen(false)} className="flex gap-2.5 border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/60">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><StatusChip tone={item.tone}>{kindMeta[item.kind].label}</StatusChip><span className="truncate text-sm">{item.title}</span></div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.hint}</p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{item.at ? fmtTime(item.at).slice(5) : "−"}</span>
              </Link>
            )
          })}
        </div>
        <Separator />
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] text-muted-foreground">免打扰时段只压 P1 / P2</span>
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs"><Link href="/integrations?tab=oncall" onClick={() => setOpen(false)}>值守与推送设置</Link></Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
