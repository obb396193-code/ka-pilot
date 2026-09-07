"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { IconPlus, IconSparkles, IconStar } from "@tabler/icons-react"
import { createColumnHelper } from "@tanstack/react-table"
import { toast } from "sonner"

import { openAgentDrawer } from "@/components/business/command/events"
import { actionsColumn, DataGrid, dragColumn, MissingValue, selectionColumn, StatusChip, TypeChip, useGridTable, useLocalOrder, type GridFeatures } from "@/components/business/data-grid/data-grid"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { useSession } from "@/components/business/session/session-provider"
import { StateFrame, StateSwitch, usePageState } from "@/components/business/state/page-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { costStatusDot, costStatusLabel, isOk, rv } from "@/lib/fixtures/contract"
import { taskAccountsFixture, taskListStates, taskStageMap, taskStages, tasksFixture, type TaskItem } from "@/lib/fixtures/tasks"
import { watchlistFixture } from "@/lib/fixtures/settings"
import { cn } from "@/lib/utils"
import { ReadinessBar } from "./readiness"

// 投放任务列表（F-007 §4 / F-006 §5，契约 v1.5.1 ②）：tabs 进行中 / 准备中 / 已结束 + 我负责的 / 关注；列含就绪度六段 + 阶段 chip + pacing；右栏 分布 / 健康 / 里程碑
type StatusTab = "all" | "active" | "preparing" | "ended"
type Scope = "all" | "mine" | "starred"
const number0 = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 })
const taskHref = (task: TaskItem) => `/tasks/${encodeURIComponent(task.taskId)}`

function PacingCell({ pacing }: { pacing: TaskItem["pacing"] }) {
  if (!pacing || pacing.targetProgress.state !== "finite" || pacing.timeProgress.state !== "finite" || pacing.targetProgress.value === null || pacing.timeProgress.value === null) return <MissingValue title="pacing 未返回" />
  const target = Math.min(1, pacing.targetProgress.value), time = Math.min(1, pacing.timeProgress.value)
  return (
    <div className="min-w-32" title={`目标进度 ${rv(pacing.targetProgress)} · 时间进度 ${rv(pacing.timeProgress)} · 预计完成 ${rv(pacing.projectedCompletion)}`}>
      <div className="relative h-1.5 rounded-full bg-muted"><div className={cn("h-full rounded-full", target + 0.05 < time ? "bg-status-warning" : "bg-status-success")} style={{ width: `${target * 100}%` }} /><span aria-hidden className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded bg-foreground/60" style={{ left: `calc(${time * 100}% - 1px)` }} /></div>
      <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">达成 {rv(pacing.targetProgress)} · 时间 {rv(pacing.timeProgress)} · 预计 {rv(pacing.projectedCompletion)}</div>
    </div>
  )
}

