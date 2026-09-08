"use client"

import { Fragment, useId, useState, type MouseEvent, type ReactNode } from "react"
import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  IconAlertCircleFilled,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCircleCheckFilled,
  IconCircleDashed,
  IconCircleXFilled,
  IconClockFilled,
  IconDotsVertical,
  IconGripVertical,
  IconLayoutColumns,
  IconLoader,
} from "@tabler/icons-react"
import {
  columnVisibilityFeature,
  createColumnHelper,
  createExpandedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  FlexRender,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnVisibilityState,
  type ExpandedState,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingState,
  type Table,
  type TableOptions,
} from "@tanstack/react-table"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table as UiTable, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

// 母版 DataTable 的「壳」抽出来全站复用（老板 2026-09-05 定：全部表格统一母版格式，一模一样）：
// 拖拽把手 / 勾选框列 / 类型 chip / 带图标状态 chip / 行末 ⋮ 菜单 / 「已选 N 条，共 M 条」页脚 / 自定义列 / 分页。
// 底层 TanStack Table v9 + shadcn Table + dnd-kit（母版同款三件），不引入第二套表格库。
// 拖拽排序和母版一样只改本地顺序（后端无排序接口，刷新即还原）。
export const gridFeatures = tableFeatures({
  columnVisibilityFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  expandedRowModel: createExpandedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
})
export type GridFeatures = typeof gridFeatures
export type GridRow<TData extends RowData> = Row<GridFeatures, TData>

export function useGridTable<TData extends RowData>({ data, columns, pageSize = 20, getRowId, initialColumnVisibility = {}, onRowSelectionChange }: {
  data: TData[]
  columns: TableOptions<GridFeatures, TData>["columns"]
  pageSize?: number
  initialColumnVisibility?: ColumnVisibilityState
  getRowId: (row: TData) => string
  onRowSelectionChange?: (ids: string[]) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(initialColumnVisibility)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize })
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [expanded, setExpanded] = useState<ExpandedState>({})
  return useTable<GridFeatures, TData>({
    features: gridFeatures,
    data,
    columns,
    state: { sorting, columnVisibility, pagination, rowSelection, expanded },
    getRowId,
    enableRowSelection: true,
    getRowCanExpand: () => true,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onExpandedChange: setExpanded,
    onRowSelectionChange: (updater) => {
      setRowSelection((previous) => {
        const next = typeof updater === "function" ? updater(previous) : updater
        onRowSelectionChange?.(Object.keys(next).filter((key) => next[key]))
        return next
      })
    },
  })
}

type ColumnMeta = { label?: string; align?: "left" | "right" }

/** 母版第一列：拖拽把手（配合 DataGrid 的 onReorder） */
export function dragColumn<TData extends RowData>() {
  const helper = createColumnHelper<GridFeatures, TData>()
  return helper.display({
    id: "drag",
    header: () => null,
    cell: ({ row }) => <DragHandle id={row.id} />,
    enableSorting: false,
    enableHiding: false,
  })
}

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners } = useSortable({ id })
  return (
    <Button {...attributes} {...listeners} variant="ghost" size="icon" className="size-7 text-muted-foreground hover:bg-transparent">
      <IconGripVertical className="size-3 text-muted-foreground" />
      <span className="sr-only">拖动排序</span>
    </Button>
  )
}

/** 母版第二列：全选 / 单选勾选框 */
export function selectionColumn<TData extends RowData>() {
  const helper = createColumnHelper<GridFeatures, TData>()
  return helper.display({
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="全选"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label="选择此行" />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  })
}

/** 母版末列：⋮ 行操作菜单；菜单项由各页给（拿到数据行和表格行） */
export function actionsColumn<TData extends RowData>(render: (data: TData, row: GridRow<TData>) => ReactNode) {
  const helper = createColumnHelper<GridFeatures, TData>()
  return helper.display({
    id: "actions",
    header: () => null,
    cell: ({ row }) => <RowActions>{render(row.original, row)}</RowActions>,
    enableSorting: false,
    enableHiding: false,
  })
}

export function RowActions({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex size-8 text-muted-foreground data-[state=open]:bg-muted" size="icon">
          <IconDotsVertical />
          <span className="sr-only">打开操作菜单</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}

export type StatusTone = "success" | "critical" | "warning" | "progress" | "pending" | "muted"
// 图标着色照母版：green-500 / red-500 / amber-500 固定色（母版 fill-green-500 dark:fill-green-400）
const statusIcon: Record<StatusTone, ReactNode> = {
  success: <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />,
  critical: <IconCircleXFilled className="fill-red-500 dark:fill-red-400" />,
  warning: <IconAlertCircleFilled className="fill-amber-500 dark:fill-amber-400" />,
  progress: <IconLoader />,
  pending: <IconClockFilled className="fill-muted-foreground/60" />,
  muted: <IconCircleDashed />,
}
/** 母版状态 chip：outline + 图标着色，文字保持灰 */
export function StatusChip({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn("px-1.5 text-muted-foreground", className)}>
      {statusIcon[tone]}
      {children}
    </Badge>
  )
}
/** 母版类型 chip：outline 灰字 */
export function TypeChip({ children, className }: { children: ReactNode; className?: string }) {
  return <Badge variant="outline" className={cn("px-1.5 text-muted-foreground", className)}>{children}</Badge>
}

