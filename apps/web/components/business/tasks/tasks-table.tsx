"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { IconArchive, IconDownload, IconPlus, IconSparkles } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"

import { openAgentDrawer } from "@/components/business/command/events"
import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, useLocalOrder, type GridFeatures, type StatusTone } from "@/components/business/data-grid/data-grid"
import { formatDate, formatInteger, formatMoney, formatRatio } from "@/components/business/data-grid/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { TaskListResponse } from "@/lib/data/task-list-contracts"
import { cn } from "@/lib/utils"
import type { TaskStatusFilter } from "./use-task-list"

export type TaskItem = Extract<TaskListResponse, { ok: true }>["data"]["items"][number]

// 任务状态 → 母版状态 chip：进行中转圈 / 准备中时钟 / 已结束虚线圈（不用绿勾，结束≠达标）
export const taskStatus: Record<TaskItem["status"], { label: string; tone: StatusTone }> = {
  active: { label: "进行中", tone: "progress" },
  preparing: { label: "准备中", tone: "pending" },
  ended: { label: "已结束", tone: "muted" },
}

// pacing 条：目标进度 vs 时间进度，全部来自后端 computeTaskPacing，前端只画
function PacingBar({ pacing }: { pacing: TaskItem["pacing"] }) {
  if (!pacing || pacing.targetProgress.state !== "finite" || pacing.timeProgress.state !== "finite" || pacing.targetProgress.value === null || pacing.timeProgress.value === null) return <MissingValue title="pacing 未返回" />
  const target = Math.min(1, pacing.targetProgress.value), time = Math.min(1, pacing.timeProgress.value)
  const behind = target + 0.05 < time
  return (
    <div className="min-w-36" title={`目标进度 ${formatRatio(pacing.targetProgress)} · 时间进度 ${formatRatio(pacing.timeProgress)}`}>
      <div className="relative h-1.5 rounded-full bg-muted">
        <div className={cn("h-full rounded-full", behind ? "bg-status-warning" : "bg-status-success")} style={{ width: `${target * 100}%` }} />
        <span aria-hidden className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-foreground/60" style={{ left: `calc(${time * 100}% - 1px)` }} />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">达成 {formatRatio(pacing.targetProgress)} · 时间 {formatRatio(pacing.timeProgress)}{pacing.projectedGap !== null && pacing.projectedGap > 0 ? ` · 预计缺口 ${formatInteger(pacing.projectedGap)}` : ""}</div>
    </div>
  )
}

function taskHref(item: TaskItem) {
  return `/tasks/${encodeURIComponent(item.taskId)}`
}

