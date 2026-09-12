"use client"

import { useMemo } from "react"

import { DimensionChart } from "@/components/business/data/dashboard/dimension-chart"
import { DrillTable } from "@/components/business/data/dashboard/drilldown"
import { KpiRows } from "@/components/business/data/dashboard/kpi-rows"
import { MissingDataNotice, type LineageWarning } from "@/components/business/data/dashboard/missing-data-notice"
import { ScopeSwitch } from "@/components/business/data/dashboard/scope-switch"
import { TrendChart, type TrendPoint } from "@/components/business/data/dashboard/trend-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { isOk } from "@/lib/fixtures/contract"
import { trendFixture } from "@/lib/fixtures/data-analysis"
import { aggregateDays } from "@/lib/fixtures/dashboard"
import { mockBizRows, mockOptimizerRows, mockResourcePositionRows, useDashboardDimension, useDashboardSummary } from "@/lib/data/use-dashboard"
import { windowPresetLabel, type DataWindow } from "@/components/business/data/dashboard/window-picker"
import { CostStatusDot, LineageFooter, metricFormulas } from "./shared"
import { costStatusReasonShort } from "@/lib/fixtures/contract"
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
  const summary = summaryQuery.data?.row ?? null
  // ★lineage 跟着这次响应走，不再固定读 mock fixture——真实模式下那等于把假的「数据截至」
  //   贴在真数字旁边。缺数点名（v1.9.33）也在这里面。
  const lineage = (summaryQuery.data?.lineage ?? null) as
    (Parameters<typeof LineageFooter>[0]["lineage"] & { window?: { from: string; to: string; preset?: string }; warnings?: LineageWarning[] }) | null

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

  /**
   * 趋势的横轴 = **窗口里的每一天**，不是「后端返回了哪几天」。
   *
   * 之前是把返回的行过滤一遍就画——某天整天缺数时那一天在轴上**根本不存在**，
   * 于是 09-02 和 09-04 直接挨在一起，看着像连续的，缺的那天神不知鬼不觉（审查 ⑦）。
   * 现在按窗口铺满日期，没有的那天给 null：线在那里断开，人一眼看得见。
   */
  const points = useMemo<TrendPoint[]>(() => {
    const byDate = new Map(days.map((row) => [row.ds, row]))
    const out: TrendPoint[] = []
    // 用 UTC 推进，避免夏令时/时区把某一天跳过去或算重
    for (let cursor = new Date(`${window.from}T00:00:00.000Z`); ; cursor = new Date(cursor.getTime() + 86_400_000)) {
      const ds = cursor.toISOString().slice(0, 10)
      if (ds > window.to) break
      const row = byDate.get(ds)
      out.push({
        ds,
        cost: row?.metrics.cost.value ?? null,
        conversion: row?.metrics.conversion.value ?? null,
        cpa: row?.metrics.ratios.realCpa.value ?? null,
      })
      // 窗口异常长时兜一下，别把页面卡死（一年封顶）
      if (out.length > 366) break
    }
    return out
  }, [days, window.from, window.to])

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
          {/* 判定挂起（partial_data）时没有色标：显「待补齐」而不是一个空点，
              否则人看不出「是没超线还是根本没判」 */}
          <CostStatusDot status={summary.assessment.costStatus} />
          {summary.assessment.costStatus === null && summary.assessment.costStatusReason
            ? <span className="rounded bg-status-warning/15 px-1.5 py-0.5 text-xs text-status-warning">{costStatusReasonShort[summary.assessment.costStatusReason] ?? "不可判断"}</span>
            : null}
          <span className="font-medium">{windowPresetLabel[window.preset]}</span>
          <span className="text-muted-foreground tabular-nums">{window.from} ～ {window.to}</span>
          <Tooltip>
            <TooltipTrigger asChild><span className="cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-4">口径</span></TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-80">{metricFormulas.cashCpa}；颜色按窗口累计判，不按单日。</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <MissingDataNotice warnings={lineage?.warnings} />

      <KpiRows row={summary} windowed={windowed} warnings={lineage?.warnings} />

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
