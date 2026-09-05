"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { IconDownload, IconListCheck, IconSparkles, IconStar, IconTag, IconUpload, IconUserPlus } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"
import { toast } from "sonner"

import { openAgentDrawer } from "@/components/business/command/events"
import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, useLocalOrder, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getAccountLifecycle, lifecycleStageMap, lifecycleStages, type AccountLifecycle, type LifecycleStage } from "@/lib/data/account-lifecycle"
import type { AnalysisRow } from "@/lib/data/contracts"
import type { DataViewMode, MetricValue } from "@/lib/data/data-view"
import { cn } from "@/lib/utils"
import { AccountInlinePeek, accountPageHref } from "./account-peek"
import { accountStatus, mediaLabel } from "./account-status"
import { LifecycleKanban, LifecyclePipeline, LifecycleTiles, lifecycleViews, rowId, UNASSIGNED, type LifecycleMap, type LifecycleView, type StageFilter } from "./lifecycle-views"

// 账户池 = 全户状态总览（老板 09-05 定义：全量账户按生命周期分层看，等待户按产品名分）。
// 结构：分层表达（分层卡 / 流程条 / 看板三种，用户自己切，见 lifecycle-views）→ 产品名 / 负责人筛选 + 分组开关 → 母版格式表（可按产品名分段）；看板视图替代表格。
// 阶段 / 产品名字段契约未给（F-006-Q4）：真实模式显「未接入」，mock 用 fixture 覆盖层演示。
function Metric({ cell }: { cell: MetricValue }) {
  if (cell.availability === "available") return <span className="tabular-nums">{cell.displayValue}</span>
  return <MissingValue title={cell.availability === "denominator_zero" ? "分母为 0" : cell.displayValue} />
}

function StageChip({ lifecycle }: { lifecycle: AccountLifecycle | null }) {
  if (!lifecycle) return <MissingValue title="生命周期阶段字段未接入（契约缺口 F-006-Q4）" />
  const stage = lifecycleStageMap[lifecycle.stage]
  return (
    <Badge variant="outline" className="gap-1.5 px-1.5 text-muted-foreground" title={`${stage.hint} · 自 ${lifecycle.since}`}>
      <span className={cn("size-1.5 rounded-full", stage.dot)} />
      {stage.label}
    </Badge>
  )
}

const helper = createColumnHelper<GridFeatures, AnalysisRow>()
function buildColumns(lifecycle: LifecycleMap) {
  return helper.columns([
    dragColumn<AnalysisRow>(),
    selectionColumn<AnalysisRow>(),
    helper.accessor("accountName", {
      header: "账户", enableHiding: false, meta: { label: "账户" },
      cell: ({ row }) => (
        <Button variant="link" className="h-auto w-fit px-0 text-left font-medium text-foreground" onClick={row.getToggleExpandedHandler()} aria-expanded={row.getIsExpanded()}>
          {row.original.accountName}
        </Button>
      ),
    }),
    helper.accessor("media", { header: "媒体", meta: { label: "媒体" }, cell: ({ getValue }) => <div className="w-16"><TypeChip>{mediaLabel(getValue())}</TypeChip></div> }),
    helper.accessor((row) => lifecycle.get(rowId(row))?.productName ?? "", { id: "productName", header: "产品名", meta: { label: "产品名" }, cell: ({ row }) => { const name = lifecycle.get(rowId(row.original))?.productName; return name ? <TypeChip>{name}</TypeChip> : <MissingValue title="产品名字段未接入（契约缺口 F-006-Q4）" /> } }),
    helper.accessor((row) => lifecycle.get(rowId(row))?.stage ?? "", { id: "stage", header: "阶段", meta: { label: "阶段" }, cell: ({ row }) => <StageChip lifecycle={lifecycle.get(rowId(row.original)) ?? null} /> }),
    helper.accessor("status", {
      header: "达标", meta: { label: "达标" },
      cell: ({ getValue }) => { const chip = accountStatus[getValue()]; return <StatusChip tone={chip.tone}>{chip.label}</StatusChip> },
    }),
    helper.accessor((row) => row.platform.spend.value, { id: "spend", header: "消耗", meta: { label: "消耗", align: "right" }, cell: ({ row }) => <Metric cell={row.original.platform.spend} /> }),
    helper.accessor((row) => row.platform.cpa.value, { id: "cpa", header: "真实 CPA", meta: { label: "真实 CPA", align: "right" }, cell: ({ row }) => <Metric cell={row.original.platform.cpa} /> }),
    helper.accessor((row) => row.assessmentCpa.value, { id: "assessment", header: "考核价", meta: { label: "考核价", align: "right" }, cell: ({ row }) => <Metric cell={row.original.assessmentCpa} /> }),
    helper.accessor("owner", {
      header: "负责人", meta: { label: "负责人" },
      cell: ({ row }) => {
        if (row.original.owner) return row.original.owner
        return (
          <>
            <Label htmlFor={`${row.id}-owner`} className="sr-only">负责人</Label>
            <Select onValueChange={() => toast("负责人分配接口（R-012）开放后生效")}>
              <SelectTrigger className="w-38 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate" size="sm" id={`${row.id}-owner`}><SelectValue placeholder="分配负责人" /></SelectTrigger>
              <SelectContent align="end"><SelectItem value="pending">待接口开放</SelectItem></SelectContent>
            </Select>
          </>
        )
      },
    }),
    helper.display({ id: "balance", header: "余额 · 断量", meta: { label: "余额 · 断量" }, cell: () => <MissingValue title="余额与断量倒计时随资金接口补充" /> }),
    helper.display({ id: "tasks", header: "关联任务", meta: { label: "关联任务" }, cell: () => <MissingValue title="任务关联随任务接口补充" /> }),
    helper.accessor("accountId", { header: "账户 ID", meta: { label: "账户 ID" }, cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue()}</span> }),
    actionsColumn<AnalysisRow>((data, row) => (
      <>
        <DropdownMenuItem onSelect={() => row.toggleExpanded()}>{row.getIsExpanded() ? "收起小传" : "展开小传"}</DropdownMenuItem>
        <DropdownMenuItem asChild><Link href={accountPageHref(data)}>打开完整账户页</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openAgentDrawer(`分析账户「${data.accountName}」的成本与量级`)}><IconSparkles />问 AI</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled title="负责人分配接口（R-012）开放后启用">分配负责人</DropdownMenuItem>
        <DropdownMenuItem disabled title="星标随用户偏好接口开放">星标</DropdownMenuItem>
        <DropdownMenuItem disabled title="任务挂载接口开放后启用">加入任务</DropdownMenuItem>
        <DropdownMenuItem disabled title="生命周期操作（加户 / 关户）随 OS 接口开放">变更阶段</DropdownMenuItem>
      </>
    )),
  ])
}

