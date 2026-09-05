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
export function SpendRealCpaTrend({ data, colorKey, labels = { spend: "消耗", cpa: "真实 CPA" } }: { data: WorkbenchData["trend"]; colorKey?: string; labels?: { spend: string; cpa: string } }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const element = ref.current
    const chart = init(element)
    chart.setOption({
      aria: { enabled: true, description: `${labels.spend}与${labels.cpa}趋势，缺失日显示为空。` },
      animationDuration: 220,
      color: [token(element, "--kp-chart-spend"), token(element, "--kp-chart-cpa")],
      grid: { left: 8, right: 8, top: 40, bottom: 8, containLabel: true },
      legend: { top: 2, data: [labels.spend, labels.cpa] },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", boundaryGap: false, data: data.map((point) => point.label), axisLabel: { formatter: (value: string) => value.slice(5).replace("-", "/") }, axisLine: { lineStyle: { color: token(element, "--kp-chart-grid") } } },
      yAxis: [
        { type: "value", name: labels.spend, axisLabel: { formatter: (value: number) => (value >= 10000 ? `${(value / 10000).toFixed(Number.isInteger(value / 10000) ? 0 : 1)}万` : value.toLocaleString("zh-CN")) }, splitLine: { lineStyle: { color: token(element, "--kp-chart-grid") } } },
        { type: "value", name: labels.cpa, axisLabel: { formatter: "¥{value}" }, splitLine: { show: false } },
      ],
      series: [
        { name: labels.spend, type: "line", yAxisIndex: 0, data: data.map((point) => point.spend), smooth: true, symbolSize: 6, lineStyle: { width: 3 }, areaStyle: { opacity: 0.08 } },
        { name: labels.cpa, type: "line", yAxisIndex: 1, data: data.map((point) => point.realCpa), connectNulls: false, symbolSize: 7, lineStyle: { width: 2 } },
      ],
    })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(element)
    return () => { observer.disconnect(); chart.dispose() }
  }, [data, colorKey, labels.spend, labels.cpa])

  return <div ref={ref} role="img" aria-label={`${labels.spend}与${labels.cpa}趋势`} className="h-72 w-full min-w-0 max-w-full overflow-hidden" />
}
