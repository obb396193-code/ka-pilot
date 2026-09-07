import { IconInfoCircle, IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DisplayMetric } from "@/lib/data/contracts"
import { cn } from "@/lib/utils"
import { metricDefinition } from "./metric-definitions"

const toneClass: Record<DisplayMetric["tone"], string> = {
  neutral: "",
  positive: "text-status-success",
  warning: "text-status-warning",
  critical: "text-status-critical",
}

// 总览数字去掉无意义的 .00（精确值放 title），与拍板演示一致；不改 lib/data 的格式化
function overviewValue(value: string) {
  return value.replace(/\.00(?=\D*$)/, "")
}

function deltaIcon(delta: string) {
  if (delta.startsWith("+")) return <IconTrendingUp />
  if (delta.startsWith("-") || delta.startsWith("−")) return <IconTrendingDown />
  return null
}

export type Sparkline = (number | null)[]

// 首页 KPI（老板 2026-09-05 定）：标签 + ⓘ口径 / 主数 + 环比 / 下面一条往日走势线，不放说明文字，不放分段条进度条。
// 走势线只在后端给了日序列的指标上画（现在是消耗、真实 CPA），没有的画一条虚基线占位，不造数。环比后端未给就不显示，缺数主数显「−」。
function Spark({ series, tone }: { series?: Sparkline; tone: DisplayMetric["tone"] }) {
  const points = (series ?? []).map((value, index) => [index, value] as const)
  const valid = points.filter((point): point is readonly [number, number] => point[1] !== null)
  if (valid.length < 2) {
    return <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="h-6 w-full" aria-hidden><line x1="0" y1="20" x2="100" y2="20" className="stroke-border" strokeWidth="1" strokeDasharray="2 3" /></svg>
  }
  const min = Math.min(...valid.map((p) => p[1])), max = Math.max(...valid.map((p) => p[1]))
  const span = max - min || 1
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * 100
  const y = (v: number) => 22 - ((v - min) / span) * 18
  // 缺失点断开，不连线
  const segments: string[] = []
  let current: string[] = []
  for (const [i, v] of points) {
    if (v === null) { if (current.length) segments.push(current.join(" ")); current = []; continue }
    current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  }
  if (current.length) segments.push(current.join(" "))
  const first = valid[0], last = valid[valid.length - 1]
  const area = `M${x(first[0]).toFixed(1)},26 L${valid.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" L")} L${x(last[0]).toFixed(1)},26 Z`
  const stroke = tone === "critical" ? "var(--kp-status-critical)" : "var(--kp-spark, var(--kp-chart-spend))"
  return (
    <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      <path d={area} style={{ fill: stroke, opacity: 0.1 }} />
      {segments.map((seg) => <polyline key={seg} points={seg} style={{ fill: "none", stroke, strokeWidth: 1.5 }} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />)}
    </svg>
  )
}

export function KpiCards({ metrics, sparklines = {}, className }: { metrics: DisplayMetric[]; sparklines?: Record<string, Sparkline>; className?: string }) {
  return (
    <section
      aria-label="关键经营指标"
      className={cn("grid grid-cols-2 gap-3 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @2xl/main:grid-cols-3 @5xl/main:grid-cols-6 dark:*:data-[slot=card]:bg-card", className)}
    >
      {metrics.map((metric) => {
        const definition = metricDefinition(metric.key)
        const missing = metric.value === "−"
        return (
          <Card key={metric.key} className="@container/card gap-2.5 py-4">
            <CardHeader className="gap-1 px-4">
              <CardDescription className="flex items-center gap-1.5">
                {metric.label}
                {definition ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label={`${metric.label} 口径`} className="inline-flex rounded-sm text-muted-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <IconInfoCircle className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-72">
                      <p className="font-medium">{definition.formula}</p>
                      <p className="mt-1 opacity-80">来源：{definition.source}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </CardDescription>
              <CardTitle title={metric.value} className={cn("text-[22px] font-semibold tabular-nums tracking-tight whitespace-nowrap @[220px]/card:text-2xl", missing ? "text-muted-foreground" : toneClass[metric.tone])}>
                {overviewValue(metric.value)}
              </CardTitle>
              <CardAction>
                {metric.delta ? (
                  <Badge variant="outline" className={cn("kp-tint max-w-28 tabular-nums", toneClass[metric.tone])} title={metric.delta}>
                    {deltaIcon(metric.delta)}
                    <span className="truncate">{metric.delta}</span>
                  </Badge>
                ) : (
                  // 环比后端未返回：按缺数规矩显「—」，不留空、不造数
                  <Badge variant="outline" className="text-muted-foreground" title="环比待后端返回">—</Badge>
                )}
              </CardAction>
            </CardHeader>
            <CardContent className="px-4" style={metric.key === "cpa" ? ({ "--kp-spark": "var(--kp-chart-cpa)" } as React.CSSProperties) : undefined}>
              <Spark series={sparklines[metric.key]} tone={metric.tone} />
            </CardContent>
          </Card>
        )
      })}
    </section>
  )
}
