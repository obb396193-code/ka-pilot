"use client"

import { useMemo } from "react"

import { DimensionChart } from "@/components/business/data/dashboard/dimension-chart"
import { DrillTable } from "@/components/business/data/dashboard/drilldown"
import { KpiRows } from "@/components/business/data/dashboard/kpi-rows"
import { ScopeSwitch } from "@/components/business/data/dashboard/scope-switch"
import { TrendChart, type TrendPoint } from "@/components/business/data/dashboard/trend-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isOk } from "@/lib/fixtures/contract"
import { trendFixture } from "@/lib/fixtures/data-analysis"
import { aggregateDays, dashboardSummaryFixture } from "@/lib/fixtures/dashboard"
import { mockBizRows, mockOptimizerRows, mockResourcePositionRows, useDashboardDimension, useDashboardSummary } from "@/lib/data/use-dashboard"
import { windowPresetLabel, type DataWindow } from "@/components/business/data/dashboard/window-picker"
import { CostStatusDot, LineageFooter, metricFormulas } from "./shared"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * 数据分析 · 概览（F8-19，P0 数据看板）。
 * 借同事「快手投放账户工作台 v7」的**内容布局**（哪页放哪些维度、用哪类组件），
 * 前端规范一概不借（老板 2026-09-10）——组件、视觉、交互全按我们自己这套。
 *
 * 五块：两行 KPI（账面/考核 + 环比）→ 趋势双轴 → 任务大类表现（可展开到细分任务、账户）
 * → 优化师三级钻取 → 资源位分布。
 *
 * 数据源：`assessment.biConv/biCashCost/overCost` 与环比是契约 v1.9.22 新增，后端 Codex P-210 未到，
 * 现读 `lib/data/fixtures/v1922/` 的过渡 fixture（自写、按 api.md 形，落地后并回删除）。
 */
export function OverviewTab({ colorKey, window, workspaceId }: { colorKey?: string; window: DataWindow; workspaceId?: string }) {
  // 取数全在 `use-dashboard`：组件不再自己判断走 fixture 还是走接口（审查员 D 的 P1）
  const summaryQuery = useDashboardSummary(window, workspaceId)
  const summary = summaryQuery.data
  const lineage = (isOk(dashboardSummaryFixture) ? dashboardSummaryFixture.data.source.lineage : null) as
    (Parameters<typeof LineageFooter>[0]["lineage"] & { window?: { from: string; to: string; preset?: string } }) | null

  const optimizerQuery = useDashboardDimension("optimizer", window, workspaceId, mockOptimizerRows())
  const resourceQuery = useDashboardDimension("resource_position", window, workspaceId, mockResourcePositionRows())
  const optimizerRows = optimizerQuery.data ?? []
  const resourceRows = resourceQuery.data ?? []
  // ★任务大类顶层行走**和 summary 同源**的那份，不用契约里那份 personal 的 biz fixture：
  //   两者口径不同，挂在一起会让分摊的分母整个错（审查 ③ 点名）。
  const bizQuery = useDashboardDimension("biz", window, workspaceId, mockBizRows())
  const bizRows = bizQuery.data ?? []

  // 按天的原始行：趋势和「窗口重算」都从这里来
  const days = useMemo(() => (isOk(trendFixture) ? trendFixture.data.source.rows : []), [])

  // 趋势：只画窗口内的天；金额走左轴，转化数与转化成本走右轴；缺失日保持 null 让线断开
  const points = useMemo<TrendPoint[]>(() => days
    .filter((row) => row.ds >= window.from && row.ds <= window.to)
    .map((row) => ({
      ds: row.ds,
      cost: row.metrics.cost.value,
      conversion: row.metrics.conversion.value,
      cpa: row.metrics.ratios.realCpa.value,
    })), [days, window.from, window.to])

  /**
   * ★窗口一换，KPI 必须跟着变——否则那个选择器就是个摆设（老板 2026-09-10 问的就是这个）。
   * 真实模式下换窗口 = 重发一次 `POST /data/query` 由后端算；
   * 过渡期用手上的按天行自己合，口径与后端一致（和的和、比率用总和÷总和重算而不是对每天的比率取平均）。
   * 窗口外没有任何一天时返回 null，页面照实说「这个区间没有数据」，不拿全量数顶上。
   */
  // ★只有当用户选的窗口**和后端那份 summary 的窗口不一样**时才自己重算。
  // 一样的时候直接用后端那份——它带着后端算好的环比（compare.deltas），
  // 自己重算反而把环比弄丢了（默认就是「本月至今」，等于环比永远不显）。
  const sameAsBackend = lineage?.window?.from === window.from && lineage?.window?.to === window.to
  const windowed = useMemo(
    () => (sameAsBackend ? null : aggregateDays(days as never, window.from, window.to)),
    [sameAsBackend, days, window.from, window.to],
  )

  if (summaryQuery.loading) return <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">正在读取概览…</p>
  if (summaryQuery.error) return (
    <div className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">
      <p className="mb-2 text-status-critical">读取失败：{summaryQuery.error.message}</p>
      {summaryQuery.error.requestId ? <p className="mb-2 text-xs">问题编号 {summaryQuery.error.requestId}</p> : null}
      <button type="button" onClick={summaryQuery.reload} className="underline underline-offset-2">重试</button>
    </div>
  )
  if (!summary) return <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">这个窗口没有数据</p>

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScopeSwitch />
        <div className="flex items-center gap-2 text-sm">
          <CostStatusDot status={summary.assessment.costStatus} />
          <span className="font-medium">{windowPresetLabel[window.preset]}</span>
          <span className="text-muted-foreground tabular-nums">{window.from} ～ {window.to}</span>
          <Tooltip>
            <TooltipTrigger asChild><span className="cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-4">口径</span></TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-80">{metricFormulas.cashCpa}；颜色按窗口累计判，不按单日。</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <KpiRows row={summary} windowed={windowed} />

      <Card>
        <CardContent className="pt-5">
          <TrendChart id="overview.trend" points={points} colorKey={colorKey} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">按维度看</CardTitle>
          <CardDescription>任务大类看整体盘子，优化师视角看人；两个都能一路展开到账户</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="biz">
            <TabsList>
              <TabsTrigger value="biz">任务大类表现</TabsTrigger>
              <TabsTrigger value="optimizer">优化师视角</TabsTrigger>
            </TabsList>
            <TabsContent value="biz" className="mt-3">
              <DrillTable rows={bizRows} caption="任务大类 → 细分任务 → 账户" levels={["biz", "task", "account"]} window={window} workspaceId={workspaceId} rootBi={summary.assessment.biConv} />
            </TabsContent>
            <TabsContent value="optimizer" className="mt-3">
              <DrillTable rows={optimizerRows} caption="优化师 → 任务大类 → 细分任务 → 账户" levels={["optimizer", "biz", "task", "account"]} window={window} workspaceId={workspaceId} rootBi={summary.assessment.biConv} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <DimensionChart
            id="overview.resource_position"
            title="资源位分布"
            description="按账面花费；只画有消耗的资源位"
            rows={resourceRows}
            colorKey={colorKey}
          />
        </CardContent>
      </Card>

      {lineage ? <LineageFooter lineage={lineage} extra={<span>账户 {summary.accountCount} · 异常行 {summary.anomalyRows}</span>} /> : null}
    </div>
  )
}
