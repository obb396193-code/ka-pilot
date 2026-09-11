"use client"

import { useState } from "react"

import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { StateFrame, usePageState } from "@/components/business/state/page-state"
import { PageTabs, usePageTab } from "@/components/business/tabs/page-tabs"
import { isOk } from "@/lib/fixtures/contract"
import { viewsFixture, type SavedView } from "@/lib/fixtures/data-analysis"
import { WindowPicker, resolvePreset, type DataWindow } from "@/components/business/data/dashboard/window-picker"

// 示例数据的数据日；接真后端后从会话/健康条取
const DATA_DATE = "2026-09-05"
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
  const [dataWindow, setDataWindow] = useState<DataWindow>(() => resolvePreset("month_to_date", DATA_DATE, { preset: "month_to_date", from: DATA_DATE, to: DATA_DATE }))
  const [views, setViews] = useState<SavedView[]>(() => (isOk(viewsFixture) ? viewsFixture.data.items : []))
  const saveView = (name: string, columns: string[]) => setViews((prev) => [{ id: `local-${Date.now()}`, page: "data.table", name, config: { version: "view/v1", filters: {}, columns, sort: [], window: { preset: dataWindow.preset, from: dataWindow.from, to: dataWindow.to } }, isShared: false, updatedAt: new Date().toISOString() }, ...prev])
  const colorKey = session?.activeWorkspace.id

  return (
    <PageBody>
      <PageHeader
        title="数据分析"
        description="全量明细不聚合不裁剪；指标、环比、达标、色标全部由后端给，前端只展示"
        actions={
          <>
            <WindowPicker value={dataWindow} dataDate={DATA_DATE} onChange={setDataWindow} />
            
          </>
        }
      />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="语义查询按窗口取数接入后切换为真数据" empty={{ title: "当前窗口没有数据", description: "换一个窗口或账户范围；系统不会用 0 填充。" }}>
          {tab === "overview" ? <OverviewTab colorKey={colorKey} window={dataWindow} workspaceId={session?.activeWorkspace.id} /> : null}
          {tab === "table" ? <TableTab onSaveView={saveView} /> : null}
          {tab === "pivot" ? <PivotTab window={dataWindow} workspaceId={session?.activeWorkspace.id} colorKey={colorKey} /> : null}
          {tab === "hourly" ? <HourlyTab /> : null}
          {tab === "gap" ? <GapTab /> : null}
          {tab === "strategy" ? <StrategyTab /> : null}
          {tab === "attribution" ? <AttributionTab /> : null}
          {tab === "intel" ? <IntelTab /> : null}
          {tab === "reports" ? <ReportsTab views={views} onSaveView={saveView} /> : null}
        </StateFrame>
      </div>
    </PageBody>
  )
}
