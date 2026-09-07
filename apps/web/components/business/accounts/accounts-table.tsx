"use client"

import { useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { IconSparkles } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"
import { toast } from "sonner"

import { openAgentDrawer } from "@/components/business/command/events"
import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, useLocalOrder, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { accountHref, cutoffLabel, lifecycleLabel, poolStatusMap, type AccountItem } from "@/lib/fixtures/accounts"
import { fmtTime, mv, rv } from "@/lib/fixtures/contract"
import { cn } from "@/lib/utils"
import { AccountInlinePeek } from "./account-peek"
import { accountStatusTone, mediaLabel } from "./account-status"

// 账户池表（F-007 §2 12 列，母版格式 D6）：☐ | 账户 | 负责人 | 绑定任务 | 产品名 | 账户状态 + 投放阶段 | 余额·断量 | 日预算卡 | 消耗 | 现金 CPA(达标) | 容量负载 | 最近操作 | 建议下一步 | ⋯
export const rowId = (item: AccountItem) => `${item.media}:${item.accountId}`

export type RowActions = { onTransfer: (items: AccountItem[]) => void; onPoolStatus: (item: AccountItem) => void; onProduct: (item: AccountItem) => void; onReplicate: (item: AccountItem) => void }

const helper = createColumnHelper<GridFeatures, AccountItem>()
function buildColumns(actions: RowActions) {
  return helper.columns([
    dragColumn<AccountItem>(),
    selectionColumn<AccountItem>(),
    helper.accessor("accountName", {
      header: "账户", enableHiding: false, meta: { label: "账户" },
      cell: ({ row }) => <Button variant="link" className="h-auto w-fit px-0 text-left font-medium text-foreground" onClick={row.getToggleExpandedHandler()} aria-expanded={row.getIsExpanded()}>{row.original.starred ? <span className="mr-1 text-status-warning">★</span> : null}{row.original.accountName}</Button>,
    }),
    helper.accessor("media", { header: "媒体", meta: { label: "媒体" }, cell: ({ getValue }) => <TypeChip>{mediaLabel(getValue())}</TypeChip> }),
    helper.accessor((row) => row.owner?.displayName ?? "", { id: "owner", header: "负责人", meta: { label: "负责人" }, cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">待分配</span> }),
    helper.accessor((row) => row.linkedTasks[0]?.taskName ?? "", { id: "task", header: "绑定任务", meta: { label: "绑定任务" }, cell: ({ row }) => row.original.linkedTasks[0] ? <Link href={`/tasks/${encodeURIComponent(row.original.linkedTasks[0].taskId)}`} className="underline-offset-4 hover:underline">{row.original.linkedTasks[0].taskName}</Link> : <span className="text-muted-foreground">未挂</span> }),
    helper.accessor((row) => row.product?.name ?? "", { id: "product", header: "产品名", meta: { label: "产品名" }, cell: ({ getValue }) => getValue() ? <TypeChip>{getValue()}</TypeChip> : <MissingValue title="未填产品名" /> }),
    helper.accessor("poolStatus", { header: "库存态", meta: { label: "库存态" }, cell: ({ row }) => { const meta = poolStatusMap[row.original.poolStatus]; return <TypeChip className="gap-1.5" ><span className={cn("size-1.5 rounded-full", meta.dot)} />{meta.label}{row.original.poolStatusSource === "manual" ? <span className="text-[10px]">手</span> : null}</TypeChip> } }),
    helper.accessor("lifecycleStage", { header: "投放阶段", meta: { label: "投放阶段" }, cell: ({ getValue }) => getValue() === "unknown" ? <MissingValue title="未开投或阶段未判定" /> : <TypeChip>{lifecycleLabel[getValue()]}</TypeChip> }),
    helper.accessor((row) => row.balance?.value ?? null, { id: "balance", header: "余额 · 断量", meta: { label: "余额 · 断量", align: "right" }, cell: ({ row }) => {
      const balance = row.original.balance
      if (!balance) return <MissingValue title="资金接口未返回" />
      const cutoff = cutoffLabel[balance.cutoff.state]
      return <div className="flex flex-col items-end"><span className="tabular-nums">{balance.value === null ? "−" : `¥${Math.round(balance.value).toLocaleString("zh-CN")}`}</span><span className={cn("text-[11px] tabular-nums", cutoff.tone)}>{balance.cutoff.hours.availability === "available" ? `${mv(balance.cutoff.hours, "num")}h 断量` : cutoff.label}</span></div>
    } }),
    helper.accessor("dailyBudgetCap", { header: "日预算卡", meta: { label: "日预算卡", align: "right" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue() === null ? "−" : `¥${Math.round(getValue() as number).toLocaleString("zh-CN")}`}</span> }),
    helper.accessor((row) => row.metrics?.cost.value ?? null, { id: "cost", header: "消耗", meta: { label: "消耗", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{mv(row.original.metrics?.cost, "money0")}</span> }),
    helper.accessor((row) => row.metrics?.ratios.cashCpa.value ?? null, { id: "cashCpa", header: "现金 CPA", meta: { label: "现金 CPA", align: "right" }, cell: ({ row }) => { const chip = accountStatusTone(row.original.assessment); return <div className="flex items-center justify-end gap-2"><span className="tabular-nums">{rv(row.original.metrics?.ratios.cashCpa, "money")}</span><StatusChip tone={chip.tone}>{chip.label}</StatusChip></div> } }),
    helper.accessor((row) => row.capacityLoad.value, { id: "capacityLoad", header: "容量负载", meta: { label: "容量负载" }, cell: ({ row }) => {
      const load = row.original.capacityLoad
      if (load.state !== "finite" || load.value === null) return <MissingValue title="无日预算卡或消耗缺" />
      const width = Math.min(100, Math.round(load.value * 100))
      return <div className="flex min-w-24 items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", width >= 90 ? "bg-status-critical" : width >= 70 ? "bg-status-warning" : "bg-foreground")} style={{ width: `${width}%` }} /></span><span className="text-xs tabular-nums">{rv(load)}</span></div>
    } }),
    helper.accessor((row) => row.lastAction?.at ?? "", { id: "lastAction", header: "最近操作", meta: { label: "最近操作" }, cell: ({ row }) => row.original.lastAction ? <div className="flex flex-col"><span className="text-sm">{row.original.lastAction.summary}</span><span className="text-[11px] text-muted-foreground tabular-nums">{fmtTime(row.original.lastAction.at)}</span></div> : <MissingValue title="没有操作记录" /> }),
    helper.accessor((row) => row.nextSuggestion?.title ?? "", { id: "nextSuggestion", header: "建议下一步", meta: { label: "建议下一步" }, cell: ({ row }) => row.original.nextSuggestion ? <Link href={`/diagnostics/${row.original.nextSuggestion.workItemId}`} className="text-sm underline-offset-4 hover:underline">{row.original.nextSuggestion.title}</Link> : <span className="text-xs text-muted-foreground">无</span> }),
    helper.accessor("accountId", { header: "账户 ID", meta: { label: "账户 ID" }, cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue()}</span> }),
    actionsColumn<AccountItem>((item, row) => (
      <>
        <DropdownMenuItem onSelect={() => row.toggleExpanded()}>{row.getIsExpanded() ? "收起小传" : "展开小传"}</DropdownMenuItem>
        <DropdownMenuItem asChild><Link href={accountHref(item)}>打开完整账户页</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openAgentDrawer(`分析账户「${item.accountName}」的成本与量级`)}><IconSparkles />问 AI</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.onPoolStatus(item)}>改库存态</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onProduct(item)}>改产品名</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onTransfer([item])}>转移负责人</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onReplicate(item)}>发起优质户复制</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast("已加入盯盘名单", { description: "接入后保存" })}>加入盯盘</DropdownMenuItem>
        <DropdownMenuItem disabled title="星标随用户偏好接口开放">星标</DropdownMenuItem>
      </>
    )),
  ])
}

export function AccountsTable({ items, actions, toolbar, headerActions, bulkActions, onSelectionChange, showColumnPicker = true, showPagination = true, emptyText = "当前筛选下没有账户" }: {
  items: AccountItem[]
  actions: RowActions
  toolbar?: ReactNode
  headerActions?: ReactNode
  bulkActions?: ReactNode
  onSelectionChange?: (ids: string[]) => void
  showColumnPicker?: boolean
  showPagination?: boolean
  emptyText?: string
}) {
  const columns = useMemo(() => buildColumns(actions), [actions])
  const { ordered, reorder } = useLocalOrder(items, rowId)
  const [, force] = useState(0)
  const table = useGridTable({ data: ordered, columns, pageSize: 20, getRowId: rowId, initialColumnVisibility: { accountId: false, lastAction: false }, onRowSelectionChange: (ids) => { onSelectionChange?.(ids); force((n) => n + 1) } })
  return (
    <DataGrid
      table={table}
      empty={emptyText}
      onReorder={reorder}
      showColumnPicker={showColumnPicker}
      showPagination={showPagination}
      renderExpanded={(item) => <AccountInlinePeek item={item} />}
      toolbar={toolbar}
      actions={headerActions}
      bulkActions={bulkActions}
    />
  )
}
