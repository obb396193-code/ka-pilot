"use client"

import { useEffect, useId, useRef, useState } from "react"
import { BarChart, LineChart, PieChart } from "echarts/charts"
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components"
import { init, use as registerEChartsModules, type EChartsCoreOption } from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

registerEChartsModules([BarChart, LineChart, PieChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

// F8-19：图表底座。老板 v1.9.23 要求「每个图表组件带类型切换（柱/饼/环/折线），偏好记住，要美观」。
// 库用 ECharts（已在 package.json，**npm 自托管不走 CDN**——内网出网只放行两个素材域名）。

export type ChartKind = "line" | "bar" | "pie" | "donut"
export const chartKindLabel: Record<ChartKind, string> = { line: "折线", bar: "柱状", pie: "饼图", donut: "环图" }

/**
 * 读 CSS 变量并经 canvas 归一成 #hex。
 * 主题 token 是 oklch()/相对色，ECharts 自己的颜色解析不认——直接把变量名给它会画不出颜色。
 */
export function chartToken(element: HTMLElement, name: string): string {
  const raw = getComputedStyle(element).getPropertyValue(name).trim()
  const context = document.createElement("canvas").getContext("2d")
  if (!context || !raw) return raw
  context.fillStyle = raw
  return typeof context.fillStyle === "string" ? context.fillStyle : raw
}

/** 图表配色：主色 + 派生的两个色相，够分辨又不打架；不够时循环 */
export function chartPalette(element: HTMLElement): string[] {
  return [
    chartToken(element, "--kp-chart-spend"),
    chartToken(element, "--kp-chart-cpa"),
    chartToken(element, "--kp-hue-2"),
    chartToken(element, "--kp-hue-3"),
    chartToken(element, "--kp-hue-light"),
  ].filter(Boolean)
}

/**
 * 一个图表 = 标题 + 类型切换 + 画布。
 * `option(element, kind)` 每次重画时调用：**必须在回调里现取 CSS 变量**，
 * 因为换主题模式/主色只改变量，ECharts 不认变量、只在画的那一刻取到的值。
 */
export function ChartFrame({
  title, description, kinds, kind, onKindChange, colorKey, height = 260, option, empty, className,
}: {
  title: string
  description?: string
  kinds: ChartKind[]
  kind: ChartKind
  onKindChange: (kind: ChartKind) => void
  /** 主题模式 / 主色的指纹：变了就重画 */
  colorKey?: string
  height?: number
  option: (element: HTMLElement, kind: ChartKind) => EChartsCoreOption
  /** 没有数据时显示这句，且不初始化图表（空图比空话更让人困惑） */
  empty?: string | null
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const labelId = useId()

  useEffect(() => {
    if (empty || !ref.current) return
    const element = ref.current
    const chart = init(element)
    chart.setOption(option(element, kind))
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => { observer.disconnect(); chart.dispose() }
    // option 是每次渲染新建的闭包，放进依赖会每帧重建图表；用 kind/colorKey 做重画信号
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, colorKey, empty])

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p id={labelId} className="text-sm font-medium">{title}</p>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {kinds.length > 1 ? (
          <div className="flex shrink-0 items-center rounded-lg border p-0.5" role="group" aria-label={`${title}图表类型`}>
            {kinds.map((item) => (
              <Button
                key={item}
                size="sm"
                variant="ghost"
                aria-pressed={kind === item}
                className={cn("h-6 rounded-md px-2 text-xs font-normal", kind === item && "bg-foreground text-background hover:bg-foreground hover:text-background")}
                onClick={() => onKindChange(item)}
              >
                {chartKindLabel[item]}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {empty
        ? <div className="grid rounded-lg border border-dashed text-center text-xs text-muted-foreground" style={{ height }}><span className="self-center">{empty}</span></div>
        : <div ref={ref} aria-labelledby={labelId} role="img" style={{ height }} />}
    </div>
  )
}
