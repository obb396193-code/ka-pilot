"use client"

import type { EChartsCoreOption } from "echarts/core"

import { ChartFrame, chartPalette, chartToken, type ChartKind } from "@/components/charts/chart-frame"
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
    // 三条线要一眼分得开，所以不取调色盘前三个（主色是紫时前三个都是紫系，像三条同色线），
    // 而是挑 1 / 3 / 2——中间隔开一个色相。
    // ★用 `--chart-*` 而不是 `--kp-hue-*`：前者跟着颜色模式走，选「黑白」时是灰阶；
    //   后者不管什么模式永远是彩的，于是壳变黑白了图还是花的（审查员 C 点名）。
    const ramp = chartPalette(element)
    const palette = [ramp[0], ramp[2], ramp[1]].filter(Boolean) as string[]
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
      grid: { left: 8, right: 60, top: 34, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: points.map((point) => point.ds), axisLabel: { color: text }, axisLine: { lineStyle: { color: grid } } },
      // ★转化数（几千）和转化成本（几十）原来共用右轴：成本那条被压成贴着底的一条直线，
      //   等于白画（审查员 C 点名）。拆成**三根轴**——金额左、转化数右、成本再往右偏一格。
      yAxis: [
        { type: "value", name: "金额", nameTextStyle: { color: text }, axisLabel: { color: text, formatter: (value: number) => money.format(value) }, splitLine: { lineStyle: { color: grid } } },
        { type: "value", name: "转化数", position: "right", nameTextStyle: { color: text }, axisLabel: { color: text }, splitLine: { show: false } },
        { type: "value", name: "转化成本", position: "right", offset: 52, nameTextStyle: { color: text }, axisLabel: { color: text, formatter: (value: number) => money2.format(value) }, splitLine: { show: false } },
      ],
      series: [
        { name: "账面消耗", type: series, yAxisIndex: 0, smooth: series === "line", areaStyle: series === "line" ? { opacity: 0.08 } : undefined, barMaxWidth: 22, connectNulls: false, data: points.map((point) => point.cost) },
        { name: "转化数", type: series, yAxisIndex: 1, smooth: series === "line", barMaxWidth: 22, connectNulls: false, data: points.map((point) => point.conversion) },
        // 虚线：它和上面两条不是一个量纲，画成实线容易被当成同一组数（审查员 C）
        { name: "转化成本", type: "line", yAxisIndex: 2, smooth: true, lineStyle: { type: "dashed" }, connectNulls: false, tooltip: { valueFormatter: (value: number | null) => (value === null || value === undefined ? "−" : money2.format(value)) }, data: points.map((point) => point.cpa) },
      ],
    }
  }

  return (
    <ChartFrame
      title="趋势"
      description={`左轴金额、右两轴分别是转化数与转化成本；缺失日留空不补 0${granularity === "hour" ? "（小时粒度）" : ""}`}
      kinds={["line", "bar"]}
      kind={kind}
      onKindChange={setKind}
      colorKey={colorKey}
      // 数据指纹：换窗口后点位变了要重设 option，否则图上还是上一个区间
      dataKey={`${points.length}:${points[0]?.ds ?? ""}:${points.at(-1)?.ds ?? ""}`}
      height={300}
      option={option}
      empty={points.length === 0 ? "这个窗口没有趋势数据" : null}
      // 图下面的数据表：读屏的等价替代，也省得为看一个数去悬停某个点
      table={{
        columns: ["日期", "账面消耗", "转化数", "转化成本"],
        rows: points.map((point) => [
          point.ds,
          point.cost === null ? null : money.format(point.cost),
          point.conversion,
          point.cpa === null ? null : money2.format(point.cpa),
        ]),
      }}
    />
  )
}
