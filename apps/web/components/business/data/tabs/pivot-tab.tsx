"use client"

import { useMemo, useState } from "react"
import { IconSparkles } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"

import { openAgentDrawer } from "@/components/business/command/events"
import { DataGrid, selectionColumn, useGridTable, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { ExampleBadge } from "@/components/business/state/page-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isOk } from "@/lib/fixtures/contract"
import { dimensionFixtures, dimensions, type Dimension, type DimensionRow } from "@/lib/fixtures/data-analysis"
import { cn } from "@/lib/utils"
import { cell, LineageFooter, OnTargetChip } from "./shared"

// 维度透视：8 维 tab + 母版表；异常行着色；勾选 → 「分析这 N 个」唤 Agent；无源维度显「数据源待确认」空态
const helper = createColumnHelper<GridFeatures, DimensionRow>()
const columns = helper.columns([
  selectionColumn<DimensionRow>(),
  helper.accessor("label", { header: "维度值", enableHiding: false, meta: { label: "维度值" }, cell: ({ row }) => <span className={cn("font-medium", row.original.anomaly && "text-status-critical")}>{row.original.label}{row.original.anomaly ? <Badge variant="outline" className="ml-2 text-status-critical">异常</Badge> : null}</span> }),
  helper.accessor((row) => row.metrics.cost.value, { id: "cost", header: "账面消耗", meta: { label: "账面消耗", align: "right" }, cell: ({ row }) => cell.money(row.original.metrics.cost) }),
  helper.accessor((row) => row.metrics.cashCost.value, { id: "cashCost", header: "现金消耗", meta: { label: "现金消耗", align: "right" }, cell: ({ row }) => cell.money(row.original.metrics.cashCost) }),
  helper.accessor((row) => row.metrics.realConversion.value, { id: "realConversion", header: "真实转化", meta: { label: "真实转化", align: "right" }, cell: ({ row }) => cell.int(row.original.metrics.realConversion) }),
  helper.accessor((row) => row.metrics.ratios.cashCpa.value, { id: "cashCpa", header: "现金 CPA", meta: { label: "现金 CPA", align: "right" }, cell: ({ row }) => cell.ratioMoney(row.original.metrics.ratios.cashCpa) }),
  helper.accessor((row) => row.assessment.costStatus ?? "", { id: "onTarget", header: "达标", meta: { label: "达标" }, cell: ({ row }) => <OnTargetChip assessment={row.original.assessment} /> }),
  helper.accessor((row) => row.metrics.costSpace.value, { id: "costSpace", header: "成本空间", meta: { label: "成本空间", align: "right" }, cell: ({ row }) => cell.money(row.original.metrics.costSpace) }),
  helper.accessor((row) => row.metrics.ratios.ctr.value, { id: "ctr", header: "CTR", meta: { label: "CTR", align: "right" }, cell: ({ row }) => cell.percent(row.original.metrics.ratios.ctr) }),
  helper.accessor((row) => row.metrics.ratios.cvr.value, { id: "cvr", header: "CVR", meta: { label: "CVR", align: "right" }, cell: ({ row }) => cell.percent(row.original.metrics.ratios.cvr) }),
  helper.accessor((row) => row.metrics.ratios.gap.value, { id: "gap", header: "差异", meta: { label: "差异", align: "right" }, cell: ({ row }) => cell.percent(row.original.metrics.ratios.gap) }),
])

function DimensionTable({ dimension }: { dimension: Dimension }) {
  const fixture = dimensionFixtures[dimension]
  const rows = useMemo(() => ("unsupported" in fixture || !isOk(fixture) ? [] : fixture.data.source.rows), [fixture])
  const [selected, setSelected] = useState<string[]>([])
  const table = useGridTable({ data: rows, columns, pageSize: 50, getRowId: (row) => row.key, onRowSelectionChange: setSelected })
  const label = dimensions.find((item) => item.value === dimension)?.label ?? dimension
  if ("unsupported" in fixture) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
        <Badge variant="outline">DIMENSION_UNSUPPORTED</Badge>
        <div className="text-sm font-medium">{label} 维度的数据源待确认</div>
        <p className="max-w-md text-xs leading-5 text-muted-foreground">{fixture.message}；不会用猜测的数据填充。</p>
      </div>
    )
  }
  if (!isOk(fixture)) return null
  const minimal = fixture.meta?.requestId === "fe-minimal-mock"
  return (
    <div className="relative flex flex-col gap-3">
      {minimal ? <ExampleBadge className="absolute top-2 right-2 z-10" /> : null}
      <DataGrid
        table={table}
        density="compact"
        showPagination={false}
        empty={`${label} 维度没有数据`}
        toolbar={<span className="text-xs text-muted-foreground">按 {label} 聚合 · 异常行红标 · 勾选后可整批交给 Agent</span>}
        actions={<Button variant="outline" size="sm" disabled={selected.length === 0} onClick={() => openAgentDrawer(`分析 ${label} 维度下这 ${selected.length} 项的成本与量级：${selected.join("、")}`)}><IconSparkles />分析这 {selected.length || rows.length} 个</Button>}
      />
      <LineageFooter lineage={fixture.data.source.lineage} extra={minimal ? <span className="text-status-warning">{fixture.data.source.warnings[0]}</span> : null} />
    </div>
  )
}

export function PivotTab() {
  const [dimension, setDimension] = useState<Dimension>("resource_position")
  return (
    <div className="flex flex-col gap-4">
      <Tabs value={dimension} onValueChange={(value) => setDimension(value as Dimension)}>
        <TabsList className="flex-wrap">
          {dimensions.map((item) => <TabsTrigger key={item.value} value={item.value}>{item.label}{"unsupported" in dimensionFixtures[item.value] ? <span className="ml-1 text-[10px] text-muted-foreground">待接</span> : null}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <DimensionTable key={dimension} dimension={dimension} />
    </div>
  )
}
