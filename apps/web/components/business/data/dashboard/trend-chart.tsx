"use client"

import type { EChartsCoreOption } from "echarts/core"

import { ChartFrame, chartToken, type ChartKind } from "@/components/charts/chart-frame"
import { useChartKind } from "@/lib/data/use-chart-prefs"

// F8-19 趋势双轴：左轴金额（消耗）、右轴转化数与成本。
// 双轴是因为三条线的量级差三个数量级——挤一根轴上，转化和成本会被消耗压成贴地的直线。
// 缺失日**留空不连线**（`null` 而不是 0）：补 0 会让人以为那天真花了 0 块。

export type TrendPoint = { ds: string; cost: number | null; conversion: number | null; cpa: number | null }

const money = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 })
const money2 = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 })

export function TrendChart({ id, points, colorKey, granularity }: {
  id: string
  points: TrendPoint[]
  colorKey?: string
  /** 小时粒度要等 Codex 的 025 hourly，到之前只有日 */
  granularity?: "day" | "hour"
}) {
  const [kind, setKind] = useChartKind(id, "line")

  const option = (element: HTMLElement, current: ChartKind): EChartsCoreOption => {
    // 三条线要一眼分得开：主色 / 第三色相（偏蓝）/ 成本橙。
    // 直接取调色盘前三个不行——主色是紫时，前三个都是紫系，画出来像三条同色线。
    const palette = [
      chartToken(element, "--kp-chart-spend"),
      chartToken(element, "--kp-hue-3"),
      chartToken(element, "--kp-chart-cpa"),
    ]
    const grid = chartToken(element, "--kp-chart-grid")
    const text = chartToken(element, "--muted-foreground")
    const series = current === "pie" || current === "donut" ? "bar" : current
    return {
      aria: { enabled: true, description: "消耗、转化数与转化成本的趋势，缺失日留空。" },
      animationDuration: 220,
      color: palette,
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: number | null) => (value === null || value === undefined ? "−" : String(value)),
      },
      legend: { top: 0, textStyle: { color: text }, data: ["账面消耗", "转化数", "转化成本"] },
      grid: { left: 8, right: 8, top: 34, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: points.map((point) => point.ds), axisLabel: { color: text }, axisLine: { lineStyle: { color: grid } } },
      yAxis: [
        { type: "value", name: "金额", nameTextStyle: { color: text }, axisLabel: { color: text, formatter: (value: number) => money.format(value) }, splitLine: { lineStyle: { color: grid } } },
        { type: "value", name: "转化 / 成本", nameTextStyle: { color: text }, axisLabel: { color: text }, splitLine: { show: false } },
      ],
      series: [
        { name: "账面消耗", type: series, yAxisIndex: 0, smooth: series === "line", areaStyle: series === "line" ? { opacity: 0.08 } : undefined, barMaxWidth: 22, connectNulls: false, data: points.map((point) => point.cost) },
        { name: "转化数", type: series, yAxisIndex: 1, smooth: series === "line", barMaxWidth: 22, connectNulls: false, data: points.map((point) => point.conversion) },
        { name: "转化成本", type: "line", yAxisIndex: 1, smooth: true, connectNulls: false, tooltip: { valueFormatter: (value: number | null) => (value === null || value === undefined ? "−" : money2.format(value)) }, data: points.map((point) => point.cpa) },
      ],
    }
  }

  return (
    <ChartFrame
      title="趋势"
      description={`左轴金额、右轴转化与成本；缺失日留空不补 0${granularity === "hour" ? "（小时粒度）" : ""}`}
      kinds={["line", "bar"]}
      kind={kind}
      onKindChange={setKind}
      colorKey={colorKey}
      // 数据指纹：换窗口后点位变了要重设 option，否则图上还是上一个区间
      dataKey={`${points.length}:${points[0]?.ds ?? ""}:${points.at(-1)?.ds ?? ""}`}
      height={300}
      option={option}
      empty={points.length === 0 ? "这个窗口没有趋势数据" : null}
    />
  )
}