const INTERACTIVE = 'button, a, input, select, textarea, [role="checkbox"], [role="menuitem"], [role="combobox"], [data-slot="dropdown-menu-content"]'

type RowProps<TData extends RowData> = {
  row: GridRow<TData>
  density: "default" | "compact"
  onRowClick?: (row: TData) => void
}

function rowCells<TData extends RowData>(row: GridRow<TData>) {
  return row.getVisibleCells().map((cell) => {
    const meta = cell.column.columnDef.meta as ColumnMeta | undefined
    return <TableCell key={cell.id} className={cn(meta?.align === "right" && "text-right tabular-nums")}><FlexRender cell={cell} /></TableCell>
  })
}

function rowProps<TData extends RowData>({ row, density, onRowClick }: RowProps<TData>) {
  return {
    "data-state": row.getIsSelected() ? "selected" : undefined,
    "data-expanded": row.getIsExpanded() ? "true" : undefined,
    onClick: onRowClick
      ? (event: MouseEvent<HTMLTableRowElement>) => {
          if ((event.target as HTMLElement).closest(INTERACTIVE)) return
          onRowClick(row.original)
        }
      : undefined,
    className: cn(onRowClick && "cursor-pointer", density === "compact" && "[&>td]:py-1.5", row.getIsExpanded() && "bg-muted/40"),
  }
}

function PlainRow<TData extends RowData>(props: RowProps<TData>) {
  return <TableRow {...rowProps(props)}>{rowCells(props.row)}</TableRow>
}

// 母版 DraggableRow
function SortableRow<TData extends RowData>(props: RowProps<TData>) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({ id: props.row.id })
  const base = rowProps(props)
  return (
    <TableRow
      {...base}
      ref={setNodeRef}
      data-dragging={isDragging}
      className={cn(base.className, "relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80")}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {rowCells(props.row)}
    </TableRow>
  )
}

