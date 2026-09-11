"use client"

import { useMemo, useState } from "react"
import { createColumnHelper } from "@tanstack/react-table"

import { DataGrid, selectionColumn, StatusChip, useGridTable, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isOk, mv, rv } from "@/lib/fixtures/contract"
import { gapFixtures, type GapRow } from "@/lib/fixtures/data-analysis"
import { mediaOptions } from "@/lib/fixtures/naming"
import { operationalIsMock, useGap } from "@/lib/data/use-operational"
import type { DataWindow } from "@/components/business/data/dashboard/window-picker"
import { LineageFooter, MetricDefinitionHint, metricFormulas } from "./shared"

// Gap 对账：回传 vs 真实 vs gap 三态（normal / high / missing）；high 阈值来自规则引擎当前版本（meta.ruleSetVersion）
const groupings = [
  { value: "account", label: "按账户" },
  { value: "task", label: "按任务" },
  { value: "biz", label: "按业务" },
] as const
const gapTone = { normal: "success", high: "critical", missing: "muted" } as const
const gapLabel = { normal: "正常", high: "偏高", missing: "缺数" } as const

const helper = createColumnHelper<GridFeatures, GapRow>()
const columns = helper.columns([
  selectionColumn<GapRow>(),
  helper.accessor((row) => row.group.label, { id: "group", header: "分组", enableHiding: false, meta: { label: "分组" }, cell: ({ getValue }) => <span className="font-medium">{getValue()}</span> }),
  helper.accessor((row) => row.conversion.value, { id: "conversion", header: "回传转化", meta: { label: "回传转化", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{mv(row.original.conversion)}</span> }),
  helper.accessor((row) => row.realConversion.value, { id: "realConversion", header: "真实转化（BI）", meta: { label: "真实转化", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{mv(row.original.realConversion)}</span> }),
  helper.accessor((row) => row.gap.value, { id: "gap", header: () => <MetricDefinitionHint label="差异" formula={metricFormulas.gap} />, meta: { label: "差异", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{rv(row.original.gap)}</span> }),
  helper.accessor((row) => row.preDeductionGap.value, { id: "preDeductionGap", header: "扣量前差异", meta: { label: "扣量前差异", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{rv(row.original.preDeductionGap)}</span> }),
  helper.accessor((row) => row.deductionRate.value, { id: "deductionRate", header: "扣量率", meta: { label: "扣量率", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{rv(row.original.deductionRate)}</span> }),
  helper.accessor("gapStatus", { header: "状态", meta: { label: "状态" }, cell: ({ getValue }) => <StatusChip tone={gapTone[getValue()]}>{gapLabel[getValue()]}</StatusChip> }),
])

/**
 * F8-24：差异对账接 `account.gap`（走 `/api/internal/query`）。
 *
 * ★`media` 是**必填参数**（后端 schema strict），所以工具栏多了一个媒体选择器——
 * 不是多余的控件：对账本来就是「某个媒体的回传 vs BI」，跨媒体混在一张表里没有意义。
 */
export function GapTab({ window, workspaceId }: { window: DataWindow; workspaceId?: string }) {
  const [groupBy, setGroupBy] = useState<(typeof groupings)[number]["value"]>("account")
  const [media, setMedia] = useState(mediaOptions[0]!.value)
  const gapFixture = gapFixtures[groupBy]
  const supported = isOk(gapFixture) && gapFixture.data.source.groupBy === groupBy
  const query = useMemo(
    () => ({ from: window.from, to: window.to, media, groupBy }),
    [window.from, window.to, media, groupBy],
  )
  const remote = useGap<GapRow>(query, workspaceId)
  const mockRows = useMemo(() => (supported && isOk(gapFixture) ? gapFixture.data.source.rows : []), [supported, gapFixture])
  const rows = operationalIsMock ? mockRows : remote.rows ?? []
  const table = useGridTable({ data: rows, columns, pageSize: 50, getRowId: (row) => row.group.key })
  if (!isOk(gapFixture)) return null
  return (
    <div className="flex flex-col gap-3">
      <DataGrid
        table={table}
        density="compact"
        showPagination={false}
        empty={operationalIsMock ? "当前窗口没有对账行"
          : remote.loading ? "正在取数…"
          : remote.error ? `取数失败：${remote.error.message}${remote.error.requestId ? `（问题编号 ${remote.error.requestId}）` : ""}`
          : remote.unavailable ?? "当前窗口没有对账行"}
        toolbar={
          <>
            <Select value={media} onValueChange={setMedia}>
              <SelectTrigger size="sm" className="w-24" aria-label="媒体"><SelectValue /></SelectTrigger>
              <SelectContent>{mediaOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={groupBy} onValueChange={(value) => setGroupBy(value as typeof groupBy)}>
              <SelectTrigger size="sm" className="w-32" aria-label="分组"><SelectValue /></SelectTrigger>
              <SelectContent>{groupings.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">回传（OCPX）vs 真实（BI）· 偏高阈值由规则引擎给</span>
          </>
        }
        actions={<Badge variant="outline" className="font-mono text-[11px]">规则版本 {gapFixture.meta?.ruleSetVersion ?? "−"}</Badge>}
      />
      <LineageFooter lineage={gapFixture.data.source.lineage} />
    </div>
  )
}
