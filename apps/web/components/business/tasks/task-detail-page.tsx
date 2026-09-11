"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { IconArrowLeft, IconCheck, IconPencil, IconPlayerPlay, IconSparkles } from "@tabler/icons-react"
import { toast } from "sonner"

import { openAgentDrawer } from "@/components/business/command/events"
import { RelatedDocs } from "@/components/business/knowledge/related-docs"
import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { ExampleBlock, StateFrame, usePageState } from "@/components/business/state/page-state"
import { PageTabs, usePageTab } from "@/components/business/tabs/page-tabs"
import { useTaskDetail } from "@/lib/data/use-task-detail"
import { markReadiness } from "@/lib/data/use-me-actions"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { WorkItemCard } from "@/components/business/workbench/work-item-card"
import { SpendRealCpaTrend } from "@/components/charts/spend-real-cpa-trend"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { DisplayMetric } from "@/lib/data/contracts"
import { costStatusLabel, fmtTime, isOk, mv, rv, costStatusReasonText } from "@/lib/fixtures/contract"
import { AssessmentPriceHistory } from "./assessment-price-history"
import { bindingsFixtures, changeLogFixture, overviewFixtures, readinessKeys, sopStepLabel, taskAccountsFixture, taskFunnelFixture, taskMetricsFixture, taskStageMap, taskStages, taskTimelineFixture, tasksFixture, type TaskStage } from "@/lib/fixtures/tasks"
import { workItemDetailFixture, workItemLists } from "@/lib/fixtures/workbench"
import { cn } from "@/lib/utils"
import { ReadinessRing } from "./readiness"
import { ChangeLogGrid, TaskAccountsGrid } from "./task-grids"
import { TaskStrategyTab } from "./task-strategy-tab"
import { TaskReviewPanel } from "@/components/business/reports/review-panel"

// 任务详情八页签（v1.5.1 ②）：总览｜数据｜账户｜商品与素材(501)｜SOP 与自动化｜异常与工作项｜时间线｜报告与结算(501)
const tabs = [
  { value: "overview", label: "总览" },
  { value: "data", label: "数据" },
  { value: "accounts", label: "账户" },
  { value: "materials", label: "商品与素材" },
  { value: "sop", label: "SOP 与自动化" },
  { value: "issues", label: "异常与工作项" },
  { value: "timeline", label: "时间线" },
  { value: "reports", label: "报告与结算" },
  { value: "strategy", label: "投放策略" },
] as const
type Tab = (typeof tabs)[number]["value"]
const number0 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 })
const tone = (status: "green" | "yellow" | "red" | null): DisplayMetric["tone"] => status === "green" ? "positive" : status === "yellow" ? "warning" : status === "red" ? "critical" : "neutral"

