"use client"

import { useMemo, useState } from "react"
import { IconDeviceFloppy, IconDownload } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"
import { toast } from "sonner"

import { mediaLabel } from "@/components/business/accounts/account-status"
import { actionsColumn, DataGrid, dragColumn, selectionColumn, TypeChip, useGridTable, useLocalOrder, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { openAgentDrawer } from "@/components/business/command/events"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isOk, rv } from "@/lib/fixtures/contract"
import { exportQueuedFixture, tableFixture, type TableRow } from "@/lib/fixtures/data-analysis"
import { cn } from "@/lib/utils"
import { cell, GroupHeader, LineageFooter, OnTargetChip } from "./shared"

// 数据总表：账户日行 × 全字段；账面 / 现金两组列并排不混用；dataAnomaly 行着色；分页 100；自定义列；存列 = 个人视图；导出 = 队列
const rowId = (row: TableRow) => `${row.media}:${row.accountId}:${row.ds}`
const helper = createColumnHelper<GridFeatures, TableRow>()
const columns = helper.columns([
  dragColumn<TableRow>(),
  selectionColumn<TableRow>(),
  helper.accessor("accountName", { header: "账户", enableHiding: false, meta: { label: "账户" }, cell: ({ row }) => <span className="font-medium">{row.original.accountName}</span> }),
  helper.accessor("media", { header: "媒体", meta: { label: "媒体" }, cell: ({ getValue }) => <TypeChip>{mediaLabel(getValue())}</TypeChip> }),
  helper.accessor("ds", { header: "日期", meta: { label: "日期" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue().slice(5)}</span> }),
  helper.accessor((row) => row.tasks[0]?.taskName ?? "", { id: "task", header: "任务", meta: { label: "任务" }, cell: ({ getValue }) => getValue() ? <TypeChip>{getValue()}</TypeChip> : <span className="text-muted-foreground">−</span> }),
  helper.accessor((row) => row.metrics.cost.value, { id: "cost", header: () => <GroupHeader group="账面">消耗</GroupHeader>, meta: { label: "账面·消耗", align: "right" }, cell: ({ row }) => cell.money2(row.original.metrics.cost) }),
  helper.accessor((row) => row.metrics.exposure.value, { id: "exposure", header: () => <GroupHeader group="账面">曝光</GroupHeader>, meta: { label: "账面·曝光", align: "right" }, cell: ({ row }) => cell.int(row.original.metrics.exposure) }),
  helper.accessor((row) => row.metrics.click.value, { id: "click", header: () => <GroupHeader group="账面">点击</GroupHeader>, meta: { label: "账面·点击", align: "right" }, cell: ({ row }) => cell.int(row.original.metrics.click) }),
  helper.accessor((row) => row.metrics.ratios.ctr.value, { id: "ctr", header: () => <GroupHeader group="账面">CTR</GroupHeader>, meta: { label: "账面·CTR", align: "right" }, cell: ({ row }) => cell.percent(row.original.metrics.ratios.ctr) }),
  helper.accessor((row) => row.metrics.conversion.value, { id: "conversion", header: () => <GroupHeader group="账面">回传转化</GroupHeader>, meta: { label: "账面·回传转化", align: "right" }, cell: ({ row }) => cell.int(row.original.metrics.conversion) }),
  helper.accessor((row) => row.metrics.ratios.cvr.value, { id: "cvr", header: () => <GroupHeader group="账面">CVR</GroupHeader>, meta: { label: "账面·CVR", align: "right" }, cell: ({ row }) => cell.percent(row.original.metrics.ratios.cvr) }),
  helper.accessor((row) => row.metrics.ratios.realCpa.value, { id: "realCpa", header: () => <GroupHeader group="账面">账面 CPA</GroupHeader>, meta: { label: "账面·CPA", align: "right" }, cell: ({ row }) => cell.ratioMoney(row.original.metrics.ratios.realCpa) }),
  helper.accessor((row) => row.metrics.cashCost.value, { id: "cashCost", header: () => <GroupHeader group="现金">现金消耗</GroupHeader>, meta: { label: "现金·消耗", align: "right" }, cell: ({ row }) => cell.money2(row.original.metrics.cashCost) }),
  helper.accessor((row) => row.metrics.realConversion.value, { id: "realConversion", header: () => <GroupHeader group="现金">真实转化</GroupHeader>, meta: { label: "现金·真实转化", align: "right" }, cell: ({ row }) => cell.int(row.original.metrics.realConversion) }),
  helper.accessor((row) => row.metrics.ratios.cashCpa.value, { id: "cashCpa", header: () => <GroupHeader group="现金">现金 CPA</GroupHeader>, meta: { label: "现金·CPA", align: "right" }, cell: ({ row }) => cell.ratioMoney(row.original.metrics.ratios.cashCpa) }),
  helper.accessor((row) => row.assessment.price?.value ?? null, { id: "assessment", header: () => <GroupHeader group="现金">考核价</GroupHeader>, meta: { label: "现金·考核价", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{row.original.assessment.price ? `¥${row.original.assessment.price.value.toFixed(2)}` : "−"}</span> }),
  helper.accessor((row) => row.assessment.costStatus ?? "", { id: "onTarget", header: () => <GroupHeader group="现金">达标</GroupHeader>, meta: { label: "现金·达标" }, cell: ({ row }) => <OnTargetChip assessment={row.original.assessment} /> }),
  helper.accessor((row) => row.metrics.costSpace.value, { id: "costSpace", header: () => <GroupHeader group="现金">成本空间</GroupHeader>, meta: { label: "现金·成本空间", align: "right" }, cell: ({ row }) => cell.money2(row.original.metrics.costSpace) }),
  helper.accessor((row) => row.assessment.budgetUsageRate?.value ?? null, { id: "budgetUsage", header: "预算使用率", meta: { label: "预算使用率", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{rv(row.original.assessment.budgetUsageRate)}</span> }),
  helper.accessor((row) => row.metrics.ratios.gap.value, { id: "gap", header: "GAP", meta: { label: "GAP", align: "right" }, cell: ({ row }) => cell.percent(row.original.metrics.ratios.gap) }),
  helper.accessor((row) => row.metrics.wakeUv.value, { id: "wakeUv", header: () => <GroupHeader group="漏斗">唤端 UV</GroupHeader>, meta: { label: "漏斗·唤端 UV", align: "right" }, cell: ({ row }) => cell.int(row.original.metrics.wakeUv) }),
  helper.accessor((row) => row.metrics.potentialUv.value, { id: "potentialUv", header: () => <GroupHeader group="漏斗">潜客 UV</GroupHeader>, meta: { label: "漏斗·潜客 UV", align: "right" }, cell: ({ row }) => cell.int(row.original.metrics.potentialUv) }),
  helper.accessor((row) => row.metrics.ratios.potentialRate.value, { id: "potentialRate", header: () => <GroupHeader group="漏斗">潜客率</GroupHeader>, meta: { label: "漏斗·潜客率", align: "right" }, cell: ({ row }) => cell.percent(row.original.metrics.ratios.potentialRate) }),
  helper.accessor((row) => row.metrics.ratios.biConversionRate.value, { id: "biRate", header: () => <GroupHeader group="漏斗">BI 转化率</GroupHeader>, meta: { label: "漏斗·BI 转化率", align: "right" }, cell: ({ row }) => cell.percent(row.original.metrics.ratios.biConversionRate) }),
  helper.accessor("accountId", { header: "账户 ID", meta: { label: "账户 ID" }, cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue()}</span> }),
  actionsColumn<TableRow>((row) => (
    <>
      <DropdownMenuItem onSelect={() => openAgentDrawer(`分析账户「${row.accountName}」${row.ds} 的账面与现金差异`)}>问 AI</DropdownMenuItem>
      <DropdownMenuItem disabled title="账户小传随账户池详情打开">打开账户</DropdownMenuItem>
    </>
  )),
])

export function TableTab({ onSaveView }: { onSaveView: (name: string, columns: string[]) => void }) {
  const fixture = tableFixture
  const rows = useMemo(() => (isOk(fixture) ? fixture.data.source.rows : []), [fixture])
  const [media, setMedia] = useState("all")
  const [account, setAccount] = useState("all")
  const data = useMemo(() => rows.filter((row) => (media === "all" || row.media === media) && (account === "all" || row.accountId === account)), [rows, media, account])
  const { ordered, reorder } = useLocalOrder(data, rowId)
  const table = useGridTable({ data: ordered, columns, pageSize: 100, getRowId: rowId, initialColumnVisibility: { accountId: false, wakeUv: false, potentialUv: false, potentialRate: false, biRate: false, exposure: false, click: false } })
  if (!isOk(fixture)) return null
  const lineage = fixture.data.source.lineage
  const accounts = [...new Map(rows.map((row) => [row.accountId, row.accountName])).entries()]

  return (
    <div className="flex flex-col gap-3">
      <DataGrid
        table={table}
        density="compact"
        empty="当前窗口没有明细"
        onReorder={reorder}
        toolbar={
          <>
            <Select value={media} onValueChange={setMedia}>
              <SelectTrigger size="sm" className="w-28" aria-label="媒体"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">全部媒体</SelectItem><SelectItem value="KUAISHOU">快手</SelectItem></SelectContent>
            </Select>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger size="sm" className="w-44" aria-label="账户"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">全部账户</SelectItem>{accounts.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">账户 × 日 · 分页 100 · 账面 / 现金两组并排</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => { const visible = table.getVisibleLeafColumns().map((column) => column.id).filter((id) => !["drag", "select", "actions"].includes(id)); onSaveView("我的总表视图", visible); toast.success("已存为个人视图「我的总表视图」", { description: "PUT /me/views 接入后同步到账号" }) }}><IconDeviceFloppy />存列</Button>
            <Button variant="outline" size="sm" onClick={() => { const queued = isOk(exportQueuedFixture) ? exportQueuedFixture.data : null; toast(queued ? `已加入导出队列 · ${queued.format}` : "导出接口接入后可用", { description: queued ? `exportId ${queued.exportId.slice(-6)} · 状态 ${queued.status}；完成后带口径戳与数据日期` : undefined }) }}><IconDownload />导出 Excel</Button>
          </>
        }
        bulkActions={<Button variant="outline" size="sm" onClick={() => openAgentDrawer(`分析所选 ${table.getSelectedRowModel().rows.length} 条账户日行`)}>分析所选</Button>}
      />
      <div className={cn("flex flex-wrap items-center justify-between gap-2")}>
        <LineageFooter lineage={lineage} extra={<span>异常日行（dataAnomaly）左侧红标</span>} />
        {fixture.data.source.warnings.length ? <span className="text-xs text-status-warning">{fixture.data.source.warnings.join("；")}</span> : null}
      </div>
    </div>
  )
}
