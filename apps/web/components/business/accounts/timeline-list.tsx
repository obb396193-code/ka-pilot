"use client"

import { IconAdjustments, IconArrowsExchange, IconBellOff, IconBolt, IconCash, IconHammer, IconListCheck, IconPencilDollar, IconSend, IconServer, IconUserCheck } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { fmtTime, mv, rv } from "@/lib/fixtures/contract"
import type { TimelineItem } from "@/lib/fixtures/accounts"
import { cn } from "@/lib/utils"

// 操作史（v1.5 4.3 十种 kind + pool_status）：倒序流；T+1 回收结果挂在项下
const kindMeta: Record<TimelineItem["kind"], { label: string; icon: typeof IconBolt }> = {
  changeset: { label: "变更集", icon: IconAdjustments },
  external_change: { label: "后台手动", icon: IconServer },
  assessment_price: { label: "考核价", icon: IconPencilDollar },
  daily_budget_cap: { label: "日预算卡", icon: IconCash },
  dispatch: { label: "派发", icon: IconSend },
  work_item: { label: "工作项", icon: IconListCheck },
  escalation: { label: "升级", icon: IconBolt },
  infra: { label: "基建", icon: IconHammer },
  transfer: { label: "交接", icon: IconArrowsExchange },
  mute: { label: "静音", icon: IconBellOff },
  pool_status: { label: "账户状态", icon: IconUserCheck },
}

export function TimelineList({ items, compact = false }: { items: TimelineItem[]; compact?: boolean }) {
  return (
    <ol className={cn("relative flex flex-col", compact ? "gap-2" : "gap-3")}>
      {items.map((item, index) => {
        const meta = kindMeta[item.kind] ?? { label: item.kind, icon: IconBolt }
        const Icon = meta.icon
        const actor = item.actor == null ? "−" : typeof item.actor === "string" ? (item.actor === "system" ? "系统" : "外部") : item.actor.name
        return (
          <li key={`${item.at}-${index}`} className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card"><Icon className="size-3.5 text-muted-foreground" /></span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className={cn("px-1.5 text-muted-foreground", item.kind === "external_change" && "text-status-warning")}>{meta.label}</Badge>
                <span className="font-medium">{item.summary}</span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">{fmtTime(item.at)} · {actor}</div>
              {!compact && item.t1Result ? (
                <div className="mt-1 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span className="font-medium">T+1 回收</span> · 现金 CPA {rv(item.t1Result.metricDeltas.cashCpa, "money")} · 消耗 {mv(item.t1Result.metricDeltas.cost, "money0")} · 真实转化 {mv(item.t1Result.metricDeltas.realConversion)}{item.t1Result.note ? ` · ${item.t1Result.note}` : ""}
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