export function DataGrid<TData extends RowData>({
  table,
  toolbar,
  actions,
  bulkActions,
  empty = "暂无数据",
  onRowClick,
  onReorder,
  renderExpanded,
  density = "default",
  showColumnPicker = true,
  showPagination = true,
  className,
}: {
  table: Table<GridFeatures, TData>
  /** 工具条左侧：tabs / 筛选 */
  toolbar?: ReactNode
  /** 工具条右侧：自定义列之外的按钮（导入/导出/新建） */
  actions?: ReactNode
  /** 勾选后页脚出现的批量动作 */
  bulkActions?: ReactNode
  empty?: ReactNode
  /** 点行（勾选框/按钮/链接上的点击不触发） */
  onRowClick?: (row: TData) => void
  /** 拖拽排序（配合 dragColumn）：把 activeId 挪到 overId 的位置，顺序由调用方持有 */
  onReorder?: (activeId: string, overId: string) => void
  /** 行内展开：返回该行下方展开区的内容 */
  renderExpanded?: (row: TData) => ReactNode
  density?: "default" | "compact"
  /** 分组区块里关掉列选择器 / 分页，避免每段重复 */
  showColumnPicker?: boolean
  showPagination?: boolean
  className?: string
}) {
  const hideable = table.getAllColumns().filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())
  const pagination = table.options.state?.pagination ?? { pageIndex: 0, pageSize: 20 }
  const rows = table.getRowModel().rows
  const total = table.getPrePaginatedRowModel().rows.length
  const selectedCount = table.getSelectedRowModel().rows.length
  const columnCount = table.getVisibleLeafColumns().length
  const sortableId = useId()
  const sensors = useSensors(useSensor(MouseSensor, {}), useSensor(TouchSensor, {}), useSensor(KeyboardSensor, {}))
  const rowIds = rows.map((row) => row.id)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) onReorder?.(String(active.id), String(over.id))
  }

  const body = rows.length ? rows.map((row) => (
    <Fragment key={row.id}>
      {onReorder ? <SortableRow row={row} density={density} onRowClick={onRowClick} /> : <PlainRow row={row} density={density} onRowClick={onRowClick} />}
      {renderExpanded && row.getIsExpanded() ? (
        <TableRow data-expanded-panel className="hover:bg-transparent">
          <TableCell colSpan={columnCount} className="bg-muted/40 p-0"><div className="border-t px-4 py-4">{renderExpanded(row.original)}</div></TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  )) : (
    <TableRow>
      <TableCell colSpan={columnCount} className="h-28 text-center text-sm text-muted-foreground">{empty}</TableCell>
    </TableRow>
  )

  const tableElement = (
    <UiTable>
      <TableHeader className="sticky top-0 z-10 bg-muted">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const meta = header.column.columnDef.meta as ColumnMeta | undefined
              const sortable = header.column.getCanSort() && typeof header.column.accessorFn !== "undefined"
              return (
                <TableHead key={header.id} colSpan={header.colSpan} className={cn("whitespace-nowrap", meta?.align === "right" && "text-right", density === "compact" && "h-9")}>
                  {header.isPlaceholder ? null : sortable ? (
                    <button type="button" onClick={header.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", meta?.align === "right" && "flex-row-reverse")}>
                      <FlexRender header={header} />
                      <span className="text-[10px] text-muted-foreground">{header.column.getIsSorted() === "asc" ? "↑" : header.column.getIsSorted() === "desc" ? "↓" : ""}</span>
                    </button>
                  ) : (
                    <FlexRender header={header} />
                  )}
                </TableHead>
              )
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody className="**:data-[slot=table-cell]:first:w-8">
        {onReorder ? <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>{body}</SortableContext> : body}
      </TableBody>
    </UiTable>
  )

  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">{toolbar}</div>
        <div className="flex flex-wrap items-center gap-2">
          {showColumnPicker ? <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns />
                <span className="hidden lg:inline">自定义列</span>
                <span className="lg:hidden">列</span>
                <IconChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {hideable.map((column) => (
                <DropdownMenuCheckboxItem key={column.id} checked={column.getIsVisible()} onCheckedChange={(value) => column.toggleVisibility(!!value)}>
                  {(column.columnDef.meta as ColumnMeta | undefined)?.label ?? column.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu> : null}
          {actions}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          {onReorder ? (
            <DndContext collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd} sensors={sensors} id={sortableId}>
              {tableElement}
            </DndContext>
          ) : tableElement}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 px-1">
        <div className="hidden flex-1 items-center gap-3 text-sm text-muted-foreground lg:flex">
          <span className="tabular-nums">已选 {selectedCount} 条，共 {total} 条</span>
          {selectedCount > 0 && bulkActions ? <div className="flex items-center gap-1.5">{bulkActions}</div> : null}
        </div>
        {showPagination ? <div className="flex w-full items-center gap-6 lg:w-fit">
          <div className="hidden items-center gap-2 lg:flex">
            <Label htmlFor="rows-per-page" className="text-sm font-medium">每页行数</Label>
            <Select value={`${pagination.pageSize}`} onValueChange={(value) => table.setPageSize(Number(value))}>
              <SelectTrigger size="sm" className="w-20" id="rows-per-page"><SelectValue placeholder={pagination.pageSize} /></SelectTrigger>
              <SelectContent side="top">{[10, 20, 50, 100].map((size) => <SelectItem key={size} value={`${size}`}>{size}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex w-fit items-center justify-center text-sm font-medium tabular-nums">第 {pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())} 页</div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Button variant="outline" className="hidden size-8 lg:flex" size="icon" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}><span className="sr-only">第一页</span><IconChevronsLeft /></Button>
            <Button variant="outline" className="size-8" size="icon" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}><span className="sr-only">上一页</span><IconChevronLeft /></Button>
            <Button variant="outline" className="size-8" size="icon" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}><span className="sr-only">下一页</span><IconChevronRight /></Button>
            <Button variant="outline" className="hidden size-8 lg:flex" size="icon" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}><span className="sr-only">最后一页</span><IconChevronsRight /></Button>
          </div>
        </div> : null}
      </div>
    </div>
  )
}

/** 本地拖拽排序的小工具：调用方把 id 顺序存 state，用它算新顺序 */
export function useLocalOrder<TData extends RowData>(rows: TData[], getRowId: (row: TData) => string) {
  const [order, setOrder] = useState<string[]>([])
  const index = new Map(order.map((id, position) => [id, position]))
  const ordered = order.length ? [...rows].sort((a, b) => (index.get(getRowId(a)) ?? Number.MAX_SAFE_INTEGER) - (index.get(getRowId(b)) ?? Number.MAX_SAFE_INTEGER)) : rows
  const reorder = (activeId: string, overId: string) => {
    const ids = ordered.map(getRowId)
    const from = ids.indexOf(activeId), to = ids.indexOf(overId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    next.splice(to, 0, next.splice(from, 1)[0])
    setOrder(next)
  }
  return { ordered, reorder }
}

/** 缺数统一显 −（metrics.md 缺数三态） */
export function MissingValue({ title = "该来源缺失或未返回" }: { title?: string }) {
  return <span className="text-muted-foreground" title={title}>−</span>
}
