"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { IconBell, IconSend } from "@tabler/icons-react"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { StateFrame, StateSwitch, usePageState } from "@/components/business/state/page-state"
import { PageTabs, usePageTab } from "@/components/business/tabs/page-tabs"
import { SpendRealCpaTrend } from "@/components/charts/spend-real-cpa-trend"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { DisplayMetric } from "@/lib/data/contracts"
import { timelineFixture } from "@/lib/fixtures/accounts"
import { costStatusLabel, fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { summaryFixtures, trendFixture, windowLabel } from "@/lib/fixtures/data-analysis"
import { alertsStreamFixture, approvalsFixture, briefFixtures, changesetFixture, dispatchesFixture, rosterFixture, runsRunningFixture, severityMeta, workItemDetailFixture, workItemListVariants, workItemLists, type Severity, type WorkItem, type WorkItemListVariant } from "@/lib/fixtures/workbench"
import { cn } from "@/lib/utils"
import { CollabTab } from "./collab-tab"
import { KpiCards } from "./kpi-cards"
import { LeadView } from "./lead-view"
import { WorkItemCard } from "./work-item-card"

// 工作台（F-007 §3）：我的视图 ⇄ 负责人视图（role ∈ lead|admin 才显）；tab 今日｜协作；六卡 + 今日队列 + 右栏五卡
const tabs = [{ value: "today", label: "今日" }, { value: "collab", label: "协作" }] as const
type Tab = (typeof tabs)[number]["value"]
type QueueFilter = "all" | "P0" | "P1" | "opportunity"
const tone = (status: "green" | "yellow" | "red" | null): DisplayMetric["tone"] => status === "green" ? "positive" : status === "yellow" ? "warning" : status === "red" ? "critical" : "neutral"

export function WorkbenchPage() {
  const { isMock, session } = useSession()
  const role = session?.activeWorkspace.role
  const canLead = role === "admin" || role === "lead"
  const [view, setView] = useState<"mine" | "lead">("mine")
  const [tab, setTab] = usePageTab<Tab>(tabs, "today")
  const state = usePageState()
  const [queueVariant, setQueueVariant] = useState<WorkItemListVariant>("coverage-complete")
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all")
  const [briefVariant, setBriefVariant] = useState<"ready" | "pending">("ready")

  const summary = summaryFixtures.green
  const row = isOk(summary) ? summary.data.source.rows[0] : null
  const trendRows = isOk(trendFixture) ? trendFixture.data.source.rows : []
  const queue = workItemLists[queueVariant]
  const detail = isOk(workItemDetailFixture) ? workItemDetailFixture.data : null
  const queueItems = useMemo<WorkItem[]>(() => {
    const items = isOk(queue) ? [...queue.data.items] : []
    if (detail && isOk(queue) && !items.some((item) => item.workItemId === detail.workItemId)) items.unshift(detail)
    return items
  }, [queue, detail])
  const coverage = queue.meta?.coverage
  const counts = useMemo(() => ({ all: queueItems.length, P0: queueItems.filter((item) => item.severity === "P0").length, P1: queueItems.filter((item) => item.severity === "P1").length, opportunity: queueItems.filter((item) => item.severity === "opportunity").length }), [queueItems])
  const visible = queueItems.filter((item) => queueFilter === "all" || item.severity === queueFilter)
  const degraded = queue.meta?.dataState === "partial" || queue.meta?.dataState === "stale"

  const kpis = useMemo<DisplayMetric[]>(() => {
    if (!row) return []
    const a = row.assessment
    return [
      { key: "cost", label: "账面消耗", value: mv(row.metrics.cost, "money0"), delta: null, tone: "neutral" },
      { key: "cashCpa", label: "现金 CPA", value: rv(row.metrics.ratios.cashCpa, "money"), delta: a.price ? `考核 ¥${a.price.value.toFixed(2)}` : null, tone: tone(a.costStatus) },
      { key: "onTarget", label: "达标", value: a.onTarget === null ? "−" : a.onTarget ? "达标" : "超线", delta: a.costStatus ? costStatusLabel[a.costStatus] : null, tone: tone(a.costStatus) },
      { key: "costSpace", label: "成本空间", value: mv(row.metrics.costSpace, "money0"), delta: null, tone: "neutral" },
      { key: "realConversion", label: "BI 量级", value: mv(row.metrics.realConversion), delta: null, tone: "neutral" },
      { key: "pending", label: "待处理", value: String(counts.all), delta: counts.P0 ? `${counts.P0} 条 P0` : null, tone: counts.P0 ? "critical" : "neutral" },
    ]
  }, [row, counts])
  const sparklines = useMemo(() => ({ cost: trendRows.map((item) => item.metrics.cost.availability === "available" ? item.metrics.cost.value : null), cashCpa: trendRows.map((item) => item.metrics.ratios.cashCpa.state === "finite" ? item.metrics.ratios.cashCpa.value : null) }), [trendRows])
  const chartData = useMemo(() => trendRows.map((item) => ({ label: item.ds.slice(5), spend: item.metrics.cost.availability === "available" ? item.metrics.cost.value : null, realCpa: item.metrics.ratios.cashCpa.state === "finite" ? item.metrics.ratios.cashCpa.value : null })), [trendRows])

  const changeset = isOk(changesetFixture) ? changesetFixture.data : null
  const runs = isOk(runsRunningFixture) ? runsRunningFixture.data.items : []
  const alerts = isOk(alertsStreamFixture) ? alertsStreamFixture.data : null
  const rosterToday = isOk(rosterFixture) ? rosterFixture.data.items[0] : null
  const brief = briefFixtures[briefVariant]
  const t1 = isOk(timelineFixture) ? timelineFixture.data.items.filter((item) => item.t1Result) : []
  const todos = [
    ...(isOk(dispatchesFixture) ? dispatchesFixture.data.received.filter((item) => !item.receipt).map((item) => ({ id: item.dispatchId, label: `派发待回执：${item.acceptanceCriteria}`, kind: "派发" })) : []),
    ...(isOk(approvalsFixture) ? approvalsFixture.data.toApprove.filter((item) => item.status === "pending").map((item) => ({ id: item.approvalId, label: `待批：${item.title}`, kind: "提审" })) : []),
    ...(alerts ? alerts.items.filter((item) => !item.ackBy).map((item) => ({ id: item.escalationId, label: `待确认：${item.title}`, kind: "告警" })) : []),
  ]
  const windowText = isOk(summary) ? windowLabel(summary.data.source.lineage.window?.preset) : ""

  return (
    <PageBody>
      <PageHeader
        title={view === "lead" ? "负责人视图" : "早上好，KA 经营团队"}
        description={view === "lead" ? "团队缺口 / 风险 / 阻塞 / 拍板一眼看；team 空间只读" : `${windowText} · 今天处理什么：队列按严重度排，先处理最要紧的三条`}
        isMock={isMock}
        actions={
          <>
            {canLead ? <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(value) => { if (value) setView(value as typeof view) }} aria-label="视图"><ToggleGroupItem value="mine" className="px-3 text-xs">我的</ToggleGroupItem><ToggleGroupItem value="lead" className="px-3 text-xs">负责人</ToggleGroupItem></ToggleGroup> : null}
            <StateSwitch />
          </>
        }
      />
      {view === "mine" ? <PageTabs tabs={tabs} value={tab} onChange={setTab} /> : null}
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="R-010 工作项动作 + R-012 警报 / 早报接入后切换为真数据" empty={{ title: "今天没有待处理", description: "队列空 ≠ 全部健康；看底部覆盖三数。" }}>
          {view === "lead" ? <LeadView /> : tab === "collab" ? <CollabTab /> : (
            <div className="flex flex-col gap-4">
              <KpiCards metrics={kpis} sparklines={sparklines} className="px-0 lg:px-0" />
              <div className="grid gap-4 @5xl/main:grid-cols-12">
                <div className="flex flex-col gap-4 @5xl/main:col-span-8">
                  <Card>
                    <CardHeader><CardTitle>消耗与现金 CPA</CardTitle><CardDescription>{windowText} · 左轴账面消耗、右轴现金 CPA · 缺失日留空</CardDescription></CardHeader>
                    <CardContent>{chartData.length ? <SpendRealCpaTrend data={chartData} colorKey={session?.activeWorkspace.id} labels={{ spend: "账面消耗", cpa: "现金 CPA" }} /> : <p className="text-sm text-muted-foreground">后端未返回趋势</p>}</CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div><CardTitle>今日待处理队列</CardTitle><CardDescription>GET /work-items · 四件套：户 / 为什么 / 建议 / 动作</CardDescription></div>
                        <div className="flex items-center gap-2">
                          <Tabs value={queueFilter} onValueChange={(value) => setQueueFilter(value as QueueFilter)}>
                            <TabsList>{(["all", "P0", "P1", "opportunity"] as QueueFilter[]).map((key) => <TabsTrigger key={key} value={key}>{key === "all" ? "全部" : severityMeta[key as Severity].label}<Badge variant="secondary" className="ml-1">{counts[key]}</Badge></TabsTrigger>)}</TabsList>
                          </Tabs>
                          <Select value={queueVariant} onValueChange={(value) => setQueueVariant(value as WorkItemListVariant)}>
                            <SelectTrigger size="sm" className="w-44" aria-label="样例"><span className="text-muted-foreground">样例</span><SelectValue /></SelectTrigger>
                            <SelectContent align="end">{workItemListVariants.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      {degraded ? <div role="alert" className={cn("rounded-lg border px-3 py-2 text-sm", queue.meta?.dataState === "stale" ? "border-status-critical/30 bg-status-critical/10 text-status-critical" : "border-status-warning/30 bg-status-warning/10 text-status-warning")}>{queue.meta?.dataState === "stale" ? "队列数据过期（首次全量未完成或源过期）：只展示上次结果，执行入口置灰。" : "覆盖不完整：只展示已返回的工作项，不做全量结论。"}</div> : null}
                      {visible.length ? visible.map((item) => <WorkItemCard key={item.workItemId} item={item} detail={detail && detail.workItemId === item.workItemId ? detail : null} disabled={degraded} />) : <p className="py-6 text-center text-sm text-muted-foreground">该分组没有待处理项</p>}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {coverage && coverage.checked !== undefined ? (
                          <>
                            <span className="tabular-nums">已检查 {coverage.checked} · 待检查 {coverage.pending ?? "−"} · 缺数无法判断 {coverage.undeterminable ?? "−"}{coverage.checkedAt ? `（${fmtTime(coverage.checkedAt).slice(6)}）` : ""}</span>
                            {coverage.pending === 0 && coverage.undeterminable === 0 ? <span>· 其余 {Math.max(0, (coverage.checked ?? 0) - new Set(queueItems.map((item) => item.account?.accountId).filter(Boolean)).size)} 户在阈值内</span> : <span>· 未返回的账户不自动判定健康</span>}
                            {coverage.ruleSetVersion ? <Badge variant="outline" className="font-mono text-[10px]">{coverage.ruleSetVersion}</Badge> : null}
                          </>
                        ) : <span>{coverage?.complete ? "覆盖完整" : "覆盖三数未返回 · 未返回的账户不自动判定健康"}</span>}
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <div className="flex flex-col gap-4 @5xl/main:col-span-4">
                  <Card>
                    <CardHeader><CardTitle className="text-sm">待确认变更集</CardTitle><CardDescription>GET /changesets?status=draft&mine</CardDescription></CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      {changeset ? (
                        <div className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2"><span className="font-medium">{changeset.title}</span><TypeChip>{changeset.status}</TypeChip></div>
                          <div className="text-xs text-muted-foreground">{changeset.accountId} · {changeset.items.map((item) => `${item.targetId} ${item.field} ${String(item.fromValue.value)}→${String(item.toValue.value)}`).join("；")} · TTL {fmtTime(changeset.ttlExpireAt).slice(6)}</div>
                          <div className="flex gap-2"><Button size="sm" variant="outline" className="h-7" onClick={() => toast("dry-run 通过")}>dry-run</Button><Button size="sm" className="h-7" onClick={() => toast.success("已确认")}>确认</Button></div>
                        </div>
                      ) : <p className="text-sm text-muted-foreground">没有待确认</p>}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-sm">运行中的工作流</CardTitle><CardDescription>GET /workflows/runs?status=running&mine=true</CardDescription></CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      {runs.map((run) => (
                        <Link key={run.run_id} href={`/automation/runs/${run.run_id}`} className="flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50">
                          <div className="flex items-center justify-between gap-2"><span className="font-medium">{run.name}</span><StatusChip tone={run.status === "WAITING_CONFIRMATION" ? "warning" : "progress"}>{run.status === "WAITING_CONFIRMATION" ? "待确认" : "运行中"}</StatusChip></div>
                          <div className="flex items-center gap-1">{Array.from({ length: run.step_total }).map((_, index) => <span key={index} className={cn("h-1.5 flex-1 rounded-full", index < run.step_index ? "bg-foreground" : index === run.step_index ? "bg-status-warning" : "bg-muted")} />)}<span className="ml-2 text-xs text-muted-foreground tabular-nums">{run.step_index}/{run.step_total}</span></div>
                        </Link>
                      ))}
                      {runs.length === 0 ? <p className="text-sm text-muted-foreground">没有运行中的工作流</p> : null}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-sm">警报监控</CardTitle><CardDescription>今日值班 {alerts?.summary.onDuty?.name ?? rosterToday?.primary.name ?? "−"} · 备班 {rosterToday?.backup?.name ?? "−"}</CardDescription></CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2 text-center"><div className="rounded-lg border px-2 py-2"><div className="text-xs text-muted-foreground">P0 未确认</div><div className={cn("text-xl font-semibold tabular-nums", (alerts?.summary.p0Unacked ?? 0) > 0 && "text-status-critical")}>{alerts?.summary.p0Unacked ?? "−"}</div></div><div className="rounded-lg border px-2 py-2"><div className="text-xs text-muted-foreground">升级中</div><div className="text-xl font-semibold tabular-nums">{alerts?.summary.escalating ?? "−"}</div></div></div>
                      {alerts?.items.map((item) => <div key={item.escalationId} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><div className="flex min-w-0 items-center gap-2"><span className={cn("size-1.5 shrink-0 rounded-full", severityMeta[item.severity].dot)} /><span className="truncate">{item.title}</span></div>{item.ackBy ? <span className="text-xs text-muted-foreground">{item.ackBy.name} 已确认</span> : <Button size="sm" variant="outline" className="h-7" onClick={() => toast.success("已确认", { description: `${item.policy}` })}>确认</Button>}</div>)}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-sm">昨日动作回收 T+1</CardTitle><CardDescription>工作项 t1Result；只看观察结果，不判因果</CardDescription></CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      {t1.map((item) => <div key={item.at} className="rounded-lg border px-3 py-2 text-sm"><div className="font-medium">{item.summary}</div><div className="text-xs text-muted-foreground tabular-nums">现金 CPA {rv(item.t1Result!.metricDeltas.cashCpa, "money")} · 消耗 {mv(item.t1Result!.metricDeltas.cost, "money0")} · 真实转化 {mv(item.t1Result!.metricDeltas.realConversion)}{item.t1Result!.note ? ` · ${item.t1Result!.note}` : ""}</div></div>)}
                      {t1.length === 0 ? <p className="text-sm text-muted-foreground">昨日没有可回收的动作</p> : null}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-sm">我的待办</CardTitle><CardDescription>派发回执 / 待批 / 待确认告警</CardDescription></CardHeader>
                    <CardContent className="flex flex-col gap-1.5">
                      {todos.map((todo) => <Link key={todo.id} href="/?tab=collab" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"><TypeChip>{todo.kind}</TypeChip><span className="truncate">{todo.label}</span></Link>)}
                      {todos.length === 0 ? <p className="text-sm text-muted-foreground">没有待办</p> : null}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <div><CardTitle className="text-sm">AI 早报</CardTitle><CardDescription>GET /reports/daily-brief · 数据未就绪不生成假早报</CardDescription></div>
                        <Select value={briefVariant} onValueChange={(value) => setBriefVariant(value as typeof briefVariant)}><SelectTrigger size="sm" className="w-28" aria-label="早报样例"><SelectValue /></SelectTrigger><SelectContent align="end"><SelectItem value="ready">ready</SelectItem><SelectItem value="pending">pending_data</SelectItem></SelectContent></Select>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      {isOk(brief) && brief.data.status === "ready" ? (
                        <>
                          {brief.data.sections.map((section) => <div key={section.key} className="rounded-lg border px-3 py-2 text-sm"><div className="text-xs font-medium text-muted-foreground">{section.title}</div><div>{section.text}</div>{section.metrics ? <div className="mt-1 text-xs text-muted-foreground tabular-nums">现金 {mv(section.metrics.cashCost, "money0")} · 真实转化 {mv(section.metrics.realConversion)} · 现金 CPA {rv(section.metrics.cashCpa, "money")}</div> : null}</div>)}
                          {brief.data.queueSummary ? <div className="text-xs text-muted-foreground tabular-nums">队列 P0 {brief.data.queueSummary.p0} · P1 {brief.data.queueSummary.p1} · 机会 {brief.data.queueSummary.opportunity}</div> : null}
                          <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">生成 {fmtTime(brief.data.generatedAt)} · {brief.data.pushStatus === "sent" ? "已发群" : "未发群"}</span><Button size="sm" variant="outline" className="h-7" onClick={() => toast("已发到钉钉群", { description: "subscriptions.kind=daily_report" })}><IconSend />发群</Button></div>
                        </>
                      ) : isOk(brief) ? <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground"><IconBell className="size-4" />早报待数据就绪（{brief.data.reason ?? "pending_data"}），不生成假早报。</div> : null}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </StateFrame>
      </div>
    </PageBody>
  )
}
