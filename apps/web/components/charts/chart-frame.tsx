"use client"

import { useEffect, useId, useRef, useState } from "react"
import { BarChart, LineChart, PieChart } from "echarts/charts"
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components"
import { init, use as registerEChartsModules, type EChartsCoreOption } from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"
import { LabelLayout, UniversalTransition } from "echarts/features"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// UniversalTransition：柱↔折↔饼切换时让图元**接着变形**而不是整张重画。
// 没有它，`notMerge: true` 的一次 setOption 就是「旧图消失、新图出现」——闪一下（审查员 C 点名）。
registerEChartsModules([BarChart, LineChart, PieChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer, LabelLayout, UniversalTransition])

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

/**
 * 图表配色，读 `--chart-1..5`。
 *
 * ★这五个 token 是**跟着颜色模式走**的：黑白模式下它们是灰阶，彩色模式下才是主色系。
 * 之前这里读的是 `--kp-hue-2/3/light`——那几个不管什么模式**永远是彩的**，
 * 于是选了「黑白」壳变了、图还是花的（审查员 C 点名）。
 * 换配色时优先改 `globals.css` 里各模式的 `--chart-*`，别在这里挑变量。
 */
export function chartPalette(element: HTMLElement): string[] {
  return ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"]
    .map((name) => chartToken(element, name))
    .filter(Boolean)
}

/**
 * 站内 token 兜到图表上：字体、tooltip 的底色/边框/文字。
 *
 * ECharts 默认是自己那套 sans-serif + 白底黑框 tooltip，和站内字体、深浅模式都对不上。
 * 这里**只补没写的**，调用方自己设过的照旧——所以各个图仍然能按需覆盖。
 */
export function withChartDefaults(element: HTMLElement, option: EChartsCoreOption): EChartsCoreOption {
  const font = getComputedStyle(element).fontFamily
  const tooltip = (option as { tooltip?: Record<string, unknown> }).tooltip
  return {
    ...option,
    textStyle: { fontFamily: font, ...(option as { textStyle?: object }).textStyle },
    ...(tooltip
      ? {
        tooltip: {
          backgroundColor: chartToken(element, "--popover"),
          borderColor: chartToken(element, "--border"),
          textStyle: { color: chartToken(element, "--popover-foreground"), fontFamily: font },
          ...tooltip,
        },
      }
      : {}),
  }
}

/**
 * 一个图表 = 标题 + 类型切换 + 画布。
 * `option(element, kind)` 每次重画时调用：**必须在回调里现取 CSS 变量**，
 * 因为换主题模式/主色只改变量，ECharts 不认变量、只在画的那一刻取到的值。
 */
export function ChartFrame({
  title, description, kinds, kind, onKindChange, colorKey, height = 260, option, empty, dataKey, table, className,
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
  /**
   * 图下面的「查看数据表」折叠区。
   * 两个用处合一：**读屏用户的等价替代**（canvas 本身读不出来），
   * 以及老板要的「图看趋势、表看具体数」——不用为了看一个数去把鼠标悬停到某个点上。
   */
  table?: { columns: string[]; rows: (string | number | null)[][] }
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof init> | null>(null)
  const labelId = useId()
  const [tableOpen, setTableOpen] = useState(false)

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
    chart.setOption(withChartDefaults(ref.current, option(ref.current, kind)), { notMerge: true })
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
      {table && table.rows.length ? (
        <div>
          <button
            type="button"
            aria-expanded={tableOpen}
            onClick={() => setTableOpen((value) => !value)}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >{tableOpen ? "收起数据表" : "查看数据表"}</button>
          {tableOpen ? (
            <div className="mt-2 max-h-64 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <caption className="sr-only">{title}的数据表</caption>
                <thead className="sticky top-0 bg-muted">
                  <tr>{table.columns.map((column, index) => <th key={column} scope="col" className={cn("px-2 py-1.5 font-medium", index === 0 ? "text-left" : "text-right")}>{column}</th>)}</tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className={cn("px-2 py-1", cellIndex === 0 ? "text-left" : "text-right tabular-nums")}>
                          {/* 缺数显「−」：图上那个点是断开的，表里也不能变成 0 */}
                          {cell === null || cell === "" ? "−" : cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
