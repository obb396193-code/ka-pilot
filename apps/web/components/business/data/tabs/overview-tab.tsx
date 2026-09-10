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
import { dimensionFixtures, trendFixture, windowLabel } from "@/lib/fixtures/data-analysis"
import { dashboardSummaryFixture, optimizerDimensionFixture, resourcePositionFixture, type DashboardRow } from "@/lib/fixtures/dashboard"
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
export function OverviewTab({ colorKey }: { colorKey?: string }) {
  const summary = isOk(dashboardSummaryFixture) ? dashboardSummaryFixture.data.source.rows[0] : null
  const lineage = (isOk(dashboardSummaryFixture) ? dashboardSummaryFixture.data.source.lineage : null) as
    (Parameters<typeof LineageFooter>[0]["lineage"] & { window?: { from: string; to: string; preset?: string } }) | null

  const optimizerRows = isOk(optimizerDimensionFixture) ? optimizerDimensionFixture.data.source.rows : []
  const resourceRows = isOk(resourcePositionFixture) ? resourcePositionFixture.data.source.rows : []
  // 任务大类走契约里已有的 biz 维度 fixture（不是我写的过渡件）。
  // ★不用 `as unknown as DashboardRow[]` 硬转：那正是「盯盘页崩溃」的成因——
  //   契约的 biz 行没有 v1.9.22 的考核三项，硬转过去运行时就是 undefined.value。
  //   DashboardRow 的这三项现在是可选的，结构化匹配即可，缺了由钻取表按分摊处理。
  const bizFixture = dimensionFixtures.biz
  const bizRows: DashboardRow[] = "unsupported" in bizFixture || !isOk(bizFixture) ? [] : bizFixture.data.source.rows

  // 趋势：金额走左轴，转化数与转化成本走右轴；缺失日保持 null 让线断开
  const points = useMemo<TrendPoint[]>(() => {
    if (!isOk(trendFixture)) return []
    return trendFixture.data.source.rows.map((row) => ({
      ds: row.ds,
      cost: row.metrics.cost.value,
      conversion: row.metrics.conversion.value,
      cpa: row.metrics.ratios.realCpa.value,
    }))
  }, [])

  if (!summary) return <p className="rounded-lg border border-dashed px-3 py-10 text-center text-sm text-muted-foreground">概览暂无数据</p>

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScopeSwitch />
        <div className="flex items-center gap-2 text-sm">
          <CostStatusDot status={summary.assessment.costStatus} />
          <span className="font-medium">{windowLabel(lineage?.window?.preset)}</span>
          <span className="text-muted-foreground tabular-nums">{lineage?.window?.from} ～ {lineage?.window?.to}</span>
          <Tooltip>
            <TooltipTrigger asChild><span className="cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-4">口径</span></TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-80">{metricFormulas.cashCpa}；颜色按窗口累计判，不按单日。</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <KpiRows row={summary} />

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
              <DrillTable rows={bizRows} caption="任务大类 → 细分任务 → 账户" rootBi={summary.assessment.biConv.value} rootCost={summary.metrics.cost.value} />
            </TabsContent>
            <TabsContent value="optimizer" className="mt-3">
              <DrillTable rows={optimizerRows} caption="优化师 → 任务大类 → 细分任务 → 账户" rootBi={summary.assessment.biConv.value} rootCost={summary.metrics.cost.value} />
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
