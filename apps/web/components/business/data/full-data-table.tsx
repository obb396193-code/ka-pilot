"use client"

import Link from "next/link"
import { IconDownload, IconSparkles } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"

import { accountStatus, mediaLabel } from "@/components/business/accounts/account-status"
import { openAgentDrawer } from "@/components/business/command/events"
import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, useLocalOrder, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AnalysisRow } from "@/lib/data/contracts"
import type { MetricValue } from "@/lib/data/data-view"

function Metric({ cell }: { cell: MetricValue }) {
  if (cell.availability === "available") return <span className="tabular-nums">{cell.displayValue}</span>
  return <MissingValue title={cell.availability === "denominator_zero" ? "分母为 0" : cell.displayValue} />
}
const authorityLabel = { ka_data: "KA Data", platform: "自建平台", source_versioned: "分来源版本" } as const

function fullPageHref(row: AnalysisRow) {
  return `/accounts/${encodeURIComponent(row.accountId)}?media=${encodeURIComponent(row.media)}`
}

// 数据总表：账户 × 全部可得字段，母版表格格式；「自定义列」正好用上（KA 侧列默认隐藏，可打开）。20+ 列随 query{table}（R-010）扩展。
const helper = createColumnHelper<GridFeatures, AnalysisRow>()
const rowId = (row: AnalysisRow) => `${row.media}:${row.accountId}`
const columns = helper.columns([
  dragColumn<AnalysisRow>(),
  selectionColumn<AnalysisRow>(),
  helper.accessor("accountName", { header: "账户", enableHiding: false, meta: { label: "账户" }, cell: ({ row }) => <Button asChild variant="link" className="h-auto w-fit px-0 text-left font-medium text-foreground"><Link href={fullPageHref(row.original)}>{row.original.accountName}</Link></Button> }),
  helper.accessor("media", { header: "媒体", meta: { label: "媒体" }, cell: ({ getValue }) => <div className="w-20"><TypeChip>{mediaLabel(getValue())}</TypeChip></div> }),
  helper.accessor("owner", { header: "负责人", meta: { label: "负责人" } }),
  helper.accessor((row) => row.platform.spend.value, { id: "spend", header: "消耗", meta: { label: "消耗", align: "right" }, cell: ({ row }) => <Metric cell={row.original.platform.spend} /> }),
  helper.accessor((row) => row.platform.conversions.value, { id: "conversions", header: "真实转化", meta: { label: "真实转化", align: "right" }, cell: ({ row }) => <Metric cell={row.original.platform.conversions} /> }),
  helper.accessor((row) => row.platform.cpa.value, { id: "cpa", header: "真实 CPA", meta: { label: "真实 CPA", align: "right" }, cell: ({ row }) => <Metric cell={row.original.platform.cpa} /> }),
  helper.accessor((row) => row.assessmentCpa.value, { id: "assessment", header: "考核价", meta: { label: "考核价", align: "right" }, cell: ({ row }) => <Metric cell={row.original.assessmentCpa} /> }),
  helper.accessor("status", { header: "达标", meta: { label: "达标" }, cell: ({ getValue }) => { const chip = accountStatus[getValue()]; return <StatusChip tone={chip.tone}>{chip.label}</StatusChip> } }),
  helper.accessor((row) => row.kaData.spend.value, { id: "kaSpend", header: "KA 消耗", meta: { label: "KA 消耗", align: "right" }, cell: ({ row }) => <Metric cell={row.original.kaData.spend} /> }),
  helper.accessor((row) => row.kaData.cpa.value, { id: "kaCpa", header: "KA CPA", meta: { label: "KA CPA", align: "right" }, cell: ({ row }) => <Metric cell={row.original.kaData.cpa} /> }),
  helper.accessor((row) => row.authorityByMetric.cpa.defaultSource, { id: "authority", header: "默认来源", meta: { label: "默认来源" }, cell: ({ row }) => <span className="text-xs text-muted-foreground">{authorityLabel[row.original.authorityByMetric.cpa.defaultSource]}</span> }),
  helper.accessor("accountId", { header: "账户 ID", meta: { label: "账户 ID" }, cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue()}</span> }),
  helper.display({ id: "ctr", header: "CTR", meta: { label: "CTR", align: "right" }, cell: () => <MissingValue title="随 query{table} 全字段接口开放" /> }),
  helper.display({ id: "budget", header: "预算使用率", meta: { label: "预算使用率", align: "right" }, cell: () => <MissingValue title="随 query{table} 全字段接口开放" /> }),
  actionsColumn<AnalysisRow>((row) => (
    <>
      <DropdownMenuItem asChild><Link href={fullPageHref(row)}>打开账户页</Link></DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openAgentDrawer(`分析账户「${row.accountName}」的成本与量级`)}><IconSparkles />问 AI</DropdownMenuItem>
    </>
  )),
])

export function FullDataTable({ rows, onSelectionChange }: { rows: AnalysisRow[]; onSelectionChange?: (ids: string[]) => void }) {
  // KA 侧列默认隐藏，用「自定义列」打开（初始态给 hook，不能在渲染中 setState——会 SSR/客户端不一致）
  const { ordered, reorder } = useLocalOrder(rows, rowId)
  const table = useGridTable({ data: ordered, columns, pageSize: 100, getRowId: rowId, initialColumnVisibility: { kaSpend: false, kaCpa: false, authority: false, accountId: false }, onRowSelectionChange: onSelectionChange })
  return (
    <DataGrid
      table={table}
      onReorder={reorder}
      density="compact"
      empty="当前范围内没有明细"
      toolbar={<span className="text-xs text-muted-foreground">账户 × 全部可得字段 · 分页 100 · 列可显隐</span>}
      actions={
        <Tooltip>
          <TooltipTrigger asChild><span className="inline-flex"><Button variant="outline" size="sm" disabled><IconDownload />导出 Excel</Button></span></TooltipTrigger>
          <TooltipContent side="bottom">模板化导出随报表接口（R-010）开放</TooltipContent>
        </Tooltip>
      }
      bulkActions={<Button variant="outline" size="sm" disabled title="导出随报表接口（R-010）开放"><IconDownload />导出所选</Button>}
    />
  )
}
