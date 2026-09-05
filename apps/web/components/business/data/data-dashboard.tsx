"use client"

import { useTheme } from "@/components/business/theme/theme-provider"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { readTrendRange, TrendCard } from "@/components/business/workbench/trend-card"
import { DataStateFrame } from "@/components/data-view/data-state-frame"
import type { WorkbenchData } from "@/lib/data/contracts"
import type { DataResponse, QueryRecord } from "@/lib/data/data-view"

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }

// 数据大盘：与工作台同一份 summary / trend，只是不带队列与右栏
export function DataDashboard({ response, query }: { response: DataResponse<WorkbenchData>; query: QueryRecord }) {
  const { theme } = useTheme()
  const data = response.data
  const source = response.lineage.mode === "single" ? response.lineage.source : response.lineage.platform
  const range = readTrendRange(first(query.date_from) ?? first(query.start), first(query.date_to) ?? first(query.end))
  return (
    <DataStateFrame response={response} lineage="inline">
      <KpiCards metrics={data.metrics} sparklines={{ spend: data.trend.map((point) => point.spend), cpa: data.trend.map((point) => point.realCpa) }} />
      <div className="px-4 lg:px-6">
        <TrendCard data={data.trend} range={range} dataAsOf={source.dataAsOf ? source.dataAsOf.slice(5, 16).replace("-", "/").replace("T", " ") : null} colorKey={`${theme.mode}-${theme.hue}`} />
      </div>
    </DataStateFrame>
  )
}
