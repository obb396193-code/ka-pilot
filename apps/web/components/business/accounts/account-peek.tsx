"use client"

import Link from "next/link"
import { IconArrowUpRight } from "@tabler/icons-react"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { Button } from "@/components/ui/button"
import type { DisplayMetric } from "@/lib/data/contracts"
import { accountHref, cutoffLabel, lifecycleLabel, poolStatusMap, timelineFixture, type AccountItem } from "@/lib/fixtures/accounts"
import { fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { cn } from "@/lib/utils"
import { accountStatusTone, mediaLabel } from "./account-status"
import { TimelineList } from "./timeline-list"

// 账户小传 = 行内展开（老板 09-05 定）。六张卡与工作台同一个 KpiCards；数据全部来自 GET /accounts 列表项（v1.5.1 扩展字段），不重算。
// 操作史 / 结构树 / 趋势在完整账户页；这里只给最近操作与「打开完整账户页」。
const missing = (key: string, label: string): DisplayMetric => ({ key, label, value: "−", delta: null, tone: "neutral" })
const tone = (status: "green" | "yellow" | "red" | null | undefined): DisplayMetric["tone"] => status === "green" ? "positive" : status === "yellow" ? "warning" : status === "red" ? "critical" : "neutral"

export function AccountInlinePeek({ item }: { item: AccountItem }) {
  const chip = accountStatusTone(item.assessment)
  const cutoff = item.balance?.cutoff
  const metrics: DisplayMetric[] = [
    { key: "cashCost", label: "现金消耗", value: mv(item.metrics?.cashCost, "money0"), delta: null, tone: "neutral" },
    { key: "cashCpa", label: "现金 CPA", value: rv(item.metrics?.ratios.cashCpa, "money"), delta: item.assessment?.price ? `考核 ¥${item.assessment.price.value.toFixed(2)}` : null, tone: tone(item.assessment?.costStatus) },
    { key: "realConversion", label: "真实转化", value: mv(item.metrics?.realConversion), delta: null, tone: "neutral" },
    item.balance ? { key: "balance", label: "余额", value: item.balance.value === null ? "−" : `¥${Math.round(item.balance.value).toLocaleString("zh-CN")}`, delta: cutoff ? `${cutoffLabel[cutoff.state].label}${cutoff.hours.availability === "available" ? ` · ${mv(cutoff.hours, "num")}h` : ""}` : null, tone: cutoff?.state === "critical" ? "critical" : cutoff?.state === "warning" ? "warning" : "neutral" } : missing("balance", "余额"),
    { key: "budgetCap", label: "日预算卡", value: item.dailyBudgetCap === null ? "−" : `¥${Math.round(item.dailyBudgetCap).toLocaleString("zh-CN")}`, delta: rv(item.capacityLoad) === "−" ? null : `负载 ${rv(item.capacityLoad)}`, tone: "neutral" },
    { key: "costSpace", label: "成本空间", value: mv(item.metrics?.costSpace, "money0"), delta: null, tone: "neutral" },
  ]
  const timeline = isOk(timelineFixture) && item.accountId === "account-1" ? timelineFixture.data.items.slice(0, 3) : []

  return (
    <div className="@container/main flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {item.accountName}
          <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
          <TypeChip><span className={cn("mr-1 inline-block size-1.5 rounded-full", poolStatusMap[item.poolStatus].dot)} />{poolStatusMap[item.poolStatus].label}</TypeChip>
          {item.lifecycleStage !== "unknown" ? <TypeChip>{lifecycleLabel[item.lifecycleStage]}</TypeChip> : null}
          <span className="font-mono text-[11px] font-normal text-muted-foreground">{mediaLabel(item.media)} · {item.accountId} · {item.owner?.displayName ?? "待分配"}{item.linkedTasks[0] ? ` · ${item.linkedTasks[0].taskName}` : ""}</span>
        </div>
        <Button asChild variant="outline" size="sm"><Link href={accountHref(item)}>打开完整账户页<IconArrowUpRight /></Link></Button>
      </div>
      <KpiCards metrics={metrics} className="px-0 lg:px-0" />
      <div className="grid gap-4 @5xl/main:grid-cols-12">
        <div className="rounded-xl border bg-card p-4 @5xl/main:col-span-7">
          <div className="flex items-center justify-between"><div className="text-sm font-medium">最近操作</div><span className="text-xs text-muted-foreground">{item.lastAction ? `${fmtTime(item.lastAction.at)} · ${item.lastAction.summary}` : "−"}</span></div>
          {timeline.length ? <div className="mt-3"><TimelineList items={timeline} compact /></div> : <p className="mt-2 text-xs text-muted-foreground">{item.accountId === "account-1" ? "暂无操作史" : "操作史样例只有 account-1（示例只给了部分账户）；完整账户页可看"}</p>}
        </div>
        <div className="rounded-xl border bg-card p-4 @5xl/main:col-span-5">
          <div className="text-sm font-medium">建议下一步</div>
          {item.nextSuggestion ? (
            <Button asChild variant="outline" size="sm" className="mt-2"><Link href={`/diagnostics/${item.nextSuggestion.workItemId}`}>{item.nextSuggestion.title}</Link></Button>
          ) : <p className="mt-2 text-xs text-muted-foreground">没有待处理的工作项；系统不生成假建议。</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">{item.tags.map((tag) => <TypeChip key={tag}>{tag}</TypeChip>)}{item.starred ? <TypeChip>★ 星标</TypeChip> : null}</div>
        </div>
      </div>
    </div>
  )
}
