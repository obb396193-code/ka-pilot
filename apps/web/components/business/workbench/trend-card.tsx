"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { IconChartLine } from "@tabler/icons-react"

import { SpendRealCpaTrend } from "@/components/charts/spend-real-cpa-trend"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { WorkbenchData } from "@/lib/data/contracts"

export type TrendRange = "7d" | "30d" | "90d"
const rangeDays: Record<TrendRange, number> = { "7d": 7, "30d": 30, "90d": 90 }
const rangeLabel: Record<TrendRange, string> = { "7d": "近 7 天", "30d": "近 30 天", "90d": "近 3 个月" }

const shanghaiDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
const DAY_MS = 86_400_000
const BUSINESS_DAY_CUTOFF_MS = 3 * 60 * 60 * 1_000 // 与 lib/data/data-view.ts 日切一致：03:00 前报告日 = 前日

function businessDate(now = new Date()) { return shanghaiDay.format(new Date(now.getTime() - BUSINESS_DAY_CUTOFF_MS)) }
function daysBetween(from: string, to: string) { return Math.round((Date.parse(`${to}T00:00:00+08:00`) - Date.parse(`${from}T00:00:00+08:00`)) / DAY_MS) + 1 }

/** 从 URL 的 date_from/date_to 推回当前时间段；无参数即近 7 天。 */
export function readTrendRange(from: string | undefined, to: string | undefined): TrendRange {
  if (!from || !to) return "7d"
  const days = daysBetween(from, to)
  if (days >= 60) return "90d"
  if (days >= 20) return "30d"
  return "7d"
}

// 母版 ChartAreaInteractive 外壳：标题 / 说明 / 时间段切换（宽屏 ToggleGroup、窄屏 Select）；图体换 ECharts。
export function TrendCard({ data, range, dataAsOf, colorKey }: { data: WorkbenchData["trend"]; range: TrendRange; dataAsOf: string | null; colorKey?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function apply(next: string) {
    if (!next || !(next in rangeDays)) return
    const to = businessDate()
    const from = shanghaiDay.format(new Date(Date.parse(`${to}T00:00:00+08:00`) - (rangeDays[next as TrendRange] - 1) * DAY_MS))
    const params = new URLSearchParams(searchParams.toString())
    params.delete("date"); params.delete("start"); params.delete("end")
    params.set("date_from", from); params.set("date_to", to)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>消耗与真实 CPA</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">{rangeLabel[range]} · 左轴消耗、右轴真实 CPA · 缺失点留空，不补 0</span>
          <span className="@[540px]/card:hidden">{rangeLabel[range]}</span>
        </CardDescription>
        <CardAction>
          <ToggleGroup type="single" value={range} onValueChange={apply} variant="outline" className="hidden *:data-[slot=toggle-group-item]:px-4! @[600px]/card:flex">
            <ToggleGroupItem value="90d">近 3 个月</ToggleGroupItem>
            <ToggleGroupItem value="30d">近 30 天</ToggleGroupItem>
            <ToggleGroupItem value="7d">近 7 天</ToggleGroupItem>
          </ToggleGroup>
          <Select value={range} onValueChange={apply}>
            <SelectTrigger className="flex w-36 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[600px]/card:hidden" size="sm" aria-label="选择时间范围">
              <SelectValue placeholder="近 7 天" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="90d" className="rounded-lg">近 3 个月</SelectItem>
              <SelectItem value="30d" className="rounded-lg">近 30 天</SelectItem>
              <SelectItem value="7d" className="rounded-lg">近 7 天</SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {data.length ? (
          <SpendRealCpaTrend data={data} colorKey={colorKey} />
        ) : (
          <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
            <IconChartLine className="size-5" />
            <span>所选时间段还没有趋势数据</span>
          </div>
        )}
        {dataAsOf ? <p className="mt-2 text-right text-[11px] text-muted-foreground">数据截至 {dataAsOf}</p> : null}
      </CardContent>
    </Card>
  )
}
