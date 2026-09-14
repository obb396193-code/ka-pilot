"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { useDashboardSummary } from "@/lib/data/use-dashboard"
import { readDataDate, shanghaiToday } from "@/lib/data/data-date"
import { FilterBar } from "@/components/business/data/dashboard/filter-bar"
import type { FilterSelection } from "@/lib/data/use-data-filters"
import { mediaOptions } from "@/lib/fixtures/naming"
import { useChartColorKey } from "@/lib/theme/use-chart-color-key"
import { StateFrame, usePageState } from "@/components/business/state/page-state"
import { PageTabs, usePageTab } from "@/components/business/tabs/page-tabs"
import { isOk } from "@/lib/fixtures/contract"
import { useSavedViews } from "@/lib/data/use-saved-views"
import { WindowPicker, resolvePreset, type DataWindow } from "@/components/business/data/dashboard/window-picker"


import { AttributionTab } from "./tabs/attribution-tab"
import { GapTab } from "./tabs/gap-tab"
import { IntelTab } from "./tabs/intel-tab"
import { HourlyTab } from "./tabs/hourly-tab"
import { OverviewTab } from "./tabs/overview-tab"
import { PivotTab } from "./tabs/pivot-tab"
import { ReportsTab } from "./tabs/reports-tab"
import { StrategyTab } from "./tabs/strategy-tab"
import { TableTab } from "./tabs/table-tab"

// 数据分析（F-007 §1）：七个视图 tab 收敛在 /data?tab=（不加侧栏项、不开一级路由）；窗口预设在页头；八态 ?state=
const tabs = [
  { value: "overview", label: "大盘" },
  { value: "table", label: "数据总表" },
  { value: "pivot", label: "维度透视" },
  { value: "hourly", label: "盯盘" },
  { value: "gap", label: "差异对账" },
  { value: "strategy", label: "策略分析" },
  { value: "attribution", label: "归因树" },
  { value: "intel", label: "竞情" },
  { value: "reports", label: "自助报表" },
] as const
type Tab = (typeof tabs)[number]["value"]

export function DataPage() {
  const { session } = useSession()
  const [tab, setTab] = usePageTab<Tab>(tabs, "overview")
  const state = usePageState()
  // 数据日：所有预设都以它为终点往前推，不是以今天——今天的数还没跑完
  // TODO(F8-20)：接 `/me/counts` 或健康条的 dataAsOf 后改成从会话取
  // 第一次渲染还不知道数据日，先按今天算一版；响应回来后若用户没自己选过窗口，按真数据日重算
  const [dataWindow, setDataWindow] = useState<DataWindow>(() => {
    const fallback = shanghaiToday()
    return resolvePreset("month_to_date", fallback, { preset: "month_to_date", from: fallback, to: fallback })
  })
  const pickedByUser = useRef(false)
  /**
   * F8-27 筛选栏。媒体和筛选条件都提到页面层：
   * 大盘、透视、对账都要用同一份——分散在各 tab 里会出现「这个 tab 筛了、那个没筛」。
   */
  const [media, setMedia] = useState(mediaOptions[0]!.value)
  const [filters, setFilters] = useState<FilterSelection>({})
  const chooseWindow = useCallback((next: DataWindow) => { pickedByUser.current = true; setDataWindow(next) }, [])

  // 概览的 summary 提到这一层：页头要用它的 `lineage.dataAsOf` 定数据日，
  // 而 OverviewTab 也要用同一份——放两处就是两次请求打同一个端点
  const summaryQuery = useDashboardSummary(dataWindow, session?.activeWorkspace.id, filters)
  // 数据日的兜底链在 `lib/data/data-date.ts`（工作台用同一份，别再写第二遍）
  const dataDate = readDataDate(summaryQuery.data?.lineage as never)

  useEffect(() => {
    // 数据日到手后，把「用户没动过的」预设窗口按真数据日重算一次
    if (!dataDate || pickedByUser.current) return
    setDataWindow((current) => (current.preset === "custom" ? current : resolvePreset(current.preset, dataDate, current)))
  }, [dataDate])
  /**
   * F8-27：保存视图接真接口。之前只在内存里 push 一条——**刷新就没了**，
   * 而按钮弹的是绿色的「已保存」。假成功比不能用更坏，人会以为存住了。
   * 顺带把当前筛选条件一起存进 `config.filters`：视图的意义就是「把这一套条件记下来」。
   */
  const { views, save } = useSavedViews()
  const saveView = (name: string, columns: string[]) => {
    void save({
      name,
      page: "data.table",
      columns,
      window: { preset: dataWindow.preset, from: dataWindow.from, to: dataWindow.to },
      filters,
    })
  }
  // ★重画信号是**主题**不是空间：空间 id 变了图当然也该重画，但那由 dataKey（参数指纹）负责；
  // 颜色是跟着模式/主色/深浅走的（审查员 C 点名：切颜色模式图表不重画）。
  const colorKey = useChartColorKey()

  return (
    <PageBody>
      <PageHeader
        title="数据分析"
        description="全量明细不聚合不裁剪；指标、环比、达标、色标全部由后端给，前端只展示"
        actions={
          <>
            <WindowPicker value={dataWindow} dataDate={dataDate ?? shanghaiToday()} onChange={chooseWindow} />
            {/* 数据日未知就说未知：窗口预设是以它为终点往前推的，不知道终点，这些预设的含义就是虚的 */}
            {dataDate ? null : <span className="text-xs text-status-warning">数据日未知</span>}
            
          </>
        }
      />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} />

      {/* 筛选栏只在**看数**的 tab 上出现：归因树/竞情/自助报表还没接真接口，
          给它们挂一条不生效的筛选栏是假的可用性 */}
      {(["overview", "table", "pivot", "gap"] as Tab[]).includes(tab) ? (
        <div className="px-4 lg:px-6">
          <FilterBar window={dataWindow} media={media} onMediaChange={setMedia} value={filters} onChange={setFilters} />
        </div>
      ) : null}
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="语义查询按窗口取数接入后切换为真数据" empty={{ title: "当前窗口没有数据", description: "换一个窗口或账户范围；系统不会用 0 填充。" }}>
          {tab === "overview" ? <OverviewTab colorKey={colorKey} window={dataWindow} workspaceId={session?.activeWorkspace.id} summaryQuery={summaryQuery} filters={filters} dataDateReady={dataDate !== null} /> : null}
          {tab === "table" ? <TableTab onSaveView={saveView} window={dataWindow} workspaceId={session?.activeWorkspace.id} /> : null}
          {tab === "pivot" ? <PivotTab window={dataWindow} workspaceId={session?.activeWorkspace.id} workspaceKind={session?.activeWorkspace.kind} colorKey={colorKey} /> : null}
          {tab === "hourly" ? <HourlyTab window={dataWindow} workspaceId={session?.activeWorkspace.id} /> : null}
          {tab === "gap" ? <GapTab window={dataWindow} workspaceId={session?.activeWorkspace.id} /> : null}
          {tab === "strategy" ? <StrategyTab /> : null}
          {tab === "attribution" ? <AttributionTab /> : null}
          {tab === "intel" ? <IntelTab /> : null}
          {tab === "reports" ? <ReportsTab views={views} onSaveView={saveView} /> : null}
        </StateFrame>
      </div>
    </PageBody>
  )
}
