"use client"

import { useMemo, useState } from "react"
import { IconSparkles } from "@tabler/icons-react"

import { openAgentDrawer } from "@/components/business/command/events"
import { ExampleBadge } from "@/components/business/state/page-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isOk, mv, rv } from "@/lib/fixtures/contract"
import { dimensionFixtures, dimensions, pivot2Fixture, strategyPresets, type Dimension, type Pivot2Row } from "@/lib/fixtures/data-analysis"
import { cn } from "@/lib/utils"
import { CostStatusDot, LineageFooter } from "./shared"

// 策略分析（3.11 最小：分析视图）：预设三张 + 自定义两维交叉表 + 异常单元格着色 + 勾选 → 分析。不做"最优投法"推荐。
function crosstab(rows: Pivot2Row[]) {
  const aKeys = [...new Map(rows.map((row) => [row.a.key, row.a.label])).entries()]
  const bKeys = [...new Map(rows.map((row) => [row.b.key, row.b.label])).entries()]
  const cells = new Map(rows.map((row) => [`${row.a.key}|${row.b.key}`, row]))
  return { aKeys, bKeys, cells }
}

export function StrategyTab() {
  const [preset, setPreset] = useState(strategyPresets[0].value)
  const [custom, setCustom] = useState<{ a: Dimension; b: Dimension }>({ a: "resource_position", b: "task" })
  const active = preset === "custom" ? custom : { a: strategyPresets.find((item) => item.value === preset)!.dimA, b: strategyPresets.find((item) => item.value === preset)!.dimB }
  const [selected, setSelected] = useState<string[]>([])
  const unsupported = ["a", "b"].map((side) => active[side as "a" | "b"]).find((dim) => "unsupported" in dimensionFixtures[dim])
  const available = isOk(pivot2Fixture) && pivot2Fixture.data.source.dimA === active.a && pivot2Fixture.data.source.dimB === active.b
  const rows = useMemo(() => (available && isOk(pivot2Fixture) ? pivot2Fixture.data.source.rows : []), [available])
  const { aKeys, bKeys, cells } = useMemo(() => crosstab(rows), [rows])
  const label = (dim: Dimension) => dimensions.find((item) => item.value === dim)?.label ?? dim
  if (!isOk(pivot2Fixture)) return null
  const coverage = pivot2Fixture.meta?.cellCoverage

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={preset} onValueChange={(value) => { setPreset(value); setSelected([]) }}>
          <TabsList className="flex-wrap">
            {strategyPresets.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label}</TabsTrigger>)}
            <TabsTrigger value="custom">自定义</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" disabled={selected.length === 0} onClick={() => openAgentDrawer(`对比 ${label(active.a)} × ${label(active.b)} 里这 ${selected.length} 个组合的成本与量级：${selected.join("、")}`)}><IconSparkles />分析这 {selected.length} 个</Button>
      </div>
      {preset === "custom" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">行</span>
          <Select value={custom.a} onValueChange={(value) => setCustom((prev) => ({ ...prev, a: value as Dimension }))}><SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger><SelectContent>{dimensions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
          <span className="text-muted-foreground">×</span>
          <span className="text-muted-foreground">列</span>
          <Select value={custom.b} onValueChange={(value) => setCustom((prev) => ({ ...prev, b: value as Dimension }))}><SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger><SelectContent>{dimensions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
        </div>
      ) : null}
      {unsupported ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <Badge variant="outline">DIMENSION_UNSUPPORTED</Badge>
          <div className="text-sm font-medium">{label(unsupported)} 维度的数据源待确认</div>
          <p className="max-w-md text-xs text-muted-foreground">该维度无源前不出交叉表，不用猜的数填。</p>
        </div>
      ) : !available ? (
        <div className="relative flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <ExampleBadge className="absolute top-3 right-3" />
          <div className="text-sm font-medium">{label(active.a)} × {label(active.b)} 的样例待补</div>
          <p className="max-w-md text-xs text-muted-foreground">TODO-fixture：data-query/pivot2-{active.a}-{active.b}.json；契约已冻（account.pivot2），arch 补样例后自动出表。</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow>
                <TableHead className="w-40">{label(active.a)} ＼ {label(active.b)}</TableHead>
                {bKeys.map(([key, name]) => <TableHead key={key} className="text-center">{name}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {aKeys.map(([aKey, aName]) => (
                <TableRow key={aKey}>
                  <TableCell className="font-medium">{aName}</TableCell>
                  {bKeys.map(([bKey]) => {
                    const row = cells.get(`${aKey}|${bKey}`)
                    const id = `${aKey}|${bKey}`
                    const status = row?.assessment.costStatus ?? null
                    return (
                      <TableCell key={bKey} className="p-1.5 text-center">
                        {row ? (
                          <label className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-lg border px-2 py-2", status === "red" && "border-status-critical/40 bg-status-critical/5", status === "yellow" && "border-status-warning/40 bg-status-warning/5", selected.includes(id) && "ring-1 ring-foreground")}>
                            <span className="flex items-center gap-1.5"><Checkbox checked={selected.includes(id)} onCheckedChange={(value) => setSelected((prev) => value ? [...prev, id] : prev.filter((item) => item !== id))} aria-label="选择组合" /><CostStatusDot status={status} /></span>
                            <span className="text-sm font-semibold tabular-nums">{rv(row.metrics.ratios.cashCpa, "money")}</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">现金 {mv(row.metrics.cashCost, "money0")} · 转化 {mv(row.metrics.realConversion)}</span>
                          </label>
                        ) : <span className="text-muted-foreground">·</span>}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <LineageFooter lineage={pivot2Fixture.data.source.lineage} extra={coverage ? <span>格子 {coverage.cells} · 有数 {coverage.withData} · 缺数 {coverage.undeterminable}</span> : null} />
    </div>
  )
}