const helper = createColumnHelper<GridFeatures, TaskItem>()
const columns = helper.columns([
  dragColumn<TaskItem>(),
  selectionColumn<TaskItem>(),
  helper.accessor("taskName", { header: "任务", enableHiding: false, meta: { label: "任务" }, cell: ({ row }) => <Button asChild variant="link" className="h-auto w-fit px-0 text-left font-medium text-foreground"><Link href={taskHref(row.original)}>{row.original.taskName}</Link></Button> }),
  helper.accessor("bizName", { header: "业务", meta: { label: "业务" }, cell: ({ getValue }) => getValue() ? <TypeChip>{getValue()}</TypeChip> : <MissingValue /> }),
  helper.accessor("stage", { header: "阶段", meta: { label: "阶段" }, cell: ({ getValue }) => { const meta = taskStageMap[getValue()]; return <TypeChip className="gap-1.5"><span className={cn("size-1.5 rounded-full", meta.dot)} />{meta.label}</TypeChip> } }),
  helper.accessor((row) => row.readiness.overall?.value ?? null, { id: "readiness", header: "就绪度", meta: { label: "就绪度" }, cell: ({ row }) => <ReadinessBar readiness={row.original.readiness} /> }),
  helper.accessor((row) => row.volume?.target ?? null, { id: "target", header: "目标", meta: { label: "目标", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{row.original.volume?.target == null ? "−" : number0.format(row.original.volume.target)}</span> }),
  helper.accessor((row) => row.volume?.completed ?? null, { id: "completed", header: "已完成", meta: { label: "已完成", align: "right" }, cell: ({ row }) => <span className="tabular-nums">{row.original.volume?.completed == null ? "−" : number0.format(row.original.volume.completed)}</span> }),
  helper.display({ id: "pacing", header: "达成 / pacing", meta: { label: "达成 / pacing" }, cell: ({ row }) => <PacingCell pacing={row.original.pacing} /> }),
  helper.accessor((row) => row.assessmentPrice?.value ?? null, { id: "assessment", header: "考核价", meta: { label: "考核价", align: "right" }, cell: ({ row }) => <span className="tabular-nums" title={row.original.assessmentPrice ? `生效 ${row.original.assessmentPrice.effectiveDate}` : undefined}>{row.original.assessmentPrice ? `¥${row.original.assessmentPrice.value.toFixed(2)}` : "−"}</span> }),
  helper.accessor((row) => row.costStatus ?? "", { id: "costStatus", header: "成本状态", meta: { label: "成本状态" }, cell: ({ row }) => { const status = row.original.costStatus; return status ? <StatusChip tone={status === "green" ? "success" : status === "yellow" ? "warning" : "critical"}>{costStatusLabel[status]}</StatusChip> : <StatusChip tone="muted">不可判断</StatusChip> } }),
  helper.accessor("rta", { header: "RTA", meta: { label: "RTA" }, cell: ({ getValue }) => getValue() ? <TypeChip>RTA</TypeChip> : <span className="text-xs text-muted-foreground">—</span> }),
  helper.accessor("placementPref", { header: "投放位置", meta: { label: "投放位置" }, cell: ({ getValue }) => getValue() ?? <MissingValue /> }),
  helper.accessor("accountCount", { header: "账户数", meta: { label: "账户数", align: "right" }, cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span> }),
  helper.accessor((row) => row.period?.start ?? "", { id: "period", header: "周期", meta: { label: "周期" }, cell: ({ row }) => row.original.period ? <span className="tabular-nums">{row.original.period.start.slice(5)} – {row.original.period.end.slice(5)}</span> : <MissingValue /> }),
  helper.accessor((row) => row.owner?.displayName ?? "", { id: "owner", header: "负责人", meta: { label: "负责人" }, cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">待分配</span> }),
  helper.accessor((row) => row.nextMilestone?.at ?? "", { id: "milestone", header: "下个里程碑", meta: { label: "下个里程碑" }, cell: ({ row }) => row.original.nextMilestone ? <span className="text-xs"><span className="tabular-nums text-muted-foreground">{row.original.nextMilestone.at.slice(5)}</span> {row.original.nextMilestone.label}</span> : <MissingValue /> }),
  helper.accessor("taskId", { header: "编号", meta: { label: "编号" }, cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue()}</span> }),
  actionsColumn<TaskItem>((task) => (
    <>
      <DropdownMenuItem asChild><Link href={taskHref(task)}>查看详情</Link></DropdownMenuItem>
      <DropdownMenuItem onSelect={() => openAgentDrawer(`分析任务「${task.taskName}」的达成、pacing 与就绪缺项`)}><IconSparkles />问 AI</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => toast("已关注", { description: "关注列表接入后保存" })}><IconStar />关注</DropdownMenuItem>
      <DropdownMenuItem disabled title="任务编辑接口开放后启用">编辑</DropdownMenuItem>
      <DropdownMenuItem disabled title="归档接口开放后启用">归档</DropdownMenuItem>
    </>
  )),
])

export function TasksPage() {
  const { isMock } = useSession()
  const state = usePageState()
  const [status, setStatus] = useState<StatusTab>("all")
  const [scope, setScope] = useState<Scope>("all")
  const [legacyState, setLegacyState] = useState<keyof typeof taskListStates | "v151">("v151")
  const all = useMemo(() => (isOk(tasksFixture) ? tasksFixture.data.items : []), [])
  const legacy = legacyState === "v151" ? null : taskListStates[legacyState]
  // 关注 = me/watchlist（v1.7.4：项可为 account 或 task；无 type 视为 account）→ 账户型按任务挂载账户命中，任务型按 taskId 命中
  const starred = useMemo(() => {
    const watch = isOk(watchlistFixture) ? (watchlistFixture.data.items as { type?: "account" | "task"; media?: string; accountId?: string; taskId?: string }[]) : []
    const watchedAccounts = new Set(watch.filter((item) => (item.type ?? "account") === "account").map((item) => item.accountId))
    const watchedTasks = new Set(watch.filter((item) => item.type === "task").map((item) => item.taskId))
    const mounted = isOk(taskAccountsFixture) ? taskAccountsFixture.data.items : []
    return new Set(all.filter((task) => watchedTasks.has(task.taskId) || (task.taskId === "fixture-task-ready" && mounted.some((account) => watchedAccounts.has(account.accountId)))).map((task) => task.taskId))
  }, [all])
  const items = useMemo(() => all.filter((task) => (status === "all" || task.status === status) && (scope !== "mine" || task.owner?.displayName === "示例优化师") && (scope !== "starred" || starred.has(task.taskId))), [all, status, scope, starred])
  const counts = useMemo(() => ({ all: all.length, active: all.filter((task) => task.status === "active").length, preparing: all.filter((task) => task.status === "preparing").length, ended: all.filter((task) => task.status === "ended").length }), [all])
  const { ordered, reorder } = useLocalOrder(items, (task) => task.taskId)
  const table = useGridTable({ data: legacy ? [] : ordered, columns, pageSize: 20, getRowId: (task) => task.taskId, initialColumnVisibility: { taskId: false, period: false, rta: false, placementPref: false } })
  const stageDistribution = taskStages.map((stage) => ({ stage, count: all.filter((task) => task.stage === stage.value).length })).filter((item) => item.count > 0)
  const health = (["green", "yellow", "red"] as const).map((status) => ({ status, count: all.filter((task) => task.costStatus === status).length }))
  const unknown = all.filter((task) => !task.costStatus).length
  const milestones = all.filter((task) => task.nextMilestone).sort((a, b) => (a.nextMilestone!.at < b.nextMilestone!.at ? -1 : 1))
  const degraded = legacy?.meta?.dataState === "partial" || legacy?.meta?.dataState === "stale"

  return (
    <PageBody>
      <PageHeader title="投放任务" description="任务是业务信息中心：从准备到投放全过程可追踪（阶段 · 就绪度 · SOP · 阻塞）；达成与 pacing 由后端算" isMock={isMock} actions={
        <>
          <Select value={legacyState} onValueChange={(value) => setLegacyState(value as typeof legacyState)}>
            <SelectTrigger size="sm" className="w-40" aria-label="样例"><span className="text-muted-foreground">样例</span><SelectValue /></SelectTrigger>
            <SelectContent align="end"><SelectItem value="v151">标准列表</SelectItem><SelectItem value="ready">四态 · 正常</SelectItem><SelectItem value="partial">四态 · 覆盖不全</SelectItem><SelectItem value="stale">四态 · 数据过期</SelectItem><SelectItem value="empty">四态 · 空</SelectItem></SelectContent>
          </Select>
          <StateSwitch />
        </>
      } />
      <div className="px-4 lg:px-6">
        <StateFrame state={state} unlock="任务阶段 / 就绪度 / SOP 接口接入后切换为真数据" empty={{ title: "没有任务", description: "任务由运营在创建接口开放后新建；个人空间只看本人授权账户挂载的任务。" }}>
          <div className="grid gap-4 @6xl/main:grid-cols-12">
            <div className="min-w-0 @6xl/main:col-span-9">
              {legacy ? (
                <div className={cn("mb-3 rounded-lg border px-4 py-2.5 text-sm", degraded ? (legacy.meta?.dataState === "stale" ? "border-status-critical/30 bg-status-critical/10 text-status-critical" : "border-status-warning/30 bg-status-warning/10 text-status-warning") : "text-muted-foreground")}>
                  四态样例：{legacy.meta?.dataState === "stale" ? "当天数据未到，展示上一次同步结果，进度可能滞后" : legacy.meta?.dataState === "partial" ? "覆盖不完整：只展示已返回的任务，执行入口置灰" : legacy.meta?.dataState === "empty" ? "当前范围内没有任务" : "覆盖完整"}（这组样例字段少，表格仍按标准列表展示）
                </div>
              ) : null}
              <DataGrid
                table={table}
                empty={legacy ? "该样例没有可展示的任务行" : "没有符合条件的任务"}
                onReorder={reorder}
                toolbar={
                  <>
                    <Tabs value={status} onValueChange={(value) => setStatus(value as StatusTab)}>
                      <TabsList>{(["all", "active", "preparing", "ended"] as StatusTab[]).map((key) => <TabsTrigger key={key} value={key}>{key === "all" ? "全部" : key === "active" ? "进行中" : key === "preparing" ? "准备中" : "已结束"}{key !== "all" ? <Badge variant="secondary">{counts[key]}</Badge> : null}</TabsTrigger>)}</TabsList>
                    </Tabs>
                    <Tabs value={scope} onValueChange={(value) => setScope(value as Scope)}>
                      <TabsList variant="line"><TabsTrigger value="all">所有</TabsTrigger><TabsTrigger value="mine">我负责的</TabsTrigger><TabsTrigger value="starred">关注</TabsTrigger></TabsList>
                    </Tabs>
                  </>
                }
                actions={<Tooltip><TooltipTrigger asChild><span className="inline-flex"><Button size="sm" disabled><IconPlus />新建任务</Button></span></TooltipTrigger><TooltipContent side="bottom">创建接口（R-010）开放后启用</TooltipContent></Tooltip>}
                bulkActions={<Button variant="outline" size="sm" onClick={() => openAgentDrawer(`对比所选 ${table.getSelectedRowModel().rows.length} 个任务的达成与成本`)}><IconSparkles />分析所选</Button>}
              />
            </div>
            <aside className="flex flex-col gap-4 @6xl/main:col-span-3">
              <Card>
                <CardHeader><CardTitle className="text-sm">任务分布</CardTitle><CardDescription>按阶段（只数任务个数）</CardDescription></CardHeader>
                <CardContent className="flex flex-col gap-1.5">{stageDistribution.map(({ stage, count }) => <div key={stage.value} className="flex items-center gap-2 text-xs"><span className={cn("size-1.5 rounded-full", stage.dot)} /><span className="w-12 text-muted-foreground">{stage.label}</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-foreground" style={{ width: `${(count / Math.max(1, all.length)) * 100}%` }} /></span><span className="w-5 text-right tabular-nums">{count}</span></div>)}</CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">健康分布</CardTitle><CardDescription>costStatus 三色 + 不可判断</CardDescription></CardHeader>
                <CardContent className="flex flex-col gap-1.5">
                  {health.map(({ status, count }) => <div key={status} className="flex items-center gap-2 text-xs"><span className={cn("size-1.5 rounded-full", costStatusDot[status])} /><span className="w-24 text-muted-foreground">{costStatusLabel[status]}</span><span className="ml-auto tabular-nums">{count}</span></div>)}
                  <div className="flex items-center gap-2 text-xs"><span className="size-1.5 rounded-full border border-muted-foreground" /><span className="w-24 text-muted-foreground">不可判断</span><span className="ml-auto tabular-nums">{unknown}</span></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">即将到达的里程碑</CardTitle><CardDescription>nextMilestone</CardDescription></CardHeader>
                <CardContent className="flex flex-col gap-1.5">{milestones.length ? milestones.map((task) => <Link key={task.taskId} href={taskHref(task)} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"><span className="truncate">{task.taskName} · {task.nextMilestone!.label}</span><span className="tabular-nums text-muted-foreground">{task.nextMilestone!.at.slice(5)}</span></Link>) : <p className="text-xs text-muted-foreground">没有里程碑</p>}</CardContent>
              </Card>
            </aside>
          </div>
        </StateFrame>
      </div>
    </PageBody>
  )
}