const bulkActions = (
  <>
    <Button variant="outline" size="sm" disabled title="负责人分配接口（R-012）开放后启用"><IconUserPlus />分配负责人</Button>
    <Button variant="outline" size="sm" disabled title="任务挂载接口开放后启用"><IconListCheck />加入任务</Button>
    <Button variant="outline" size="sm" disabled title="导出随报表接口（R-010）开放"><IconDownload />导出所选</Button>
  </>
)

/** 一段产品名分组：标题行（产品名 · 户数 · 阶段分布）+ 自己的表 */
function ProductSection({ product, rows, columns, lifecycle, dataView }: { product: string; rows: AnalysisRow[]; columns: ReturnType<typeof buildColumns>; lifecycle: LifecycleMap; dataView: DataViewMode }) {
  const table = useGridTable({ data: rows, columns, pageSize: 100, getRowId: rowId, initialColumnVisibility: { accountId: false, productName: false } })
  const distribution = lifecycleStages.map((stage) => ({ stage, count: rows.filter((row) => lifecycle.get(rowId(row))?.stage === stage.value).length })).filter((item) => item.count > 0)
  return (
    <section className="flex flex-col gap-3">
      <DataGrid
        table={table}
        showColumnPicker={false}
        showPagination={false}
        empty="该产品名下没有账户"
        renderExpanded={(row) => <AccountInlinePeek row={row} dataView={dataView} />}
        toolbar={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{product}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{rows.length} 户</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {distribution.map(({ stage, count }) => <span key={stage.value} className="inline-flex items-center gap-1 tabular-nums"><span className={cn("size-1.5 rounded-full", stage.dot)} />{stage.label} {count}</span>)}
            </span>
          </div>
        }
        bulkActions={bulkActions}
      />
    </section>
  )
}

