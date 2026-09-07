"use client"

import { useState } from "react"
import Link from "next/link"
import { IconBrandDingtalk, IconPencil } from "@tabler/icons-react"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DisplayMetric } from "@/lib/data/contracts"
import { costStatusLabel, fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { tasksFixture, taskStageMap, type TaskStage } from "@/lib/fixtures/tasks"
import { aiActionLabel, aiImpactFixture, monthlyExecFixture, weeklyFixture } from "@/lib/fixtures/v17"
import { TaskReviewPanel } from "./review-panel"

// 报告页 v1.7 四块：周报（五段）/ 任务复盘（Deep Research）/ AI 提效（四象限 + 趋势 + 估时表）/ 月度推送（三元组 + 拍板三键 + 差异）
export function WeeklyTab() {
  const report = isOk(weeklyFixture) ? weeklyFixture.data : null
  if (!report) return null
  const overview = report.sections.find((section) => section.key === "overview")
  const cards: DisplayMetric[] = overview && overview.key === "overview" ? [
    { key: "cost", label: "账面消耗", value: mv(overview.cards.cost, "money0"), delta: null, tone: "neutral" },
    { key: "cashCost", label: "现金消耗", value: mv(overview.cards.cashCost, "money0"), delta: null, tone: "neutral" },
    { key: "realConversion", label: "真实转化", value: mv(overview.cards.realConversion), delta: null, tone: "neutral" },
    { key: "cashCpa", label: "现金 CPA", value: rv(overview.cards.cashCpa, "money"), delta: null, tone: "neutral" },
    { key: "onTargetRate", label: "达标率", value: rv(overview.cards.onTargetRate), delta: null, tone: "neutral" },
  ] : []
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm"><TypeChip>{report.schema}</TypeChip><span>{report.week} · {report.role === "lead" ? "负责人版" : "优化师版"}</span><span className="text-xs text-muted-foreground">生成 {fmtTime(report.generatedAt)} · 数据截至 {fmtTime(report.dataAsOf)}</span><StatusChip tone={report.pushStatus === "sent" ? "success" : "pending"}>{report.pushStatus === "sent" ? "已推送" : "未推送"}</StatusChip><Button size="sm" className="ml-auto" onClick={() => toast.success("已推送周报", { description: "周报生成后推送到群" })}><IconBrandDingtalk />推钉钉群</Button></div>
      {cards.length ? <KpiCards metrics={cards} className="px-0 lg:px-0" /> : null}
      {report.sections.map((section) => {
        if (section.key === "tasks") return <Card key="tasks"><CardHeader><CardTitle>任务</CardTitle><CardDescription>达成率 / 成本状态 / 阶段</CardDescription></CardHeader><CardContent className="p-0"><Table><TableHeader className="bg-muted"><TableRow><TableHead>任务</TableHead><TableHead className="text-right">达成率</TableHead><TableHead>成本状态</TableHead><TableHead>阶段</TableHead></TableRow></TableHeader><TableBody>{section.rows.map((row) => <TableRow key={row.taskId}><TableCell><Link href={`/tasks/${encodeURIComponent(row.taskId)}`} className="underline-offset-4 hover:underline">{row.taskName}</Link></TableCell><TableCell className="text-right tabular-nums">{rv(row.achievementRate)}</TableCell><TableCell>{row.costStatus ? <StatusChip tone={row.costStatus === "green" ? "success" : row.costStatus === "yellow" ? "warning" : "critical"}>{costStatusLabel[row.costStatus]}</StatusChip> : <StatusChip tone="muted">不可判断</StatusChip>}</TableCell><TableCell><TypeChip>{taskStageMap[row.stage as TaskStage]?.label ?? row.stage}</TypeChip></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        if (section.key === "anomalies") return <Card key="anomalies"><CardHeader><CardTitle>异常处理与回收</CardTitle></CardHeader><CardContent><ul className="flex flex-col gap-1.5 text-sm">{section.items.map((item) => <li key={item.title} className="flex items-center gap-2">{item.handled ? <StatusChip tone="success">已处理</StatusChip> : <StatusChip tone="warning">未处理</StatusChip>}<span>{item.title}</span><span className="text-xs text-muted-foreground">T+1 {item.t1}</span></li>)}</ul></CardContent></Card>
        if (section.key === "operations") return <Card key="operations"><CardHeader><CardTitle>操作与观察结果</CardTitle><CardDescription>变更集 + 操作后观察结果（非因果）</CardDescription></CardHeader><CardContent><ul className="flex flex-col gap-1.5 text-sm">{section.items.map((item) => <li key={item.summary} className="flex items-center justify-between gap-2"><span>{item.summary}</span><span className="text-xs text-muted-foreground tabular-nums">{item.observed}</span></li>)}</ul></CardContent></Card>
        if (section.key === "nextWeek") return <Card key="nextWeek"><CardHeader><CardTitle>下周</CardTitle><CardDescription>只来自 pacing / 就绪缺项 / 阻塞，不生成</CardDescription></CardHeader><CardContent><ul className="flex flex-col gap-1.5 text-sm">{section.items.map((item) => <li key={item.text} className="flex items-center gap-2"><TypeChip>{item.source}</TypeChip>{item.text}</li>)}</ul></CardContent></Card>
        return null
      })}
    </div>
  )
}

export function ReviewTab() {
  const tasks = isOk(tasksFixture) ? tasksFixture.data.items : []
  const [taskId, setTaskId] = useState(tasks[0]?.taskId ?? "")
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2"><Select value={taskId} onValueChange={setTaskId}><SelectTrigger size="sm" className="w-56" aria-label="任务"><SelectValue /></SelectTrigger><SelectContent>{tasks.map((task) => <SelectItem key={task.taskId} value={task.taskId}>{task.taskName}</SelectItem>)}</SelectContent></Select><span className="text-xs text-muted-foreground">周期结束自动生成，也可手动发起</span></div>
      <TaskReviewPanel taskId={taskId} taskName={tasks.find((task) => task.taskId === taskId)?.taskName} />
    </div>
  )
}

export function AiImpactTab() {
  const data = isOk(aiImpactFixture) ? aiImpactFixture.data : null
  const [minutes, setMinutes] = useState<Record<string, number>>({})
  if (!data) return null
  const q = data.quadrants
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">窗口 {data.window.from} ～ {data.window.to} · 人时为估算（按操作估时表）· 不按人排名</p>
      <div className="grid gap-4 @3xl/main:grid-cols-2">
        <Card><CardHeader><CardTitle>自动规则执行</CardTitle><CardDescription>执行 / 成功 / UNKNOWN</CardDescription></CardHeader><CardContent className="flex items-end gap-6"><div><p className="text-3xl font-semibold tabular-nums">{mv(q.automatedRules.executed)}</p><p className="text-xs text-muted-foreground">执行</p></div><div><p className="text-xl font-semibold tabular-nums text-status-success">{mv(q.automatedRules.succeeded)}</p><p className="text-xs text-muted-foreground">成功</p></div><div><p className="text-xl font-semibold tabular-nums">{mv(q.automatedRules.unknown)}</p><p className="text-xs text-muted-foreground">UNKNOWN</p></div></CardContent></Card>
        <Card><CardHeader><CardTitle>异常拦截</CardTitle><CardDescription>条数 / P0 / 平均确认时长</CardDescription></CardHeader><CardContent className="flex items-end gap-6"><div><p className="text-3xl font-semibold tabular-nums">{mv(q.anomaliesIntercepted.count)}</p><p className="text-xs text-muted-foreground">拦截</p></div><div><p className="text-xl font-semibold tabular-nums text-status-critical">{mv(q.anomaliesIntercepted.p0)}</p><p className="text-xs text-muted-foreground">P0</p></div><div><p className="text-xl font-semibold tabular-nums">{rv(q.anomaliesIntercepted.avgAckMinutes, "num")} 分</p><p className="text-xs text-muted-foreground">平均确认</p></div></CardContent></Card>
        <Card><CardHeader><CardTitle>节省人时 <Badge variant="outline">估算</Badge></CardTitle><CardDescription>basis = {q.hoursSaved.basis}</CardDescription></CardHeader><CardContent><p className="text-3xl font-semibold tabular-nums">{mv(q.hoursSaved.value, "num")} 小时</p><Table className="mt-2"><TableHeader className="bg-muted"><TableRow><TableHead>操作</TableHead><TableHead className="text-right">次数</TableHead><TableHead className="text-right">估时（分/次）</TableHead></TableRow></TableHeader><TableBody>{q.hoursSaved.detail.map((row) => <TableRow key={row.action}><TableCell>{aiActionLabel[row.action] ?? row.action}</TableCell><TableCell className="text-right tabular-nums">{row.count}</TableCell><TableCell className="text-right"><Input type="number" className="ml-auto h-7 w-20 text-right" value={minutes[row.action] ?? row.minutes} onChange={(event) => setMinutes((prev) => ({ ...prev, [row.action]: Number(event.target.value) }))} onBlur={() => toast("估时已保存", { description: "接口接入后生效（当前为示例）" })} /></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
        <Card><CardHeader><CardTitle>采纳 vs 未采纳 · 观察成本差</CardTitle><CardDescription>{q.observedCostDiff.caveat}</CardDescription></CardHeader><CardContent><p className="text-3xl font-semibold tabular-nums">{rv(q.observedCostDiff.adoptedVsNot.cashCpaDelta, "money")}</p><p className="text-xs text-muted-foreground">现金 CPA 差 · 样本 采纳 {q.observedCostDiff.adoptedVsNot.sample.adopted} / 未采纳 {q.observedCostDiff.adoptedVsNot.sample.notAdopted}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader><CardTitle>趋势</CardTitle><CardDescription>按日：执行 / 拦截 / 节省人时</CardDescription></CardHeader>
        <CardContent className="p-0"><Table><TableHeader className="bg-muted"><TableRow><TableHead>日期</TableHead><TableHead className="text-right">执行</TableHead><TableHead className="text-right">拦截</TableHead><TableHead className="text-right">节省人时</TableHead></TableRow></TableHeader><TableBody>{data.trend.map((row) => <TableRow key={row.ds}><TableCell className="tabular-nums">{row.ds}</TableCell><TableCell className="text-right tabular-nums">{mv(row.executed)}</TableCell><TableCell className="text-right tabular-nums">{mv(row.intercepted)}</TableCell><TableCell className="text-right tabular-nums">{mv(row.hoursSaved, "num")}</TableCell></TableRow>)}</TableBody></Table></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>本人</CardTitle><CardDescription>byUser 仅本人与负责人可见，不进导出，不排名</CardDescription></CardHeader>
        <CardContent className="flex gap-6 text-sm">{data.byUser.map((user) => <div key={user.userId}><p className="font-medium">{user.name}</p><p className="text-xs text-muted-foreground tabular-nums">执行 {user.executed} · 节省 {user.hoursSaved} 小时（估算）</p></div>)}</CardContent>
      </Card>
    </div>
  )
}

export function MonthlyTab() {
  const data = isOk(monthlyExecFixture) ? monthlyExecFixture.data : null
  const [decided, setDecided] = useState<Record<string, string>>({})
  if (!data) return null
  const fmtDiff = (value: unknown) => (typeof value === "string" ? value : rv(value as Parameters<typeof rv>[0], "money"))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm"><TypeChip>月度经营</TypeChip><span>{data.month} 月度推送</span><span className="text-xs text-muted-foreground">推送为 L2 卡（拍板三键）+ 长图</span><Button size="sm" className="ml-auto" onClick={() => toast.success("已推送月度卡片")}><IconBrandDingtalk />推送</Button></div>
      <Card>
        <CardHeader><CardTitle>三元组</CardTitle><CardDescription>目标 · 状态 · 是否需要拍板</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">{data.triples.map((triple) => <div key={triple.goal} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm"><span className="font-medium">{triple.goal}</span><span className="text-muted-foreground">{triple.status}</span>{triple.needDecision ? <StatusChip tone="warning" className="ml-auto">需拍板</StatusChip> : <StatusChip tone="success" className="ml-auto">不需</StatusChip>}</div>)}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>需要拍板</CardTitle><CardDescription>三键 → approvals decide</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">{data.decisions.map((decision) => <div key={decision.approvalId} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"><span className="flex-1 font-medium">{decision.title}</span>{decided[decision.approvalId] ? <StatusChip tone="success">已{decided[decision.approvalId]}</StatusChip> : decision.options.map((option) => <Button key={option} size="sm" variant={option === "同意" ? "default" : "outline"} onClick={() => { setDecided((prev) => ({ ...prev, [decision.approvalId]: option })); toast(`已${option}`, { description: `接口接入后生效（当前为示例）` }) }}>{option}</Button>)}</div>)}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>自上次差异</CardTitle></CardHeader>
        <CardContent className="p-0"><Table><TableHeader className="bg-muted"><TableRow><TableHead>项</TableHead><TableHead className="text-right">上次</TableHead><TableHead className="text-right">本次</TableHead></TableRow></TableHeader><TableBody>{data.diffSinceLast.map((row) => <TableRow key={row.item}><TableCell>{row.item}</TableCell><TableCell className="text-right tabular-nums">{fmtDiff(row.from)}</TableCell><TableCell className="text-right tabular-nums">{fmtDiff(row.to)}</TableCell></TableRow>)}</TableBody></Table></CardContent>
      </Card>
      <p className="text-xs text-muted-foreground"><IconPencil className="mr-1 inline size-3" />文档预览 = 本页内容按 PNG 导出（export 任务化）。</p>
    </div>
  )
}
