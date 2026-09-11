"use client"

import type { EChartsCoreOption } from "echarts/core"

import { ChartFrame, chartPalette, chartToken, type ChartKind } from "@/components/charts/chart-frame"
import { useChartKind } from "@/lib/data/use-chart-prefs"
import type { DashboardRow } from "@/lib/fixtures/dashboard"

// F8-19：按维度分布的图（资源位环图是它的一种）。老板要求每个图能换类型，所以这里一份数据四种画法。

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 })

export function DimensionChart({ id, title, description, rows, colorKey, defaultKind = "donut", height = 260 }: {
  id: string
  title: string
  description?: string
  rows: DashboardRow[]
  colorKey?: string
  defaultKind?: ChartKind
  height?: number
}) {
  const [kind, setKind] = useChartKind(id, defaultKind)
  // 只画有消耗的项：0 消耗的维度值画出来是根看不见的柱/一条缝的扇形，纯噪音
  const data = rows
    .map((row) => ({ name: row.label, value: row.metrics.cost.value ?? 0 }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)

  const option = (element: HTMLElement, current: ChartKind): EChartsCoreOption => {
    const palette = chartPalette(element)
    const grid = chartToken(element, "--kp-chart-grid")
    const text = chartToken(element, "--muted-foreground")
    const base = {
      aria: { enabled: true, description: `${title}：各项账面花费占比。` },
      animationDuration: 220,
      color: palette,
      tooltip: { trigger: current === "bar" || current === "line" ? "axis" : "item", valueFormatter: (value: number) => money.format(value) },
    }
    if (current === "pie" || current === "donut") {
      return {
        ...base,
        legend: { orient: "vertical", right: 0, top: "center", textStyle: { color: text } },
        series: [{
          type: "pie",
          radius: current === "donut" ? ["46%", "72%"] : "70%",
          center: ["38%", "50%"],
          // 环图中间不放总计文字：值一长就和圆环挤在一起，总计已经在上面的 KPI 里
          label: { show: current === "pie", formatter: "{b} {d}%", color: text },
          labelLine: { show: current === "pie" },
          itemStyle: { borderWidth: 2, borderColor: chartToken(element, "--card") },
          data,
        }],
      }
    }
    return {
      ...base,
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: data.map((item) => item.name), axisLabel: { color: text, interval: 0, rotate: data.length > 4 ? 20 : 0 }, axisLine: { lineStyle: { color: grid } } },
      yAxis: { type: "value", axisLabel: { color: text, formatter: (value: number) => money.format(value) }, splitLine: { lineStyle: { color: grid } } },
      series: [{ type: current, data: data.map((item) => item.value), barMaxWidth: 36, smooth: current === "line", areaStyle: current === "line" ? { opacity: 0.08 } : undefined }],
    }
  }

  return (
    <ChartFrame
      title={title}
      description={description}
      kinds={["donut", "pie", "bar", "line"]}
      kind={kind}
      onKindChange={setKind}
      colorKey={colorKey}
      dataKey={data.map((item) => `${item.name}:${item.value}`).join("|")}
      height={height}
      option={option}
      empty={data.length === 0 ? "这个窗口没有消耗，没有可画的分布" : null}
    />
  )
}
