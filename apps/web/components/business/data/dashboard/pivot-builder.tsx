"use client"

import { useMemo, useState } from "react"
import { IconTable } from "@tabler/icons-react"
import type { EChartsCoreOption } from "echarts/core"

import { ChartFrame, chartPalette, chartToken, type ChartKind } from "@/components/charts/chart-frame"
import type { DataWindow } from "@/components/business/data/dashboard/window-picker"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useChartKind } from "@/lib/data/use-chart-prefs"
import { PIVOT_METRICS, pivotDimensions } from "@/lib/data/pivot-dimensions"
import { usePivot, type PivotCell } from "@/lib/data/use-pivot"
import { cn } from "@/lib/utils"

/**
 * F8-22 自定义透视：**行维 × 列维 × 指标 × 图型**，四样都由用户选。
 * 老板原话「能像 Excel 透视表一样自选字段透视」——所以维度不是写死的 tab，
 * 而是下拉里列出固定 8 维 + 当前媒体命名规则里的可分析段（新增媒体规则时自动多出来）。
 *
 * 「不分列」= 只按行维汇总，退化成一张普通维度表——很多时候人要的就是这个，
 * 逼他必须选两个维度反而绕。
 */

const NONE = "__none__"
const cny0 = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 })
const cny2 = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 })
const num = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 })
const pct = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1 })

function format(value: number | null, kind: string): string {
  if (value === null) return "−"
  if (kind === "money") return cny0.format(value)
  if (kind === "moneyRatio") return cny2.format(value)
  if (kind === "percent") return pct.format(value)
  return num.format(value)
}

