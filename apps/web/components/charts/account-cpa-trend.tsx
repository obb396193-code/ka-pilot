"use client"

import { useEffect, useRef } from "react"
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components"
import { LineChart } from "echarts/charts"
import { init, use as registerEChartsModules } from "echarts/core"
import { CanvasRenderer } from "echarts/renderers"

import type { AccountDetailData } from "@/lib/data/contracts"

registerEChartsModules([LineChart, GridComponent, LegendComponent, TooltipComponent, AriaComponent, CanvasRenderer])

function token(element: HTMLElement, name: string, fallback: string) {
  return getComputedStyle(element).getPropertyValue(name).trim() || fallback
}

export function AccountCpaTrend({ data }: { data: AccountDetailData["trend"] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = init(ref.current)
    chart.setOption({
      aria: { enabled: true, description: "账户 CPA 与考核价的时段趋势对比" },
      animationDuration: 240,
      color: [token(ref.current, "--kp-chart-spend", "currentColor"), token(ref.current, "--kp-chart-cpa", "currentColor")],
      grid: { left: 16, right: 16, top: 48, bottom: 20, containLabel: true },
      legend: { top: 4, data: ["CPA", "考核价"] },
      tooltip: { trigger: "axis", valueFormatter: (value: unknown) => `¥ ${value ?? "—"}` },
      xAxis: { type: "category", boundaryGap: false, data: data.map((point) => point.label) },
      yAxis: { type: "value", axisLabel: { formatter: "¥ {value}" }, splitLine: { lineStyle: { color: token(ref.current, "--kp-chart-grid", "currentColor") } } },
      series: [
        { name: "CPA", type: "line", data: data.map((point) => point.cpa), smooth: true, symbolSize: 7, lineStyle: { width: 3 } },
        { name: "考核价", type: "line", data: data.map((point) => point.assessmentCpa), symbol: "none", lineStyle: { type: "dashed", width: 2 } },
      ],
    })
    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(ref.current)
    return () => { resizeObserver.disconnect(); chart.dispose() }
  }, [data])

  return <div ref={ref} role="img" aria-label="CPA 与考核价趋势图" className="h-72 w-full" />
}
