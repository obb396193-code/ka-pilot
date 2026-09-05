"use client"

import { useMemo } from "react"
import Link from "next/link"
import { IconAlertTriangle, IconArrowUpRight } from "@tabler/icons-react"

import { StatusChip } from "@/components/business/data-grid/data-grid"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { AccountCpaTrend } from "@/components/charts/account-cpa-trend"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getAccountLifecycle, lifecycleStageMap } from "@/lib/data/account-lifecycle"
import { adaptAccountDetail } from "@/lib/data/adapters"
import type { AccountDetailData, AnalysisRow, DisplayMetric, QueryRequest } from "@/lib/data/contracts"
import { shanghaiBusinessDate, type DataResponse, type DataViewMode } from "@/lib/data/data-view"
import { useDataQuery } from "@/lib/data/use-data-query"
import { accountStatus } from "./account-status"

// 账户小传 = 行内展开（老板 09-05 定）。KPI 卡与工作台同一个组件（老板：别又换一种卡），数据来源 account.detail，不重算。
function useAccountPeek(row: AnalysisRow, dataView: DataViewMode): DataResponse<AccountDetailData> & { isMock: boolean } {
  const request = useMemo<QueryRequest>(() => ({ queryId: "account.detail", dataView, params: { date: shanghaiBusinessDate(), accountId: row.accountId, media: row.media } }), [row, dataView])
  const result = useDataQuery(request)
  const response = adaptAccountDetail(result.response ?? { ok: false, error: { code: "SOURCE_UNAVAILABLE", message: "正在读取", retryable: true, requestId: "loading" } }, dataView, result.isMock, row.accountId, result.loading ? "loading" : undefined)
  return { ...response, isMock: result.isMock }
}

export function accountPageHref(row: Pick<AnalysisRow, "accountId" | "media">) {
  return `/accounts/${encodeURIComponent(row.accountId)}?media=${encodeURIComponent(row.media)}`
}

const missing = (key: string, label: string): DisplayMetric => ({ key, label, value: "−", delta: null, tone: "neutral" })

export function AccountInlinePeek({ row, dataView }: { row: AnalysisRow; dataView: DataViewMode }) {
  const response = useAccountPeek(row, dataView)
  const data = response.data
  const chip = accountStatus[data.status]
  const lifecycle = getAccountLifecycle(row.accountId, response.isMock)
  const loading = response.state === "loading"
  // 六张卡与首页同构：后端给的指标 + 缺数占位（阶段 / 余额·断量 / 计划层 / 关联任务），走势线只画有日序列的 CPA
  const metrics: DisplayMetric[] = [
    ...data.metrics,
    { key: "stage", label: "阶段", value: lifecycle ? lifecycleStageMap[lifecycle.stage].label : "−", delta: lifecycle ? `自 ${lifecycle.since.slice(5).replace("-", "/")}` : null, tone: "neutral" },
    missing("balance", "余额 · 断量"),
    missing("plan", "计划层"),
    missing("tasks", "关联任务"),
  ]
  const sparklines = { cpa: data.trend.map((point) => point.cpa) }

  return (
    <div className="@container/main flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {data.accountName}
          <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
          <span className="font-mono text-[11px] font-normal text-muted-foreground">{data.media} · {data.accountId} · {data.owner}</span>
        </div>
        <Button asChild variant="outline" size="sm"><Link href={accountPageHref(row)}>打开完整账户页<IconArrowUpRight /></Link></Button>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 gap-3 @5xl/main:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-[104px] rounded-xl" />)}</div>
      ) : (
        <KpiCards metrics={metrics} sparklines={sparklines} className="px-0 lg:px-0" />
      )}
      <div className="grid gap-4 @5xl/main:grid-cols-12">
        <div className="rounded-xl border bg-card p-4 @5xl/main:col-span-8">
          <div className="text-sm font-medium">CPA 与考核价趋势</div>
          {data.trend.length ? <div className="mt-2"><AccountCpaTrend data={data.trend} /></div> : <p className="mt-2 text-xs text-muted-foreground">后端未返回可展示趋势</p>}
        </div>
        <div className="rounded-xl border bg-card p-4 @5xl/main:col-span-4">
          <div className="text-sm font-medium">当前诊断</div>
          {data.currentFindingId ? (
            <Button asChild variant="outline" size="sm" className="mt-2"><Link href={`/diagnostics/${data.currentFindingId}`}><IconAlertTriangle />{data.currentFindingTitle ?? "查看诊断详情"}</Link></Button>
          ) : <p className="mt-2 text-xs text-muted-foreground">当前没有关联的诊断工作项</p>}
        </div>
      </div>
    </div>
  )
}
