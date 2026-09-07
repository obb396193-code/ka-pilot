"use client"

import { useState } from "react"

import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { StateFrame, StateSwitch, usePageState } from "@/components/business/state/page-state"
import { PageTabs, usePageTab } from "@/components/business/tabs/page-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isOk } from "@/lib/fixtures/contract"
import { viewsFixture, windowPresets, type SavedView, type WindowPreset } from "@/lib/fixtures/data-analysis"
import { GapTab } from "./tabs/gap-tab"
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
  { value: "gap", label: "Gap 对账" },
  { value: "strategy", label: "策略分析" },
  { value: "reports", label: "自助报表" },
] as const
type Tab = (typeof tabs)[number]["value"]

export function DataPage() {
  const { isMock, session } = useSession()
  const [tab, setTab] = usePageTab<Tab>(tabs, "overview")
  const state = usePageState()
  const [preset, setPreset] = useState<WindowPreset>("month_to_date")
  const [views, setViews] = useState<SavedView[]>(() => (isOk(viewsFixture) ? viewsFixture.data.items : []))
  const saveView = (name: string, columns: string[]) => setViews((prev) => [{ id: `local-${Date.now()}`, page: "data.table", name, config: { version: "view/v1", filters: {}, columns, sort: [], window: { preset } }, isShared: false, updatedAt: new Date().toISOString() }, ...prev])
  const colorKey = session?.activeWorkspace.id

  return (
    <PageBody>
      <PageHeader
        title="数据分析"
        description="全量明细不聚合不裁剪；指标、环比、达标、色标全部由后端给，前端只展示"
        isMock={isMock}
        actions={
          <>
            <Select value={preset} onValueChange={(value) => setPreset(value as WindowPreset)}>
              <SelectTrigger size="sm" className="w-32" aria-label="时间窗口"><span className="text-muted-foreground">窗口</span><SelectValue /></SelectTrigger>
              <SelectContent align="end">{windowPresets.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
            <StateSwitch />
          </>
        }
      />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="R-010a1 语义查询窗口化接入后切换为真数据" empty={{ title: "当前窗口没有数据", description: "换一个窗口或账户范围；系统不会用 0 填充。" }}>
          {tab === "overview" ? <OverviewTab colorKey={colorKey} /> : null}
          {tab === "table" ? <TableTab onSaveView={saveView} /> : null}
          {tab === "pivot" ? <PivotTab /> : null}
          {tab === "hourly" ? <HourlyTab /> : null}
          {tab === "gap" ? <GapTab /> : null}
          {tab === "strategy" ? <StrategyTab /> : null}
          {tab === "reports" ? <ReportsTab views={views} onSaveView={saveView} /> : null}
        </StateFrame>
      </div>
    </PageBody>
  )
}
