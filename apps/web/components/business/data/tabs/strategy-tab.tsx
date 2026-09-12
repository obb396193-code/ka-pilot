"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { IconSparkles } from "@tabler/icons-react"

import { openAgentDrawer } from "@/components/business/command/events"
import { ExampleBadge } from "@/components/business/state/page-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { NotConnected } from "@/components/business/state/not-connected"
import { FIXTURES_ENABLED, isOk, mv, rv } from "@/lib/fixtures/contract"
import { dimensionFixtures, dimensions, pivot2Fixtures, pivot2UnsupportedFixture, strategyPresets, type Dimension, type Pivot2Row } from "@/lib/fixtures/data-analysis"
import { cn } from "@/lib/utils"
import { CostStatusDot, LineageFooter } from "./shared"
import { StrategyLibrary } from "./strategy-library"

// 策略分析 = 「分析视图 / 方案库」两视图（v1.7 §13）：分析视图 = 预设三张 + 自定义两维交叉表；方案库 = 可保存的策略方案（StrategyLibrary）。不做"最优投法"推荐。
function crosstab(rows: Pivot2Row[]) {
  const aKeys = [...new Map(rows.map((row) => [row.a.key, row.a.label])).entries()]
  const bKeys = [...new Map(rows.map((row) => [row.b.key, row.b.label])).entries()]
  const cells = new Map(rows.map((row) => [`${row.a.key}|${row.b.key}`, row]))
  return { aKeys, bKeys, cells }
}

/**
 * A35（F8-25 ①）：真实模式下不显样例数据。这个 tab 还没接真接口，照实说。
 * 外面包一层是因为**早退必须在所有 hook 之前**，而里面那个组件第一行就开始用 hook——
 * 在它内部早退会违反 rules-of-hooks（真实/mock 两种模式下 hook 数量不一致）。
 */
export function StrategyTab() {
  if (!FIXTURES_ENABLED) return <NotConnected endpoint="并入「维度透视 · 自定义透视」的三个预设" hint="自定义透视已经接通，策略分析的预设会并进去（arch 第 30 圈裁）。" />
  return <StrategyTabInner  />
}

function StrategyTabInner() {
  const params = useSearchParams()
  const router = useRouter()
  const view = params.get("view") === "library" ? "library" : "analysis"
  const setView = (next: "analysis" | "library") => { const q = new URLSearchParams(params.toString()); if (next === "library") q.set("view", "library"); else q.delete("view"); router.replace(`/data?${q.toString()}`, { scroll: false }) }
  return (
    <div className="flex flex-col gap-4">
      <Tabs value={view} onValueChange={(value) => setView(value as "analysis" | "library")}><TabsList variant="line"><TabsTrigger value="analysis">分析视图</TabsTrigger><TabsTrigger value="library">方案库</TabsTrigger></TabsList></Tabs>
      {view === "library" ? <StrategyLibrary /> : <AnalysisView />}
    </div>
  )
}

function AnalysisView() {
  const [preset, setPreset] = useState(strategyPresets[0].value)
  const [custom, setCustom] = useState<{ a: Dimension; b: Dimension }>({ a: "resource_position", b: "task" })
  const active = preset === "custom" ? custom : { a: strategyPresets.find((item) => item.value === preset)!.dimA, b: strategyPresets.find((item) => item.value === preset)!.dimB }
  const [selected, setSelected] = useState<string[]>([])
  const unsupported = ["a", "b"].map((side) => active[side as "a" | "b"]).find((dim) => "unsupported" in dimensionFixtures[dim])
  const pivot2Fixture = pivot2Fixtures[`${active.a}-${active.b}`] ?? null
  const available = pivot2Fixture !== null && isOk(pivot2Fixture) && pivot2Fixture.data.source.dimA === active.a && pivot2Fixture.data.source.dimB === active.b
  const rows = useMemo(() => (available && pivot2Fixture && isOk(pivot2Fixture) ? pivot2Fixture.data.source.rows : []), [available, pivot2Fixture])
  const { aKeys, bKeys, cells } = useMemo(() => crosstab(rows), [rows])
  const label = (dim: Dimension) => dimensions.find((item) => item.value === dim)?.label ?? dim
  const coverage = pivot2Fixture && isOk(pivot2Fixture) ? pivot2Fixture.meta?.cellCoverage : undefined

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
        <div className="relative flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <ExampleBadge className="absolute top-3 right-3" />
          <Badge variant="outline">{pivot2UnsupportedFixture.error.code}</Badge>
          <div className="text-sm font-medium">{label(unsupported)} 维度的数据源待确认</div>
          <p className="max-w-md text-xs text-muted-foreground">{unsupported === "bid_tool" ? pivot2UnsupportedFixture.error.message : "该维度无源前不出交叉表"}；{pivot2UnsupportedFixture.error.hint}</p>
        </div>
      ) : !available ? (
        <div className="relative flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
          <ExampleBadge className="absolute top-3 right-3" />
          <div className="text-sm font-medium">{label(active.a)} × {label(active.b)} 的样例待补</div>
          <p className="max-w-md text-xs text-muted-foreground">这个组合还没有样例数据；契约已冻，补样例后自动出表。</p>
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
      {pivot2Fixture && isOk(pivot2Fixture) ? <LineageFooter lineage={pivot2Fixture.data.source.lineage} extra={coverage ? <span>格子 {coverage.cells} · 有数 {coverage.withData} · 缺数 {coverage.undeterminable}</span> : null} /> : null}
    </div>
  )
}