export function PivotBuilder({ window, workspaceId, colorKey }: {
  window: DataWindow
  workspaceId: string | undefined
  colorKey?: string
}) {
  const dimensions = useMemo(() => pivotDimensions(), [])
  const [rowDim, setRowDim] = useState("resource_position")
  const [colDim, setColDim] = useState("task")
  const [metric, setMetric] = useState("cost")
  const [kind, setKind] = useChartKind("pivot.chart", "bar")
  const [asTable, setAsTable] = useState(true)

  const metricMeta = PIVOT_METRICS.find((item) => item.value === metric) ?? PIVOT_METRICS[0]
  const pivot = usePivot(rowDim, colDim === NONE ? null : colDim, metric, window, workspaceId)

  // 行/列表头由返回的格子推导，不预设顺序——后端按什么序返回就按什么序显示
  const { rowKeys, colKeys, grid } = useMemo(() => {
    const cells = pivot.data ?? []
    const rows = new Map<string, string>()
    const cols = new Map<string, string>()
    const table = new Map<string, PivotCell>()
    for (const cell of cells) {
      rows.set(cell.a.key, cell.a.label)
      if (cell.b) cols.set(cell.b.key, cell.b.label)
      table.set(`${cell.a.key}||${cell.b?.key ?? ""}`, cell)
    }
    return { rowKeys: [...rows.keys()], colKeys: [...cols.keys()], grid: table }
  }, [pivot.data])

  const picker = (value: string, onChange: (next: string) => void, label: string, allowNone = false) => (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-36" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {allowNone ? <SelectItem value={NONE}>不分列</SelectItem> : null}
          {(["固定维度", "命名规则段"] as const).map((group) => {
            const items = dimensions.filter((item) => item.group === group)
            if (items.length === 0) return null
            return (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
              </SelectGroup>
            )
          })}
        </SelectContent>
      </Select>
    </label>
  )

  const option = (element: HTMLElement, current: ChartKind): EChartsCoreOption => {
    const palette = chartPalette(element)
    const text = chartToken(element, "--muted-foreground")
    const grid2 = chartToken(element, "--kp-chart-grid")
    const value = (rowKey: string, colKey: string) => grid.get(`${rowKey}||${colKey}`)?.value ?? null
    if (current === "pie" || current === "donut") {
      // 饼/环只能表达一维：按行维汇总（列维在这两种图型下没有位置放）
      const data = rowKeys.map((rowKey) => ({
        name: grid.get(`${rowKey}||${colKeys[0] ?? ""}`)?.a.label ?? rowKey,
        value: colKeys.length ? colKeys.reduce((sum, colKey) => sum + (value(rowKey, colKey) ?? 0), 0) : value(rowKey, "") ?? 0,
      })).filter((item) => item.value > 0)
      return {
        aria: { enabled: true, description: `${metricMeta.label}按行维分布` },
        color: palette, animationDuration: 220,
        tooltip: { trigger: "item", valueFormatter: (v: number) => format(v, metricMeta.kind) },
        legend: { orient: "vertical", right: 0, top: "center", textStyle: { color: text } },
        series: [{ type: "pie", radius: current === "donut" ? ["46%", "72%"] : "70%", center: ["38%", "50%"], label: { show: current === "pie", color: text }, data }],
      }
    }
    // 柱/折线：列维当系列，没有列维就单系列
    const series = (colKeys.length ? colKeys : [""]).map((colKey) => ({
      name: colKeys.length ? (grid.get(`${rowKeys[0] ?? ""}||${colKey}`)?.b?.label ?? colKey) : metricMeta.label,
      type: current,
      smooth: current === "line",
      barMaxWidth: 28,
      // 缺格子留 null 不补 0：那个组合没有数，不是花了 0 块
      data: rowKeys.map((rowKey) => value(rowKey, colKey)),
    }))
    return {
      aria: { enabled: true, description: `${metricMeta.label}：行维 × 列维` },
      color: palette, animationDuration: 220,
      tooltip: { trigger: "axis", valueFormatter: (v: number | null) => (v === null || v === undefined ? "−" : format(v, metricMeta.kind)) },
      legend: { top: 0, textStyle: { color: text } },
      grid: { left: 8, right: 8, top: colKeys.length ? 34 : 16, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: rowKeys.map((rowKey) => grid.get(`${rowKey}||${colKeys[0] ?? ""}`)?.a.label ?? rowKey), axisLabel: { color: text, interval: 0, rotate: rowKeys.length > 5 ? 20 : 0 }, axisLine: { lineStyle: { color: grid2 } } },
      yAxis: { type: "value", axisLabel: { color: text, formatter: (v: number) => format(v, metricMeta.kind) }, splitLine: { lineStyle: { color: grid2 } } },
      series,
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {picker(rowDim, setRowDim, "行维")}
        {picker(colDim, setColDim, "列维", true)}
        <label className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">指标</span>
          <Select value={metric} onValueChange={setMetric}>
            <SelectTrigger size="sm" className="w-32" aria-label="指标"><SelectValue /></SelectTrigger>
            <SelectContent>{PIVOT_METRICS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <div className="ml-auto flex items-center rounded-lg border p-0.5" role="group" aria-label="展示方式">
          <Button size="sm" variant="ghost" aria-pressed={asTable} className={cn("h-6 gap-1 rounded-md px-2 text-xs font-normal", asTable && "bg-foreground text-background hover:bg-foreground hover:text-background")} onClick={() => setAsTable(true)}>
            <IconTable className="size-3" />表格
          </Button>
          <Button size="sm" variant="ghost" aria-pressed={!asTable} className={cn("h-6 rounded-md px-2 text-xs font-normal", !asTable && "bg-foreground text-background hover:bg-foreground hover:text-background")} onClick={() => setAsTable(false)}>
            图表
          </Button>
        </div>
      </div>

      {pivot.loading ? <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">正在取数…</p>
        : pivot.error ? (
          <div className="rounded-lg border border-dashed px-3 py-10 text-center text-sm">
            <p className="mb-2 text-status-critical">取数失败：{pivot.error.message}</p>
            {pivot.error.requestId ? <p className="mb-2 text-xs text-muted-foreground">问题编号 {pivot.error.requestId}</p> : null}
            <button type="button" onClick={pivot.reload} className="text-muted-foreground underline underline-offset-2">重试</button>
          </div>
        )
        : rowKeys.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
            {pivot.unavailable ?? "这个维度组合在当前窗口没有数据"}
          </p>
        )
        : asTable ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="min-w-40">{dimensions.find((d) => d.value === rowDim)?.label} \ {colDim === NONE ? metricMeta.label : dimensions.find((d) => d.value === colDim)?.label}</TableHead>
                  {colKeys.length ? colKeys.map((colKey) => <TableHead key={colKey} className="text-right">{grid.get(`${rowKeys[0]}||${colKey}`)?.b?.label ?? colKey}</TableHead>)
                    : <TableHead className="text-right">{metricMeta.label}</TableHead>}
                  {colKeys.length ? <TableHead className="text-right font-medium">合计</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rowKeys.map((rowKey) => {
                  const values = (colKeys.length ? colKeys : [""]).map((colKey) => grid.get(`${rowKey}||${colKey}`)?.value ?? null)
                  // 合计：任一格缺数就整行显「−」——把缺的当 0 加进去会让合计看着正常其实少了
                  const total = values.some((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
                  return (
                    <TableRow key={rowKey}>
                      <TableCell className="font-medium">{grid.get(`${rowKey}||${colKeys[0] ?? ""}`)?.a.label ?? rowKey}</TableCell>
                      {values.map((value, index) => <TableCell key={index} className="text-right tabular-nums">{format(value, metricMeta.kind)}</TableCell>)}
                      {colKeys.length ? <TableCell className="text-right font-medium tabular-nums">{format(total, metricMeta.kind)}</TableCell> : null}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ChartFrame
            title={`${dimensions.find((d) => d.value === rowDim)?.label ?? rowDim}${colDim === NONE ? "" : ` × ${dimensions.find((d) => d.value === colDim)?.label ?? colDim}`}`}
            description={metricMeta.label}
            kinds={["bar", "line", "pie", "donut"]}
            kind={kind}
            onKindChange={setKind}
            colorKey={colorKey}
            dataKey={`${rowDim}|${colDim}|${metric}|${rowKeys.length}x${colKeys.length}`}
            height={340}
            option={option}
          />
        )}

      <p className="text-[11px] text-muted-foreground">
        维度下拉里「命名规则段」来自当前媒体的账户昵称解析规则——规则里新增一个可分析段，这里自动多一项。
        缺的格子显「−」不补 0：那个组合没有数，不是花了 0 块。
      </p>
    </div>
  )
}
