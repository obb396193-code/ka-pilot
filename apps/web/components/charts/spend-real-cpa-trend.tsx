"use client"

import { useEffect, useRef } from "react"
import { LineChart } from "echarts/charts"
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components"
import { init, use as registerEChartsModules } from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"

import type { WorkbenchData } from "@/lib/data/contracts"

registerEChartsModules([LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

// 读 CSS 变量并经 canvas 归一成 #hex：主题 token 可能是 oklch()/相对色，ECharts 自己的颜色解析不认
function token(element: HTMLElement, name: string) {
  const raw = getComputedStyle(element).getPropertyValue(name).trim()
  const context = document.createElement("canvas").getContext("2d")
  if (!context || !raw) return raw
  context.fillStyle = raw
  return typeof context.fillStyle === "string" ? context.fillStyle : raw
}

// colorKey：主题模式/主色变化时重新读取 CSS 变量重画（ECharts 不认 CSS 变量，只在 init 时取一次）
export function SpendRealCpaTrend({ data, colorKey }: { data: WorkbenchData["trend"]; colorKey?: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const element = ref.current
    const chart = init(element)
    chart.setOption({
      aria: { enabled: true, description: "最近七天消耗与真实 CPA 趋势，8 月 20 日真实 CPA 数据缺失并显示为空。" },
      animationDuration: 220,
      color: [token(element, "--kp-chart-spend"), token(element, "--kp-chart-cpa")],
      grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
      legend: { top: 2, data: ["消耗", "真实 CPA"] },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", boundaryGap: false, data: data.map((point) => point.label), axisLabel: { formatter: (value: string) => value.slice(5).replace("-", "/") }, axisLine: { lineStyle: { color: token(element, "--kp-chart-grid") } } },
      yAxis: [
        { type: "value", name: "消耗", axisLabel: { formatter: (value: number) => `${Math.round(value / 10000)}万` }, splitLine: { lineStyle: { color: token(element, "--kp-chart-grid") } } },
        { type: "value", name: "真实 CPA", axisLabel: { formatter: "¥{value}" }, splitLine: { show: false } },
      ],
      series: [
        { name: "消耗", type: "line", yAxisIndex: 0, data: data.map((point) => point.spend), smooth: true, symbolSize: 6, lineStyle: { width: 3 }, areaStyle: { opacity: 0.08 } },
        { name: "真实 CPA", type: "line", yAxisIndex: 1, data: data.map((point) => point.realCpa), connectNulls: false, symbolSize: 7, lineStyle: { width: 2 } },
      ],
    })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => { observer.disconnect(); chart.dispose() }
  }, [data, colorKey])

  return <div ref={ref} role="img" aria-label="消耗与真实 CPA 趋势" className="h-72 w-full min-w-0 max-w-full overflow-hidden" />
}
