"use client"

import { useMemo } from "react"

import { DistributionCard } from "@/components/business/data/dashboard/distribution-card"
import { WidgetBoundary } from "@/components/business/state/widget-boundary"
import { DrillTable } from "@/components/business/data/dashboard/drilldown"
import { KpiRows } from "@/components/business/data/dashboard/kpi-rows"
import { MissingDataNotice, type LineageWarning } from "@/components/business/data/dashboard/missing-data-notice"
import { ScopeSwitch } from "@/components/business/data/dashboard/scope-switch"
import { TrendChart } from "@/components/business/data/dashboard/trend-chart"
import { trendPoints, type TrendPoint } from "@/lib/data/trend-points"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FIXTURES_ENABLED as IS_MOCK, isOk } from "@/lib/fixtures/contract"
import { trendFixture } from "@/lib/fixtures/data-analysis"
import { aggregateDays } from "@/lib/fixtures/dashboard"
import { mockBizRows, mockOptimizerRows, mockResourcePositionRows, useDashboardDimension, useDashboardSummary, useDashboardTrend } from "@/lib/data/use-dashboard"
import { windowPresetLabel, type DataWindow } from "@/components/business/data/dashboard/window-picker"
import { CostStatusDot, LineageFooter, metricFormulas } from "./shared"
import { costStatusReasonShort } from "@/lib/fixtures/contract"
import { MetricHint } from "@/components/business/metric-hint"

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
export function OverviewTab({ colorKey, window, workspaceId, summaryQuery, filters, dataDateReady = true }: {
  colorKey?: string
  window: DataWindow
  workspaceId?: string
  /** summary 由页面层取好传进来：页头要用它的 `lineage.dataAsOf` 定数据日，
   *  这里再取一次就是两个请求打同一个端点（审查员 D 的「组件只吃 props」） */
  summaryQuery: ReturnType<typeof useDashboardSummary>
  /** 页头筛选栏选中的条件；进每个查询的 params，不然筛选栏就是摆设 */
  filters?: Record<string, unknown>
  /**
   * ★数据日确定之前**不发这些查询**。
   *
   * 数据日只能从 summary 的 lineage 里拿（health 那条路 BFF 未冻），所以 summary 是探针：
   * 它先按上海今天发一轮，回来之后窗口按真数据日重算。
   * 如果这几个查询不等，就会**整套发两遍**——第一遍窗口是错的（dateTo=今天），
   * 拿回来的数还会先画到屏幕上闪一下，然后被第二遍覆盖。
   */
  dataDateReady?: boolean
}) {
  const summary = summaryQuery.data?.row ?? null
  // ★lineage 跟着这次响应走，不再固定读 mock fixture——真实模式下那等于把假的「数据截至」
  //   贴在真数字旁边。缺数点名（v1.9.33）也在这里面。
  const lineage = (summaryQuery.data?.lineage ?? null) as
    (Parameters<typeof LineageFooter>[0]["lineage"] & { window?: { from: string; to: string; preset?: string }; warnings?: LineageWarning[] }) | null

  const optimizerQuery = useDashboardDimension("optimizer", window, workspaceId, mockOptimizerRows(), filters)
  // ★查询用 `placement`，界面仍叫「资源位」：快手的资源位实际落在 placement 维度
  //   （v1.9.41 实测分出 优选/搜索/联盟/主站/上下滑）。`resource_position` 这个键
  //   在 schema 里合法但没有解析器产出，查了直接 DIMENSION_UNSUPPORTED。
  const resourceQuery = useDashboardDimension("placement", window, workspaceId, mockResourcePositionRows(), filters, dataDateReady)
  const optimizerRows = optimizerQuery.data ?? []
  const resourceRows = resourceQuery.data ?? []
  // ★任务大类顶层行走**和 summary 同源**的那份，不用契约里那份 personal 的 biz fixture：
  //   两者口径不同，挂在一起会让分摊的分母整个错（审查 ③ 点名）。
  const goalQuery = useDashboardDimension("goal", window, workspaceId, mockOptimizerRows(), filters, dataDateReady)
  const goalRows = goalQuery.data ?? []
  /**
   * 自投 / 代理分布（v1.9.45）：走 **`segment:operator`**，不是 `agent_type`。
   * `agent_type` 在 schema 里合法但没有解析器产出（v1.9.41），
   * 而「自投还是代理」这个信息实际藏在账户昵称的 operator 段里——
   * be2 ⑪ 把段维度开到 `account.dimension` 之后才拿得到。
   */
  const operatorQuery = useDashboardDimension("segment:operator", window, workspaceId, mockOptimizerRows(), filters, dataDateReady)
  const operatorRows = operatorQuery.data ?? []
  const bizQuery = useDashboardDimension("biz", window, workspaceId, mockBizRows(), filters, dataDateReady)
  const bizRows = bizQuery.data ?? []

  /**
   * F8-26 ①：按天的行改**接真接口**（`account.trend`）。
   *
   * 这里原来恒读 `trend-v3.json` 的五天——真实模式也一样。也就是说：
   * 趋势图、以及建立在它之上的「换窗口重算」，在真实部署里画的全是样例数据。
   * 更尴尬的是 `useDashboardTrend` 我早写好了，**全仓没有一处调用**。
   */
  const trendQuery = useDashboardTrend(window, workspaceId, filters, dataDateReady)
  const mockDays = useMemo(() => (isOk(trendFixture) ? trendFixture.data.source.rows : []), [])
  const days = useMemo(
    () => (IS_MOCK ? mockDays : (trendQuery.data as typeof mockDays) ?? []),
    [mockDays, trendQuery.data],
  )

  // 横轴生成抽到 `lib/data/trend-points.ts`（组件测不了，纯逻辑才盖得住门禁）
  const points = useMemo<TrendPoint[]>(() => trendPoints(days as never, window.from, window.to), [days, window.from, window.to])

  /**
   * ★窗口一换，KPI 必须跟着变——否则那个选择器就是个摆设（老板 2026-09-10 问的就是这个）。
   * 真实模式下换窗口 = 重发一次 `POST /data/query` 由后端算；
   * 过渡期用手上的按天行自己合，口径与后端一致（和的和、比率用总和÷总和重算而不是对每天的比率取平均）。
   * 窗口外没有任何一天时返回 null，页面照实说「这个区间没有数据」，不拿全量数顶上。
   */
  /**
   * ★F8-26 ①：**真实模式下不自己重算**，窗口一换就重发一次查询由后端算。
   *
   * 「前端按天行自己合」原本是后端没接时的过渡办法，但它建立在假的按天数据上——
   * 换个窗口，KPI 跟着变了，变出来的却是拿样例合的数。真实模式下这比不变还糟。
   * 现在 `account.summary` 的请求 key 里就带着窗口，换窗口天然重查，口径也归后端一处。
   *
   * mock 下保留本地重算：那边本来就是样例，合出来自洽即可，
   * 而且没有它换窗口 KPI 会纹丝不动，样例反而不像能用的东西。
   */
  const sameAsBackend = lineage?.window?.from === window.from && lineage?.window?.to === window.to
  const windowed = useMemo(
    () => (!IS_MOCK || sameAsBackend ? null : aggregateDays(days as never, window.from, window.to)),
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
          {/* 页头这个「口径」和 KPI 卡上的是同一种东西，走同一个组件 */}
          <span className="text-xs text-muted-foreground">
            <MetricHint>{`${metricFormulas.cashCpa}；颜色按窗口累计判，不按单日。`}</MetricHint>
          </span>
        </div>
      </div>

      <MissingDataNotice warnings={lineage?.warnings} />

      <KpiRows row={summary} windowed={windowed} warnings={lineage?.warnings} />

      <Card>
        <CardContent className="pt-5">
          <WidgetBoundary label="趋势图"><TrendChart id="overview.trend" points={points} colorKey={colorKey} /></WidgetBoundary>
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
              <WidgetBoundary label="任务大类表现"><DrillTable rows={bizRows} caption="任务大类 → 细分任务 → 账户" levels={["biz", "task", "account"]} window={window} workspaceId={workspaceId} rootBi={summary.assessment.biConv} /></WidgetBoundary>
            </TabsContent>
            <TabsContent value="optimizer" className="mt-3">
              <WidgetBoundary label="优化师视角"><DrillTable rows={optimizerRows} caption="优化师 → 任务大类 → 细分任务 → 账户" levels={["optimizer", "biz", "task", "account"]} window={window} workspaceId={workspaceId} rootBi={summary.assessment.biConv} /></WidgetBoundary>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/*
        F8-26 ④：分布补成**三张**，每张配同源明细表（契约 v1.9.29：只有饼图不算完成）。
        饼图只能回答「谁占得多」，回答不了「它达标没有、成本多少、这个数是几个账户堆出来的」——
        优化师做决定时看的是后面这几个。
        「资源位」这一维在真实模式下必炸（没有解析器产出），已换成 `placement`（v1.9.41）。
        自投/代理等其余清洗段等 be2 Q-041 ⑪ 把 `segment:<key>` 开到 `account.dimension` 再加。
      */}
      <div className="grid gap-4 @4xl/main:grid-cols-2 @6xl/main:grid-cols-3">
        <WidgetBoundary label="分布卡"><DistributionCard id="overview.placement" title="资源位分布" description="按账面花费；只画有消耗的项" rows={resourceRows} colorKey={colorKey} warnings={lineage?.warnings} window={window} /></WidgetBoundary>
        <WidgetBoundary label="分布卡"><DistributionCard id="overview.goal" title="转化目标分布" description="按账面花费；只画有消耗的项" rows={goalRows} colorKey={colorKey} warnings={lineage?.warnings} window={window} /></WidgetBoundary>
        <WidgetBoundary label="分布卡"><DistributionCard id="overview.optimizer" title="优化师分布" description="按账面花费；只画有消耗的项" rows={optimizerRows} colorKey={colorKey} warnings={lineage?.warnings} window={window} /></WidgetBoundary>
        <WidgetBoundary label="分布卡"><DistributionCard id="overview.operator" title="自投 / 代理分布" description="按账面花费；来自账户昵称的 operator 段" rows={operatorRows} colorKey={colorKey} warnings={lineage?.warnings} window={window} /></WidgetBoundary>
      </div>

      {lineage ? <LineageFooter lineage={lineage} extra={<span>账户 {summary.accountCount} · 异常行 {summary.anomalyRows}</span>} /> : null}
    </div>
  )
}
