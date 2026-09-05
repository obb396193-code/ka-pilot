"use client"

import { useState } from "react"
import Link from "next/link"
import { IconBulb, IconCircleCheck, IconInfoCircle } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AnomalySummary } from "@/lib/data/contracts"
import { cn } from "@/lib/utils"
import { SeverityBadge } from "./severity-badge"
import { WorkItemActions } from "./work-item-actions"

type Level = "P0" | "P1" | "opportunity"
type Filter = "all" | Level
const levelOf = (item: AnomalySummary): Level => (item.severity === "critical" ? "P0" : item.severity === "warning" ? "P1" : "opportunity")
const levelLabel: Record<Level, string> = { P0: "P0", P1: "P1", opportunity: "机会" }
const levelBar: Record<Level, string> = { P0: "bg-status-critical", P1: "bg-status-warning", opportunity: "bg-status-success" }
const filters: Filter[] = ["all", "P0", "P1", "opportunity"]

// 母版 DataTable 外壳（tabs + 卡片容器）；行渲染换成 PRD 四件套：户 / 为什么 / 建议 / 入口。
export function QueueCard({
  items,
  disabled,
  isMock,
  healthyMessage,
}: {
  items: AnomalySummary[]
  disabled: boolean
  isMock: boolean
  healthyMessage: string
}) {
  const [filter, setFilter] = useState<Filter>("all")
  const counts = items.reduce<Record<Level, number>>((acc, item) => { acc[levelOf(item)] += 1; return acc }, { P0: 0, P1: 0, opportunity: 0 })
  const visible = filter === "all" ? items : items.filter((item) => levelOf(item) === filter)

  return (
    <Card>
      <CardHeader>
        <CardTitle>今日待处理队列</CardTitle>
        <CardDescription>按严重度排序；每一项都带证据、归因与建议动作</CardDescription>
        <CardAction>
          <Badge variant="outline">{items.length} 个优先项</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)} className="gap-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="queue-filter" className="sr-only">队列分类</Label>
            <Select value={filter} onValueChange={(value) => setFilter(value as Filter)}>
              <SelectTrigger className="flex w-fit @3xl/main:hidden" size="sm" id="queue-filter">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="P0">P0</SelectItem>
                <SelectItem value="P1">P1</SelectItem>
                <SelectItem value="opportunity">机会</SelectItem>
              </SelectContent>
            </Select>
            <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:px-1 **:data-[slot=badge]:bg-muted-foreground/30 @3xl/main:flex">
              {filters.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {value === "all" ? "全部" : levelLabel[value]}
                  {value !== "all" ? <Badge variant="secondary">{counts[value]}</Badge> : null}
                </TabsTrigger>
              ))}
            </TabsList>
            <span className="hidden text-xs text-muted-foreground @3xl/main:inline">{isMock ? "脱敏示例" : "规则命中"}</span>
          </div>

          <div className="flex flex-col gap-3">
            {visible.map((item) => {
              const level = levelOf(item)
              return (
                <article key={item.id} className="relative grid gap-4 rounded-xl border bg-card p-4 pl-6 @3xl/main:grid-cols-[minmax(190px,0.55fr)_minmax(0,1.3fr)_auto]">
                  <span aria-hidden className={cn("absolute inset-y-4 left-2.5 w-1 rounded-full", levelBar[level])} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge level={level} />
                      <span className="truncate text-xs text-muted-foreground">{item.title}</span>
                    </div>
                    <Link href={`/accounts/${item.accountId}?media=${encodeURIComponent(item.media)}`} className="mt-2 block truncate font-medium underline-offset-4 hover:underline">
                      {item.accountName}
                    </Link>
                    <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{item.media} · {item.accountId}</div>
                  </div>
                  <dl className="grid min-w-0 content-start gap-1.5 text-sm">
                    <div className="flex gap-3"><dt className="w-8 shrink-0 text-muted-foreground">证据</dt><dd className="min-w-0 font-medium tabular-nums">{item.evidence}</dd></div>
                    <div className="flex gap-3"><dt className="w-8 shrink-0 text-muted-foreground">归因</dt><dd className="flex min-w-0 items-start gap-1 text-muted-foreground"><IconInfoCircle className="mt-0.5 size-3.5 shrink-0" /><span>{item.attribution}</span></dd></div>
                    <div className="flex gap-3"><dt className="w-8 shrink-0 text-muted-foreground">建议</dt><dd className="flex min-w-0 items-start gap-1"><IconBulb className="mt-0.5 size-3.5 shrink-0 text-status-warning" /><span>{item.suggestedAction}</span></dd></div>
                  </dl>
                  <WorkItemActions accountName={item.accountName} suggestion={item.suggestedAction} disabled={disabled} evidenceHref={item.findingId ? `/diagnostics/${item.findingId}` : null} />
                </article>
              )
            })}
            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
                {items.length === 0 ? "今天没有需要处理的账户" : "该分类下暂无待处理项"}
              </div>
            ) : null}
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              <IconCircleCheck className="size-4 shrink-0 text-status-success" />
              <span>{healthyMessage}</span>
            </div>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  )
}
