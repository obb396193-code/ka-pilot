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
  title, description, kinds, kind, onKindChange, colorKey, height = 260, option, empty, dataKey, className,
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
  /** 没有数据时显示这句（空图比空话更让人困惑） */
  empty?: string | null
  /** 数据指纹：变了就重设 option。不给的话换了窗口图不会重画（审查员 D ⑱） */
  dataKey?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof init> | null>(null)
  const labelId = useId()

  // 实例只建一次，之后只 setOption——每次重建会闪一下，而且 dispose/init 交错时
  // 容易和 React 的卸载撞在一起（就是那个 removeChild 报错的来源之一）
  useEffect(() => {
    if (!ref.current) return
    const element = ref.current
    const chart = init(element)
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => {
      observer.disconnect()
      chartRef.current = null
      // dispose 会把 ECharts 自己塞进容器的 canvas 拆掉。必须在 React 卸载这个容器**之前**做完，
      // 否则 React 去删已经不在的子节点就是 `removeChild ... not a child of this node`。
      chart.dispose()
    }
  }, [])

  // 数据/图型/主题变了只重设 option。`notMerge: true`：换窗口后系列变少时，
  // 不清掉旧配置的话上一次的 series 会残留在图上（审查员 D ⑱）。
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || empty || !ref.current) return
    chart.setOption(option(ref.current, kind), { notMerge: true })
    // option 是每次渲染新建的闭包，放进依赖会每帧重设；用 kind/colorKey/dataKey 做重画信号
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, colorKey, dataKey, empty])

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
      {/*
        ★两个分支必须各带 key：不带 key 时 React 会**复用同一个 DOM 节点**，
        而图表容器里的 canvas 是 ECharts 自己塞进去的——React 去调和它不拥有的子节点，
        就报 `Failed to execute 'removeChild' on 'Node'`（老板 2026-09-10 撞到的整页崩溃）。
        给了 key，两边就是两个独立节点，各自干净地挂载/卸载。
        图表容器**永远挂着**（空态只是盖在上面），这样实例不会因为一次空数据就被销毁重建。
      */}
      <div key="chart" ref={ref} aria-labelledby={labelId} role="img" style={{ height }} hidden={Boolean(empty)} />
      {empty
        ? <div key="empty" className="grid rounded-lg border border-dashed text-center text-xs text-muted-foreground" style={{ height }}><span className="self-center">{empty}</span></div>
        : null}
    </div>
  )
}