const helper = createColumnHelper<GridFeatures, TaskItem>()
const columns = helper.columns([
  dragColumn<TaskItem>(),
  selectionColumn<TaskItem>(),
  helper.accessor("taskName", {
    header: "任务", enableHiding: false, meta: { label: "任务" },
    cell: ({ row }) => <Button asChild variant="link" className="h-auto w-fit px-0 text-left font-medium text-foreground"><Link href={taskHref(row.original)}>{row.original.taskName ?? "−"}</Link></Button>,
  }),
  helper.accessor("bizName", { header: "业务", meta: { label: "业务" }, cell: ({ getValue }) => getValue() ? <TypeChip>{getValue()}</TypeChip> : <MissingValue title="业务未提供" /> }),
  helper.accessor("status", { header: "状态", meta: { label: "状态" }, cell: ({ getValue }) => { const chip = taskStatus[getValue()]; return <StatusChip tone={chip.tone}>{chip.label}</StatusChip> } }),
  helper.accessor((row) => row.period?.start ?? "", { id: "period", header: "周期", meta: { label: "周期" }, cell: ({ row }) => row.original.period ? <span className="tabular-nums">{formatDate(row.original.period.start)} – {formatDate(row.original.period.end)}</span> : <MissingValue /> }),
  helper.accessor((row) => row.volume?.target ?? null, { id: "target", header: "目标", meta: { label: "目标", align: "right" }, cell: ({ row }) => formatInteger(row.original.volume?.target) }),
  helper.accessor((row) => row.volume?.completed ?? null, { id: "completed", header: "已完成", meta: { label: "已完成", align: "right" }, cell: ({ row }) => formatInteger(row.original.volume?.completed) }),
  helper.display({ id: "pacing", header: "达成 / pacing", meta: { label: "达成 / pacing" }, cell: ({ row }) => <PacingBar pacing={row.original.pacing} /> }),
  helper.accessor((row) => row.assessmentPrice?.value ?? null, { id: "assessment", header: "考核价", meta: { label: "考核价", align: "right" }, cell: ({ row }) => row.original.assessmentPrice ? <span className="tabular-nums" title={`生效 ${row.original.assessmentPrice.effectiveDate}`}>{formatMoney(row.original.assessmentPrice.value)}</span> : <MissingValue /> }),
  helper.display({ id: "compliance", header: "达标率", meta: { label: "达标率", align: "right" }, cell: () => <MissingValue title="任务达标率随任务详情接口补充" /> }),
  helper.accessor("linkedAccountCount", { header: "账户数", meta: { label: "账户数", align: "right" }, cell: ({ getValue }) => formatInteger(getValue()) }),
  helper.accessor("taskId", { header: "任务 ID", meta: { label: "任务 ID" }, cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue()}</span> }),
  helper.accessor((row) => row.workItemSummary.counts.P0, {
    id: "workItems", header: "待处理", meta: { label: "待处理" },
    cell: ({ row }) => {
      const counts = row.original.workItemSummary.counts
      return (
        <div className="flex items-center gap-2 text-xs tabular-nums">
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-status-critical" />P0 {counts.P0}</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-status-warning" />P1 {counts.P1}</span>
        </div>
      )
    },
  }),
  actionsColumn<TaskItem>((item) => (
    <>
      <DropdownMenuItem asChild><Link href={taskHref(item)}>查看详情</Link></DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openAgentDrawer(`分析任务「${item.taskName ?? item.taskId}」的达成与 pacing`)}><IconSparkles />问 AI</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled title="任务编辑接口（R-010）开放后启用">编辑</DropdownMenuItem>
      <DropdownMenuItem disabled title="归档接口开放后启用">归档</DropdownMenuItem>
    </>
  )),
])

const tabs: { value: TaskStatusFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "active", label: "进行中" },
  { value: "preparing", label: "准备中" },
  { value: "ended", label: "已结束" },
]

export function TasksTable({ items, status, onStatusChange }: { items: TaskItem[]; status: TaskStatusFilter; onStatusChange: (status: TaskStatusFilter) => void }) {
  // tab 计数只在拿到全量列表时更新（筛选态的列表不含其他状态）
  const [counts, setCounts] = useState<Partial<Record<TaskItem["status"], number>>>({})
  useEffect(() => {
    if (status !== "all") return
    const next: Partial<Record<TaskItem["status"], number>> = {}
    for (const item of items) next[item.status] = (next[item.status] ?? 0) + 1
    setCounts(next)
  }, [items, status])
  const { ordered, reorder } = useLocalOrder(items, (row) => row.taskId)
  const table = useGridTable({ data: ordered, columns, pageSize: 20, getRowId: (row) => row.taskId, initialColumnVisibility: { taskId: false } })
  return (
    <DataGrid
      table={table}
      empty="没有符合条件的任务"
      onReorder={reorder}
      toolbar={
        <Tabs value={status} onValueChange={(value) => onStatusChange(value as TaskStatusFilter)}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {tab.value !== "all" && counts[tab.value] !== undefined ? <Badge variant="secondary">{counts[tab.value]}</Badge> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
      actions={
        <Tooltip>
          <TooltipTrigger asChild><span className="inline-flex"><Button size="sm" disabled><IconPlus />新建任务</Button></span></TooltipTrigger>
          <TooltipContent side="bottom">创建接口（R-010）开放后启用</TooltipContent>
        </Tooltip>
      }
      bulkActions={
        <>
          <Button variant="outline" size="sm" disabled title="归档接口开放后启用"><IconArchive />归档</Button>
          <Button variant="outline" size="sm" disabled title="导出随报表接口（R-010）开放"><IconDownload />导出所选</Button>
        </>
      }
    />
  )
}
