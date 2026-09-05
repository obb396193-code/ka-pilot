"use client"

import Link from "next/link"
import { useState } from "react"
import { IconArrowLeft } from "@tabler/icons-react"

import { formatDate, formatInteger, formatMoney, formatRatio } from "@/components/business/data-grid/format"
import { PageBody, PageHeader } from "@/components/business/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { QueryRecord } from "@/lib/data/data-view"
import { useTaskList } from "./use-task-list"

// 任务详情（PRD 2.3.2 承重页）六页签。`GET /api/v1/tasks/:id` 未开放前，总览取自列表项（同一契约的 pacing），其余页签诚实空态。
const tabs = [
  { id: "overview", label: "总览" },
  { id: "data", label: "数据" },
  { id: "accounts", label: "账户" },
  { id: "materials", label: "素材" },
  { id: "timeline", label: "时间线" },
  { id: "review", label: "复盘" },
] as const
const emptyCopy: Record<string, [string, string]> = {
  data: ["任务维度指标与漏斗", "唤端 → 潜客 → BI 的漏斗和全指标趋势随 GET /tasks/:id/funnel 开放"],
  accounts: ["挂载账户与容量", "账户列表、各自达标状态与容量随 GET /tasks/:id/accounts 开放"],
  materials: ["关联素材表现", "素材域接口（R-012）开放后可用；现在为 501 空态"],
  timeline: ["操作与变更时间线", "变更集、口径变更、派发记录倒序流随 GET /tasks/:id/timeline 开放"],
  review: ["周期复盘", "周期结束自动生成，Deep Research 入口随 Agent 服务开放；现在为 501 空态"],
}

export function TaskDetail({ taskId, query }: { taskId: string; query: QueryRecord }) {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("overview")
  const { items, loading, isMock } = useTaskList({ status: "all", state: Array.isArray(query.state) ? query.state[0] : query.state })
  const task = items.find((item) => item.taskId === taskId) ?? null

  return (
    <PageBody>
      <PageHeader
        title={loading ? <Skeleton className="h-7 w-48" /> : task?.taskName ?? "任务"}
        description={task ? <span>{task.bizName ?? "业务未提供"} · {task.period ? `${task.period.start} – ${task.period.end}` : "周期未提供"} · 负责人 {task.owner?.displayName ?? "−"}</span> : loading ? null : "该任务不在当前范围内，或详情接口尚未开放"}
        isMock={isMock}
        actions={<Button asChild variant="outline" size="sm"><Link href="/tasks"><IconArrowLeft />任务列表</Link></Button>}
      />
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabsList variant="line">{tabs.map((item) => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList>
        </Tabs>
        {tab === "overview" ? (
          task ? (
            <div className="grid gap-4 @5xl/main:grid-cols-12">
              <Card className="@5xl/main:col-span-8">
                <CardHeader><CardTitle>pacing</CardTitle><CardDescription>按后端 computeTaskPacing 结果展示，前端不外推</CardDescription></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="目标" value={formatInteger(task.volume?.target)} />
                  <Stat label="已完成" value={formatInteger(task.volume?.completed)} hint={`达成 ${formatRatio(task.pacing?.targetProgress)}`} />
                  <Stat label="时间进度" value={formatRatio(task.pacing?.timeProgress)} hint={task.pacing ? `已过 ${task.pacing.elapsedDays} / ${task.pacing.totalDays} 天` : undefined} />
                  <Stat label="预计完成" value={formatRatio(task.pacing?.projectedCompletion)} hint={task.pacing?.projectedGap !== null && task.pacing?.projectedGap !== undefined ? `预计缺口 ${formatInteger(task.pacing.projectedGap)}` : undefined} tone={task.pacing?.projectedGap ? "warn" : undefined} />
                  <Stat label="需日均" value={task.pacing?.requiredDailyVolume.state === "finite" && task.pacing.requiredDailyVolume.value !== null ? formatInteger(Math.round(task.pacing.requiredDailyVolume.value)) : "−"} />
                  <Stat label="考核价" value={formatMoney(task.assessmentPrice?.value)} hint={task.assessmentPrice ? `生效 ${formatDate(task.assessmentPrice.effectiveDate)}` : "版本历史随接口开放"} />
                  <Stat label="挂载账户" value={formatInteger(task.linkedAccountCount)} />
                  <Stat label="待处理" value={formatInteger(task.workItemSummary.openCount)} hint={task.workItemSummary.highestSeverity ? `最高 ${task.workItemSummary.highestSeverity}` : undefined} tone={task.workItemSummary.counts.P0 ? "bad" : undefined} />
                </CardContent>
              </Card>
              <Card className="@5xl/main:col-span-4">
                <CardHeader><CardTitle>动作分叉</CardTitle><CardDescription>加预算 / 降目标 / 挪量</CardDescription></CardHeader>
                <CardContent className="text-sm text-muted-foreground">建议动作在回测命中率数据积累后开放；写操作永远先出预览再确认。</CardContent>
              </Card>
            </div>
          ) : loading ? <Skeleton className="h-48 w-full" /> : (
            <Card className="border-dashed"><CardContent className="py-10 text-center text-sm text-muted-foreground">任务详情接口（GET /api/v1/tasks/:id）开放后显示；当前列表里没有这个任务。</CardContent></Card>
          )
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex min-h-48 flex-col items-center justify-center gap-2 text-center">
              <Badge variant="secondary">示例</Badge>
              <div className="text-sm font-medium">{emptyCopy[tab][0]}</div>
              <p className="max-w-md text-xs leading-5 text-muted-foreground">{emptyCopy[tab][1]}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </PageBody>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-lg border bg-background/60 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"mt-1 text-xl font-semibold tabular-nums " + (tone === "bad" ? "text-status-critical" : tone === "warn" ? "text-status-warning" : "")}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  )
}
