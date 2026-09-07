"use client"

import Link from "next/link"
import { createColumnHelper } from "@tanstack/react-table"

import { mediaLabel } from "@/components/business/accounts/account-status"
import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { lifecycleLabel, poolStatusMap } from "@/lib/fixtures/accounts"
import { costStatusLabel, fmtTime, rv } from "@/lib/fixtures/contract"
import { changeLogKindLabel, fmtChangeValue, type ChangeLogItem, type TaskAccountRow } from "@/lib/fixtures/tasks"
import { cn } from "@/lib/utils"

// 任务详情内的两张表都走母版 DataGrid（D5：全部表格一模一样）
const number0 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 })
const accountHelper = createColumnHelper<GridFeatures, TaskAccountRow>()
const accountColumns = accountHelper.columns([
  dragColumn<TaskAccountRow>(),
  selectionColumn<TaskAccountRow>(),
  accountHelper.accessor("accountName", { header: "账户", enableHiding: false, meta: { label: "账户" }, cell: ({ row }) => <span><Link href={`/accounts/${encodeURIComponent(row.original.media)}/${encodeURIComponent(row.original.accountId)}`} className="font-medium underline-offset-4 hover:underline">{row.original.accountName}</Link><span className="ml-2 text-xs text-muted-foreground">{mediaLabel(row.original.media)}</span></span> }),
  accountHelper.accessor("poolStatus", { header: "库存态", meta: { label: "库存态" }, cell: ({ getValue }) => <TypeChip className="gap-1.5"><span className={cn("size-1.5 rounded-full", poolStatusMap[getValue()].dot)} />{poolStatusMap[getValue()].label}</TypeChip> }),
  accountHelper.accessor("lifecycleStage", { header: "生命周期", meta: { label: "生命周期" }, cell: ({ getValue }) => getValue() === "unknown" ? <MissingValue /> : <TypeChip>{lifecycleLabel[getValue()]}</TypeChip> }),
  accountHelper.accessor("validFrom", { header: "有效期", meta: { label: "有效期" }, cell: ({ row }) => <span className="tabular-nums">{row.original.validFrom.slice(5)} – {row.original.validTo?.slice(5) ?? "至今"}</span> }),
  accountHelper.accessor((row) => row.costStatus ?? "", { id: "costStatus", header: "达标", meta: { label: "达标" }, cell: ({ row }) => row.original.costStatus ? <StatusChip tone={row.original.costStatus === "green" ? "success" : row.original.costStatus === "yellow" ? "warning" : "critical"}>{costStatusLabel[row.original.costStatus]}</StatusChip> : <StatusChip tone="muted">不可判断</StatusChip> }),
  accountHelper.accessor((row) => row.capacity.dailyBudgetCap ?? null, { id: "cap", header: "日预算卡", meta: { label: "日预算卡", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{row.original.capacity.dailyBudgetCap === null ? "−" : `¥${number0.format(row.original.capacity.dailyBudgetCap)}`}</span> }),
  accountHelper.accessor((row) => row.capacity.usage.value ?? null, { id: "usage", header: "容量使用", meta: { label: "容量使用", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{rv(row.original.capacity.usage)}</span> }),
  actionsColumn<TaskAccountRow>((row) => <DropdownMenuItem asChild><Link href={`/accounts/${encodeURIComponent(row.media)}/${encodeURIComponent(row.accountId)}`}>打开完整账户页</Link></DropdownMenuItem>),
])

export function TaskAccountsGrid({ items }: { items: TaskAccountRow[] }) {
  const table = useGridTable({ data: items, columns: accountColumns, pageSize: 20, getRowId: (row) => row.accountId })
  return <DataGrid table={table} empty="该任务还没挂载账户" showPagination={false} />
}

const logHelper = createColumnHelper<GridFeatures, ChangeLogItem>()
const logColumns = logHelper.columns([
  dragColumn<ChangeLogItem>(),
  selectionColumn<ChangeLogItem>(),
  logHelper.accessor("at", { header: "时间", enableHiding: false, meta: { label: "时间" }, cell: ({ getValue }) => <span className="tabular-nums">{fmtTime(getValue())}</span> }),
  logHelper.accessor("kind", { header: "类型", meta: { label: "类型" }, cell: ({ getValue }) => <TypeChip>{changeLogKindLabel[getValue()]}</TypeChip> }),
  logHelper.accessor((row) => (typeof row.oldValue === "number" ? row.oldValue : null), { id: "old", header: "从", meta: { label: "从", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{fmtChangeValue(row.original.oldValue)}</span> }),
  logHelper.accessor((row) => (typeof row.newValue === "number" ? row.newValue : null), { id: "new", header: "到", meta: { label: "到", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{fmtChangeValue(row.original.newValue)}{row.original.recomputedDays ? <span className="ml-1 text-xs text-muted-foreground">重算 {row.original.recomputedDays} 日</span> : null}</span> }),
  logHelper.accessor("effectiveDate", { header: "生效", meta: { label: "生效" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> }),
  logHelper.accessor((row) => row.changedBy.name, { id: "by", header: "改动人", meta: { label: "改动人" } }),
  logHelper.accessor((row) => row.evidenceUrl ?? "", { id: "evidence", header: "证据", meta: { label: "证据" }, cell: ({ getValue }) => getValue() ? <a href={getValue()} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline-offset-4 hover:underline">{getValue()}</a> : <MissingValue /> }),
  actionsColumn<ChangeLogItem>((row) => <DropdownMenuItem disabled>{changeLogKindLabel[row.kind]}只增不改</DropdownMenuItem>),
])

export function ChangeLogGrid({ items }: { items: ChangeLogItem[] }) {
  const table = useGridTable({ data: items, columns: logColumns, pageSize: 20, getRowId: (row) => `${row.at}-${row.kind}` })
  return <DataGrid table={table} empty="没有变更记录" showPagination={false} showColumnPicker={false} />
}