export function AccountsTable({ rows, dataView, isMock, initialView = "tiles" }: { rows: AnalysisRow[]; dataView: DataViewMode; isMock: boolean; initialView?: LifecycleView }) {
  const [view, setView] = useState<LifecycleView>(initialView)
  const [stage, setStage] = useState<StageFilter>("all")
  const [product, setProduct] = useState("all")
  const [owner, setOwner] = useState("all")
  const [groupBy, setGroupBy] = useState<"none" | "product">("none")

  const lifecycle = useMemo<LifecycleMap>(() => new Map(rows.map((row) => [rowId(row), getAccountLifecycle(row.accountId, isMock)])), [rows, isMock])
  const available = useMemo(() => [...lifecycle.values()].some(Boolean), [lifecycle])
  const counts = useMemo(() => {
    const result = Object.fromEntries(lifecycleStages.map((item) => [item.value, 0])) as Record<LifecycleStage, number>
    for (const row of rows) { const item = lifecycle.get(rowId(row)); if (item) result[item.stage] += 1 }
    return result
  }, [rows, lifecycle])
  const products = useMemo(() => [...new Set(rows.map((row) => lifecycle.get(rowId(row))?.productName).filter((item): item is string => Boolean(item)))].sort((a, b) => a.localeCompare(b, "zh-CN")), [rows, lifecycle])
  const owners = useMemo(() => [...new Set(rows.map((row) => row.owner).filter(Boolean))].sort(), [rows])

  const { ordered, reorder } = useLocalOrder(rows, rowId)
  const data = useMemo(() => ordered.filter((row) => {
    const item = lifecycle.get(rowId(row))
    if (stage !== "all" && item?.stage !== stage) return false
    if (product !== "all" && (item?.productName ?? UNASSIGNED) !== product) return false
    if (owner !== "all" && row.owner !== owner) return false
    return true
  }), [ordered, lifecycle, stage, product, owner])
  const columns = useMemo(() => buildColumns(lifecycle), [lifecycle])
  const table = useGridTable({ data, columns, pageSize: 20, getRowId: rowId, initialColumnVisibility: { accountId: false } })

  const groups = useMemo(() => {
    if (groupBy !== "product") return []
    const map = new Map<string, AnalysisRow[]>()
    for (const row of data) { const key = lifecycle.get(rowId(row))?.productName ?? UNASSIGNED; map.set(key, [...(map.get(key) ?? []), row]) }
    return [...map.entries()].sort(([a], [b]) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b, "zh-CN")))
  }, [groupBy, data, lifecycle])

  const summaryProps = { counts, total: rows.length, value: stage, onChange: setStage, available }
  const viewSwitch = (
    <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(value) => { if (value) setView(value as LifecycleView) }} aria-label="分层表达">
      {lifecycleViews.map((item) => <ToggleGroupItem key={item.value} value={item.value} title={item.hint} className="px-3 text-xs">{item.label}</ToggleGroupItem>)}
    </ToggleGroup>
  )

  const filters = (
    <>
      <Select value={product} onValueChange={setProduct}>
        <SelectTrigger size="sm" className="w-36" aria-label="产品名"><SelectValue placeholder="产品名" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部产品名</SelectItem>
          {products.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          {available ? <SelectItem value={UNASSIGNED}>{UNASSIGNED}</SelectItem> : null}
        </SelectContent>
      </Select>
      <Select value={owner} onValueChange={setOwner}>
        <SelectTrigger size="sm" className="w-36" aria-label="负责人"><SelectValue placeholder="负责人" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部负责人</SelectItem>
          {owners.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
        </SelectContent>
      </Select>
      {view === "kanban" ? null : (
        <Select value={groupBy} onValueChange={(value) => setGroupBy(value as typeof groupBy)}>
          <SelectTrigger size="sm" className="w-36" aria-label="分组"><span className="text-muted-foreground">分组</span><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不分组</SelectItem>
            <SelectItem value="product" disabled={!available}>按产品名</SelectItem>
          </SelectContent>
        </Select>
      )}
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex"><Button variant="outline" size="sm" disabled><IconTag />标签</Button></span></TooltipTrigger>
        <TooltipContent side="bottom">双层标签（自动 + 人工）随契约 F-006-Q4 开放</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex"><Button variant="outline" size="sm" disabled><IconStar />星标</Button></span></TooltipTrigger>
        <TooltipContent side="bottom">星标随用户偏好接口开放</TooltipContent>
      </Tooltip>
    </>
  )
  const actions = (
    <Tooltip>
      <TooltipTrigger asChild><span className="inline-flex"><Button size="sm" disabled><IconUpload />导入账户</Button></span></TooltipTrigger>
      <TooltipContent side="bottom">账户认领 / 导入接口（R-012）开放后启用</TooltipContent>
    </Tooltip>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">生命周期分层</div>
        {viewSwitch}
      </div>
      {view === "tiles" ? <LifecycleTiles {...summaryProps} /> : null}
      {view === "pipeline" ? <LifecyclePipeline {...summaryProps} /> : null}
      {view === "kanban" ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
          <LifecycleKanban rows={data} lifecycle={lifecycle} available={available} />
        </div>
      ) : groupBy === "product" ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>
            <div className="flex items-center gap-2">{actions}</div>
          </div>
          {groups.length ? groups.map(([name, groupRows]) => <ProductSection key={name} product={name} rows={groupRows} columns={columns} lifecycle={lifecycle} dataView={dataView} />) : <p className="py-10 text-center text-sm text-muted-foreground">当前筛选下没有账户</p>}
        </div>
      ) : (
        <DataGrid
          table={table}
          empty="当前筛选下没有账户"
          onReorder={reorder}
          renderExpanded={(row) => <AccountInlinePeek row={row} dataView={dataView} />}
          toolbar={filters}
          actions={actions}
          bulkActions={bulkActions}
        />
      )}
    </div>
  )
}
