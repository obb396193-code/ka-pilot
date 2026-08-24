"use client"

import { useEffect, useRef } from "react"
import { LineChart } from "echarts/charts"
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components"
import { init, use as registerEChartsModules } from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"

import type { WorkbenchData } from "@/lib/data/contracts"

registerEChartsModules([LineChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

function token(element: HTMLElement, name: string) {
  return getComputedStyle(element).getPropertyValue(name).trim()
}

export function SpendRealCpaTrend({ data }: { data: WorkbenchData["trend"] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const element = ref.current
    const chart = init(element)
    chart.setOption({
      aria: { enabled: true, description: "最近七天消耗与真实 CPA 趋势，8 月 20 日真实 CPA 数据缺失并显示为空。" },
      animationDuration: 220,
      color: [token(element, "--kp-chart-spend"), token(element, "--kp-chart-cpa")],
      grid: { left: 16, right: 18, top: 46, bottom: 18, containLabel: true },
      legend: { top: 2, data: ["消耗", "真实 CPA"] },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", boundaryGap: false, data: data.map((point) => point.label) },
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
  }, [data])

  return <div ref={ref} role="img" aria-label="消耗与真实 CPA 趋势" className="h-72 w-full min-w-0 max-w-full overflow-hidden" />
}