export function TaskDetailPage({ taskId }: { taskId: string }) {
  const { isMock } = useSession()
  const state = usePageState()
  const [tab, setTab] = usePageTab<Tab>(tabs, "overview")
  // F8-8：总览接真后端（GET /api/internal/tasks/:id）；mock 模式仍走 fixture，其余七个页签暂时保持 fixture
  const remote = useTaskDetail(taskId, !isMock)
  const fixture = taskId === "fixture-task-nocap" ? overviewFixtures.nocap : overviewFixtures.ready
  const data = isMock ? (isOk(fixture) ? fixture.data : null) : remote.status === "ok" ? remote.data : null
  const listItem = isOk(tasksFixture) ? tasksFixture.data.items.find((item) => item.taskId === taskId) ?? null : null
  const [priceDialog, setPriceDialog] = useState<"assessment" | "cap" | "stage" | null>(null)
  const [form, setForm] = useState({ value: "", effectiveDate: "2026-09-06", evidenceUrl: "", note: "", stage: (data?.overview.stage?.value ?? "delivering") as TaskStage })
  const metrics = isOk(taskMetricsFixture) ? taskMetricsFixture.data : null
  const funnel = isOk(taskFunnelFixture) ? taskFunnelFixture.data : null
  const accounts = isOk(taskAccountsFixture) ? taskAccountsFixture.data.items : []
  const timeline = isOk(taskTimelineFixture) ? taskTimelineFixture.data.items : []
  const changeLog = isOk(changeLogFixture) && data ? changeLogFixture.data.items.filter((item) => item.scope.taskId === data.task.taskId) : []
  const issues = isOk(workItemLists["coverage-complete"]) ? workItemLists["coverage-complete"].data.items : []
  const issueDetail = isOk(workItemDetailFixture) ? workItemDetailFixture.data : null
  const bindingsFixture = data ? bindingsFixtures[data.task.taskId] : undefined
  const bindings = bindingsFixture && isOk(bindingsFixture) ? bindingsFixture.data : null
  const chartData = useMemo(() => (metrics?.trend ?? []).map((row) => ({ label: row.ds, spend: row.metrics.cost.availability === "available" ? row.metrics.cost.value : null, realCpa: row.metrics.ratios.cashCpa.state === "finite" ? row.metrics.ratios.cashCpa.value : null })), [metrics])

  if (!data) return null
  const ov = data.overview
  const stage = ov.stage?.value ?? listItem?.stage ?? null
  const headline: DisplayMetric[] = [
    { key: "target", label: "目标量", value: mv(ov.targetVolume), delta: null, tone: "neutral" },
    { key: "achieved", label: "已完成", value: mv(ov.achieved), delta: rv(ov.achievementRate) === "−" ? null : `达成 ${rv(ov.achievementRate)}`, tone: "neutral" },
    { key: "cashCpa", label: "现金 CPA", value: rv(ov.cost.cashCpa, "money"), delta: ov.assessmentPrice ? `考核 ¥${ov.assessmentPrice.current.toFixed(2)}` : "无考核价", tone: tone(ov.costStatus) },
    { key: "costSpace", label: "成本空间", value: mv(ov.cost.costSpace, "money0"), delta: null, tone: "neutral" },
    { key: "cap", label: "日预算卡", value: ov.dailyBudgetCap ? `¥${number0.format(ov.dailyBudgetCap.current)}` : "−", delta: ov.dailyBudgetCap ? `今日用 ${rv(ov.budgetUsageRate)}` : "无日预算卡", tone: "neutral" },
    { key: "pending", label: "待处理", value: String(ov.anomalySummary.p0 + ov.anomalySummary.p1), delta: ov.anomalySummary.p0 ? `${ov.anomalySummary.p0} 条 P0` : null, tone: ov.anomalySummary.p0 ? "critical" : "neutral" },
  ]

  return (
    <PageBody>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{data.task.taskName}{stage ? <TypeChip className="gap-1.5"><span className={cn("size-1.5 rounded-full", taskStageMap[stage].dot)} />{taskStageMap[stage].label}{ov.stage?.source === "manual" ? " · 手" : ov.stage?.source === "workflow" ? " · 工作流" : ""}</TypeChip> : null}{ov.costStatus ? <StatusChip tone={ov.costStatus === "green" ? "success" : ov.costStatus === "yellow" ? "warning" : "critical"}>{costStatusLabel[ov.costStatus]}</StatusChip> : <StatusChip tone="muted">不可判断</StatusChip>}</span>}
        description={<span>{data.task.bizName ?? "−"} · {data.task.period.start} – {data.task.period.end} · 预算 {mv(data.task.budget, "money0")} · 负责人 {data.task.owner?.displayName ?? "待分配"}{listItem?.rta ? " · RTA" : ""}{listItem?.placementPref ? ` · ${listItem.placementPref}` : ""} · {costStatusReasonText(ov.costStatusReason)}</span>}
        actions={
          <>
            
            <Button variant="outline" size="sm" onClick={() => openAgentDrawer(`分析任务「${data.task.taskName}」的达成、pacing、就绪缺项与阻塞`)}><IconSparkles />问 AI</Button>
            <Button variant="outline" size="sm" onClick={() => { setForm((prev) => ({ ...prev, stage: stage ?? "delivering", note: "" })); setPriceDialog("stage") }}><IconPencil />置阶段</Button>
            <Button asChild variant="outline" size="sm"><Link href="/tasks"><IconArrowLeft />任务列表</Link></Button>
          </>
        }
      />
      <PageTabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="px-4 lg:px-6">
        <StateFrame
          state={isMock ? state : remote.status === "loading" ? "loading" : remote.status === "not_found" ? "empty" : remote.status === "error" ? "error" : state}
          error={remote.status === "error" ? { code: "SOURCE_UNAVAILABLE", message: remote.message, retryable: true, requestId: remote.requestId ?? "" } : undefined}
          unlock="其余页签的接口接入后切换为真数据（总览已接真后端）"
          empty={{ title: "没有这个任务", description: "检查任务 ID，或回列表重新选。" }}
        >
          {tab === "overview" ? (
            <div className="flex flex-col gap-4">
              <KpiCards metrics={headline} className="px-0 lg:px-0" />
              {/* 知识库里挂在这个任务上的文档（契约 kb/by-object）；一条都没有时不占地方 */}
              <RelatedDocs objectType="task" objectId={taskId} />
              <Card>
                <CardHeader><CardTitle>SOP 执行进度</CardTitle><CardDescription>准备 → 开户 → 充值 → 基建 → 冷启动 → 跑量监控{ov.sopProgress?.runId ? ` · 绑定运行 ${ov.sopProgress.runId.slice(-4)}` : " · 未绑定 run，按阶段推导"}</CardDescription></CardHeader>
                <CardContent>
                  {ov.sopProgress ? (
                    <ol className="flex flex-wrap items-center gap-2">
                      {ov.sopProgress.steps.map((step, index) => (
                        <li key={step.key} className="flex items-center gap-2">
                          <div className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm", step.status === "done" && "border-foreground/30", step.status === "running" && "border-foreground bg-foreground text-background", step.status === "pending" && "text-muted-foreground")}>
                            {step.status === "done" ? <IconCheck className="size-3.5" /> : step.status === "running" ? <IconPlayerPlay className="size-3.5" /> : <span className="size-3.5 rounded-full border" />}
                            {sopStepLabel[step.key] ?? step.key}
                            {step.at ? <span className={cn("text-[11px] tabular-nums", step.status === "running" ? "text-background/70" : "text-muted-foreground")}>{fmtTime(step.at).slice(0, 5)}</span> : null}
                          </div>
                          {index < ov.sopProgress!.steps.length - 1 ? <span className="h-px w-4 bg-border" /> : null}
                        </li>
                      ))}
                      {!ov.sopProgress.runId ? <Button size="sm" variant="outline" onClick={() => toast("已用官方模板起 run", { description: "接口接入后生效（当前为示例）" })}><IconPlayerPlay />起「开户到基建」SOP</Button> : null}
                    </ol>
                  ) : <p className="text-sm text-muted-foreground">SOP 进度未返回。</p>}
                </CardContent>
              </Card>
              <div className="grid gap-4 @5xl/main:grid-cols-12">
                <Card className="@5xl/main:col-span-4">
                  <CardHeader><CardTitle>目标进度</CardTitle><CardDescription>进度与缺口由后端按实际数据算，前端不外推</CardDescription></CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {ov.pacing ? (
                      <>
                        <div className="relative h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-status-success" style={{ width: `${Math.min(100, (ov.pacing.targetProgress.value ?? 0) * 100)}%` }} /><span className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-foreground/60" style={{ left: `calc(${Math.min(100, (ov.pacing.timeProgress.value ?? 0) * 100)}% - 1px)` }} /></div>
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <dt className="text-muted-foreground">达成 / 时间</dt><dd className="text-right tabular-nums">{rv(ov.pacing.targetProgress)} / {rv(ov.pacing.timeProgress)}</dd>
                          <dt className="text-muted-foreground">已过 / 总天</dt><dd className="text-right tabular-nums">{ov.pacing.elapsedDays} / {ov.pacing.totalDays}</dd>
                          <dt className="text-muted-foreground">预计完成</dt><dd className="text-right tabular-nums">{rv(ov.pacing.projectedCompletion)}{ov.pacing.projectedGap !== null ? `（缺口 ${number0.format(ov.pacing.projectedGap)}）` : ""}</dd>
                          <dt className="text-muted-foreground">需日均 / 7 日均</dt><dd className="text-right tabular-nums">{rv(ov.pacing.requiredDailyVolume, "num")} / {rv(ov.pacing.sevenDayAvgVolume, "num")}</dd>
                          <dt className="text-muted-foreground">窗口末外推 CPA</dt><dd className="text-right tabular-nums">{rv(ov.cost.projectedWindowCashCpa, "money")}</dd>
                          <dt className="text-muted-foreground">剩余天可承受</dt><dd className="text-right tabular-nums">{rv(ov.cost.affordableDailyCashCpa, "money")}</dd>
                        </dl>
                        <p className="text-[11px] text-muted-foreground">截至 {ov.pacing.asOf} · 剔零量日 {ov.pacing.excludedZeroDays}</p>
                      </>
                    ) : <p className="text-sm text-muted-foreground">无目标量或无考核价：pacing 不外推，显 −。</p>}
                  </CardContent>
                </Card>
                <Card className="@5xl/main:col-span-4">
                  <CardHeader><CardTitle>任务就绪度</CardTitle><CardDescription>六项各 0–100% + 缺项；人工可勾</CardDescription></CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {ov.readiness ? (
                      <>
                        <ReadinessRing readiness={ov.readiness} />
                        <ul className="flex flex-col gap-1 text-xs">{readinessKeys.filter(({ key }) => !ov.readiness![key].ready).map(({ key, label }) => <li key={key} className="flex items-center justify-between gap-2"><span><span className="font-medium">{label}</span> 缺：{ov.readiness![key].missing.join("；") || "−"}</span><Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { void markReadiness(taskId, key, true).then((ok) => { if (ok) remote.reload?.() }) }}>勾就绪</Button></li>)}</ul>
                      </>
                    ) : <p className="text-sm text-muted-foreground">就绪度未返回。</p>}
                  </CardContent>
                </Card>
                <div className="flex flex-col gap-4 @5xl/main:col-span-4">
                  <Card>
                    <CardHeader><CardTitle>当前阻塞</CardTitle><CardDescription>来自 open 工作项 / 派发 / 就绪缺项</CardDescription></CardHeader>
                    <CardContent className="flex flex-col gap-1.5">{ov.blockers?.length ? ov.blockers.map((blocker, index) => <div key={`${blocker.ref}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><span className="flex items-center gap-2"><StatusChip tone={blocker.severity === "P0" ? "critical" : "warning"}>{blocker.severity}</StatusChip>{blocker.title}</span>{blocker.kind === "work_item" ? <Link href={`/work-items/${blocker.ref}`} className="text-xs underline-offset-4 hover:underline">去处理</Link> : <span className="text-xs text-muted-foreground">{blocker.kind}</span>}</div>) : <p className="text-sm text-muted-foreground">没有阻塞</p>}</CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>下一步</CardTitle><CardDescription>只来自真实工作项 / 派发 / 就绪缺项，不生成</CardDescription></CardHeader>
                    <CardContent className="flex flex-col gap-1.5">{ov.nextActions?.length ? ov.nextActions.map((action, index) => <div key={`${action.ref}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><span>{action.title}</span><TypeChip>{action.kind}</TypeChip></div>) : <p className="text-sm text-muted-foreground">没有下一步</p>}</CardContent>
                  </Card>
                </div>
              </div>
              <div className="grid gap-4 @5xl/main:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2"><div><CardTitle>考核价</CardTitle><CardDescription>只增不改，改一次留一行；回溯改触发重算</CardDescription></div><div className="flex items-center gap-1">
                      {/* F8-23：历史弹层和任务管理视图**共用一个组件**——两处各写一份，
                          「作废怎么算」这类规则迟早会在一处被写歪 */}
                      <AssessmentPriceHistory taskId={data.task.taskId} taskName={data.task.taskName} current={ov.assessmentPrice ? { value: ov.assessmentPrice.current, effectiveDate: ov.assessmentPrice.effectiveDate } : null} />
                      <Button size="sm" variant="outline" onClick={() => { setForm((prev) => ({ ...prev, value: ov.assessmentPrice ? String(ov.assessmentPrice.current) : "", note: "" })); setPriceDialog("assessment") }}><IconPencil />改价</Button>
                    </div></div>
                  </CardHeader>
                  <CardContent className="text-sm">{ov.assessmentPrice ? <span className="tabular-nums">当前 ¥{ov.assessmentPrice.current.toFixed(2)} · 生效 {ov.assessmentPrice.effectiveDate} · 历史 {ov.assessmentPrice.historyCount} 版</span> : <span className="text-muted-foreground">无考核价（不判达标、不判色）</span>}</CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2"><div><CardTitle>日预算卡</CardTitle><CardDescription>任务级、版本化；不触发重算</CardDescription></div><Button size="sm" variant="outline" onClick={() => { setForm((prev) => ({ ...prev, value: ov.dailyBudgetCap ? String(ov.dailyBudgetCap.current) : "", note: "" })); setPriceDialog("cap") }}><IconPencil />改卡</Button></div>
                  </CardHeader>
                  <CardContent className="text-sm">{ov.dailyBudgetCap ? <span className="tabular-nums">当前 ¥{number0.format(ov.dailyBudgetCap.current)} · 生效 {ov.dailyBudgetCap.effectiveDate} · 历史 {ov.dailyBudgetCap.historyCount} 版 · 今日使用 {rv(ov.budgetUsageRate)}</span> : <span className="text-muted-foreground">无日预算卡（预算使用率显 −）</span>}</CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader><CardTitle>变更记录</CardTitle><CardDescription>考核价 / 日预算卡 / 返点系数的改动，按时间倒序</CardDescription></CardHeader>
                <CardContent><ChangeLogGrid items={changeLog} /></CardContent>
              </Card>
            </div>
          ) : null}

          {tab === "data" ? (
            <div className="flex flex-col gap-4">
              {metrics ? <KpiCards metrics={[
                { key: "cost", label: "账面消耗", value: mv(metrics.summary.metrics.cost, "money0"), delta: rv(metrics.compare.deltas.cost) === "−" ? null : `${metrics.compare.mode === "wow" ? "周同比" : "环比"} ${rv(metrics.compare.deltas.cost)}`, tone: "neutral" },
                { key: "cashCost", label: "现金消耗", value: mv(metrics.summary.metrics.cashCost, "money0"), delta: null, tone: "neutral" },
                { key: "cashCpa", label: "现金 CPA", value: rv(metrics.summary.metrics.ratios.cashCpa, "money"), delta: rv(metrics.compare.deltas.cashCpa) === "−" ? null : `${metrics.compare.mode === "wow" ? "周同比" : "环比"} ${rv(metrics.compare.deltas.cashCpa)}`, tone: tone(metrics.summary.assessment.costStatus) },
                { key: "realConversion", label: "真实转化", value: mv(metrics.summary.metrics.realConversion), delta: null, tone: "neutral" },
                { key: "costSpace", label: "成本空间", value: mv(metrics.summary.metrics.costSpace, "money0"), delta: null, tone: "neutral" },
                { key: "accounts", label: "账户数", value: String(metrics.summary.accountCount), delta: `异常行 ${metrics.summary.anomalyRows}`, tone: "neutral" },
              ]} className="px-0 lg:px-0" /> : null}
              <div className="grid gap-4 @5xl/main:grid-cols-12">
                <Card className="@5xl/main:col-span-8">
                  <CardHeader><CardTitle>趋势</CardTitle><CardDescription>左轴账面消耗、右轴现金 CPA</CardDescription></CardHeader>
                  <CardContent>{chartData.length ? <SpendRealCpaTrend data={chartData} labels={{ spend: "账面消耗", cpa: "现金 CPA" }} /> : <p className="text-sm text-muted-foreground">无趋势</p>}</CardContent>
                </Card>
                <Card className="@5xl/main:col-span-4">
                  <CardHeader><CardTitle>漏斗</CardTitle><CardDescription>在线链（曝光→点击→回传→真实）/ 离线链（唤端→潜客→真实）· 离线缺数显 −，不补 0</CardDescription></CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm">
                    {funnel ? (
                      <>
                        <div><div className="mb-1 text-xs font-medium text-muted-foreground">在线</div><dl className="grid grid-cols-2 gap-y-1 text-xs"><dt>曝光</dt><dd className="text-right tabular-nums">{mv(funnel.online.exposure)}</dd><dt>点击 <span className="text-muted-foreground">CTR {rv(funnel.rates.ctr)}</span></dt><dd className="text-right tabular-nums">{mv(funnel.online.click)}</dd><dt>回传转化 <span className="text-muted-foreground">CVR {rv(funnel.rates.cvr)}</span></dt><dd className="text-right tabular-nums">{mv(funnel.online.conversion)}</dd><dt>真实转化 <span className="text-muted-foreground">差异 {rv(funnel.rates.gap)}</span></dt><dd className="text-right tabular-nums">{mv(funnel.online.realConversion)}</dd></dl></div>
                        <div><div className="mb-1 text-xs font-medium text-muted-foreground">离线</div><dl className="grid grid-cols-2 gap-y-1 text-xs"><dt>唤端 UV</dt><dd className="text-right tabular-nums">{mv(funnel.offline.wakeUv)}</dd><dt>潜客 UV <span className="text-muted-foreground">潜客率 {rv(funnel.rates.potentialRate)}</span></dt><dd className="text-right tabular-nums">{mv(funnel.offline.potentialUv)}</dd><dt>真实转化 <span className="text-muted-foreground">BI 转化率 {rv(funnel.rates.biConversionRate)}</span></dt><dd className="text-right tabular-nums">{mv(funnel.offline.realConversion)}</dd></dl></div>
                        <p className="text-[11px] text-muted-foreground">窗口 {funnel.window.from} ～ {funnel.window.to}</p>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}

          {tab === "accounts" ? (
            <Card>
              <CardHeader><CardTitle>挂载账户</CardTitle><CardDescription>达标 + 容量；一账户一任务</CardDescription></CardHeader>
              <CardContent><TaskAccountsGrid items={accounts} /></CardContent>
            </Card>
          ) : null}

          {tab === "materials" ? (
            <ExampleBlock unlock="素材接口接入后：这里显示任务关联素材的表现与复刻链路">
              <Card><CardHeader><CardTitle>商品与素材</CardTitle><CardDescription>501 占位 · 素材池 / 复刻 / brief 在「商品素材」页</CardDescription></CardHeader><CardContent className="text-sm text-muted-foreground">关联素材 · 商品 × 素材效果矩阵 · 设计 brief</CardContent></Card>
            </ExampleBlock>
          ) : null}

          {tab === "sop" ? (
            <div className="grid gap-4 @5xl/main:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>SOP 步骤</CardTitle><CardDescription>{ov.sopProgress?.runId ? `绑定运行 ${ov.sopProgress.runId}` : "未绑定运行"}</CardDescription></CardHeader>
                <CardContent>
                  <ol className="flex flex-col gap-2">{ov.sopProgress?.steps.map((step) => <li key={step.key} className="flex items-center gap-2 text-sm"><StatusChip tone={step.status === "done" ? "success" : step.status === "running" ? "progress" : step.status === "skipped" ? "muted" : "pending"}>{step.status === "done" ? "完成" : step.status === "running" ? "进行中" : step.status === "skipped" ? "跳过" : "待"}</StatusChip>{sopStepLabel[step.key] ?? step.key}<span className="ml-auto text-xs text-muted-foreground tabular-nums">{fmtTime(step.at)}</span></li>)}</ol>
                  {ov.sopProgress?.runId ? <Button asChild variant="outline" size="sm" className="mt-3"><Link href={`/automation/runs/${ov.sopProgress.runId}`}>打开运行详情</Link></Button> : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>绑定的规则 / 工作流</CardTitle><CardDescription>只显示绑到本任务的规则与工作流</CardDescription></CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  {bindings ? (
                    <>
                      {bindings.workflows.map((workflow) => <div key={workflow.workflowId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"><span className="flex items-center gap-2"><TypeChip>工作流 v{workflow.version}</TypeChip>{workflow.name}</span><span className="text-xs text-muted-foreground">{workflow.lastRun ? `最近 run ${workflow.lastRun.status} · ${fmtTime(workflow.lastRun.at)}` : "未运行"}</span></div>)}
                      {bindings.rules.map((rule) => <div key={rule.ruleId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"><span className="flex items-center gap-2"><TypeChip>{rule.type === "auto" ? "自动" : "监控"}</TypeChip>{rule.name}<span className="text-xs text-muted-foreground">{rule.scope === "task" ? "任务级" : "账户级"} · 自治度 {rule.autonomyLevel}</span></span><StatusChip tone={rule.enabled ? "success" : "muted"}>{rule.enabled ? "启用" : "停用"}</StatusChip></div>)}
                      {bindings.sop ? <p className="text-xs text-muted-foreground">SOP run …{bindings.sop.sopRunId.slice(-4)} · {bindings.sop.template} · 进度 {rv(bindings.sop.progress)}</p> : null}
                      {!bindings.workflows.length && !bindings.rules.length ? <p className="text-muted-foreground">本任务没有绑定规则或工作流</p> : null}
                    </>
                  ) : <p className="text-muted-foreground">本任务没有绑定样例（示例只给了「AAC 拉新」）；接口接入后按任务返回，无绑定 = 空。</p>}
                  <p className="text-xs text-muted-foreground">规则详情与「为什么未触发」在自动化页。</p>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {tab === "issues" ? (
            <div className="flex flex-col gap-3">
              {issues.length ? issues.map((item) => <WorkItemCard key={item.workItemId} item={item} detail={issueDetail && issueDetail.workItemId === item.workItemId ? issueDetail : null} />) : <p className="text-sm text-muted-foreground">该任务没有待处理工作项</p>}
              {issueDetail && !issues.some((item) => item.workItemId === issueDetail.workItemId) ? <WorkItemCard item={issueDetail} detail={issueDetail} /> : null}
            </div>
          ) : null}

          {tab === "timeline" ? (
            <Card>
              <CardHeader><CardTitle>时间线</CardTitle><CardDescription>五源倒序（工作项 / 变更集 / 考核价 / 日预算卡 / 派发）</CardDescription></CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-3">{timeline.map((item, index) => <li key={`${item.at}-${index}`} className="flex gap-3 text-sm"><span className="mt-1 size-2 shrink-0 rounded-full bg-foreground" /><div className="flex flex-col"><div className="flex items-center gap-2"><TypeChip>{item.kind}</TypeChip><span className="font-medium">{item.summary}</span></div><div className="text-xs text-muted-foreground tabular-nums">{fmtTime(item.at)} · {item.actor == null ? "−" : typeof item.actor === "string" ? (item.actor === "system" ? "系统" : "外部") : item.actor.name}</div></div></li>)}</ol>
              </CardContent>
            </Card>
          ) : null}

          {tab === "reports" ? (
            <div className="flex flex-col gap-4">
              <TaskReviewPanel taskId={data.task.taskId} taskName={data.task.taskName} />
              <Card><CardHeader><CardTitle>相关报告 / 结算</CardTitle><CardDescription>该任务相关的日报 / 结算行在报告页</CardDescription></CardHeader><CardContent className="flex gap-2"><Button asChild variant="outline" size="sm"><Link href="/reports?tab=daily">打开日报</Link></Button><Button asChild variant="outline" size="sm"><Link href="/reports?tab=settlement">打开结算单</Link></Button><Button asChild variant="outline" size="sm"><Link href="/reports?tab=weekly">打开周报</Link></Button></CardContent></Card>
            </div>
          ) : null}
          {tab === "strategy" ? <TaskStrategyTab taskId={data.task.taskId} /> : null}
        </StateFrame>
      </div>

      <Dialog open={priceDialog !== null} onOpenChange={(open) => { if (!open) setPriceDialog(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{priceDialog === "assessment" ? "改考核价" : priceDialog === "cap" ? "改日预算卡" : "置阶段"}</DialogTitle>
            <DialogDescription>{priceDialog === "assessment" ? "生效日早于最新生效日 = 回溯改，触发重算并提示 recomputed_days" : priceDialog === "cap" ? "不触发重算，记入时间线" : "手动置阶段，来源记为人工"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {priceDialog === "stage" ? (
              <Select value={form.stage} onValueChange={(value) => setForm((prev) => ({ ...prev, stage: value as TaskStage }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{taskStages.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
            ) : (
              <>
                <div className="grid gap-1.5"><Label>{priceDialog === "assessment" ? "考核价（元）" : "日预算卡（元）"}</Label><Input type="number" value={form.value} onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))} /></div>
                <div className="grid gap-1.5"><Label>生效日期</Label><Input type="date" value={form.effectiveDate} onChange={(event) => setForm((prev) => ({ ...prev, effectiveDate: event.target.value }))} /></div>
                <div className="grid gap-1.5"><Label>证据链接（可选）</Label><Input value={form.evidenceUrl} onChange={(event) => setForm((prev) => ({ ...prev, evidenceUrl: event.target.value }))} placeholder="https://" /></div>
              </>
            )}
            <div className="grid gap-1.5"><Label>备注</Label><Textarea value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceDialog(null)}>取消</Button>
            <Button disabled={priceDialog !== "stage" && !form.value} onClick={() => { toast.success(priceDialog === "stage" ? `阶段已置为 ${taskStageMap[form.stage].label}` : "已追加新版本", { description: priceDialog === "assessment" ? `生效 ${form.effectiveDate}；回溯改会重算窗口内达标` : priceDialog === "cap" ? `生效 ${form.effectiveDate}；改一次留一行` : "stage_source=manual" }); setPriceDialog(null) }}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageBody>
  )
}
