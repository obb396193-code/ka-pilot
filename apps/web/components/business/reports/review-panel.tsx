"use client"

import { useState } from "react"
import Link from "next/link"
import { IconBook2, IconCheck, IconPlayerPlay, IconRefresh } from "@tabler/icons-react"
import { toast } from "sonner"

import { GapTree } from "@/components/business/data/gap-tree"
import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DisplayMetric } from "@/lib/data/contracts"
import { isOk, mv, rv } from "@/lib/fixtures/contract"
import { taskReviewFixtures, type TaskReview } from "@/lib/fixtures/v17"

// 任务复盘（v1.7 7.2）：发起 Deep Research → 状态 → 六段带溯源（goal / cost_trend / key_operations / attribution / why / next）；why / next 标「待人确认」；生成即归档知识库
const reviewStatusMeta: Record<TaskReview["status"], { label: string; tone: "pending" | "progress" | "success" | "critical" }> = { queued: { label: "排队", tone: "pending" }, running: { label: "研究中", tone: "progress" }, ready: { label: "已生成", tone: "success" }, failed: { label: "失败", tone: "critical" } }
const citationHref = (ref: string) => { const [type, id] = ref.split(":"); return type === "work_item" ? `/diagnostics/${id}` : type === "task" ? `/tasks/${id}` : null }

export function TaskReviewPanel({ taskId, taskName }: { taskId: string; taskName?: string }) {
  const fixture = taskReviewFixtures[taskId]
  const review = fixture && isOk(fixture) ? fixture.data : null
  const [launched, setLaunched] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  if (!review) {
    return (
      <Card>
        <CardHeader><CardTitle>任务复盘</CardTitle><CardDescription>发起后由 Agent 做 Deep Research，约 5–10 分钟；结果六段带溯源并归档知识库</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {launched ? <p className="flex items-center gap-2"><StatusChip tone="pending">排队</StatusChip>已发起（示例：fixture 只有 fixture-task-ready 的结果，此任务不会有回执）</p> : <p className="text-muted-foreground">{taskName ?? taskId} 还没有复盘。周期结束或手动发起后生成。</p>}
          <Button size="sm" className="w-fit" disabled={launched} onClick={() => { setLaunched(true); toast("已发起复盘", { description: "已提交，稍后在运行记录里看结果" }) }}><IconPlayerPlay />发起复盘</Button>
        </CardContent>
      </Card>
    )
  }
  const goal = review.sections.find((section) => section.key === "goal")
  const costTrend = review.sections.find((section) => section.key === "cost_trend")
  const ops = review.sections.find((section) => section.key === "key_operations")
  const attribution = review.sections.find((section) => section.key === "attribution")
  const why = review.sections.find((section) => section.key === "why")
  const next = review.sections.find((section) => section.key === "next")
  const goalCards: DisplayMetric[] = goal && goal.key === "goal" ? [
    { key: "target", label: "目标", value: mv(goal.cards.target), delta: null, tone: "neutral" },
    { key: "achieved", label: "已完成", value: mv(goal.cards.achieved), delta: `达成 ${rv(goal.cards.achievementRate)}`, tone: "neutral" },
  ] : []
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <TypeChip>{review.schema}</TypeChip>
        <StatusChip tone={reviewStatusMeta[review.status].tone}>{reviewStatusMeta[review.status].label}</StatusChip>
        <span className="text-xs text-muted-foreground">窗口 {review.window.from} ～ {review.window.to} · run …{review.runId.slice(-4)}</span>
        {review.kbDocumentId ? <Button asChild size="sm" variant="ghost" className="h-7"><Link href={`/knowledge/${encodeURIComponent(review.kbDocumentId)}`}><IconBook2 />已归档知识库</Link></Button> : null}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => toast("已重新发起", { description: "接口接入后生效（当前为示例）" })}><IconRefresh />重新复盘</Button>
          <Button size="sm" disabled={confirmed || review.humanConfirmed} onClick={() => { setConfirmed(true); toast.success("已确认复盘结论", { description: "确认后，原因 / 下一步不再标「待人确认」" }) }}><IconCheck />{confirmed || review.humanConfirmed ? "已人工确认" : "人工确认"}</Button>
        </div>
      </div>
      {goalCards.length ? <KpiCards metrics={goalCards} className="px-0 lg:px-0" /> : null}
      <div className="grid gap-4 @4xl/main:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>成本走势</CardTitle><CardDescription>现金 CPA（窗口两端）</CardDescription></CardHeader>
          <CardContent className="flex items-end gap-6">{costTrend && costTrend.key === "cost_trend" ? costTrend.trend.map((point) => <div key={point.ds}><p className="text-xs text-muted-foreground tabular-nums">{point.ds}</p><p className="text-xl font-semibold tabular-nums">{rv(point.cashCpa, "money")}</p></div>) : <p className="text-sm text-muted-foreground">−</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>关键操作</CardTitle><CardDescription>时间线</CardDescription></CardHeader>
          <CardContent><ol className="flex flex-col gap-1.5 text-sm">{ops && ops.key === "key_operations" ? ops.timeline.map((item) => <li key={`${item.at}-${item.summary}`} className="flex gap-3"><span className="text-xs text-muted-foreground tabular-nums">{item.at}</span><span>{item.summary}</span></li>) : null}</ol></CardContent>
        </Card>
      </div>
      {attribution && attribution.key === "attribution" ? (
        <Card>
          <CardHeader><CardTitle>归因摘要</CardTitle><CardDescription>完整树在数据分析 · 归因树</CardDescription></CardHeader>
          <CardContent><GapTree tree={{ mode: "volume", root: attribution.tree.root, children: attribution.tree.root.children ?? [], lineage: { window: review.window, adLevelSource: "none" } }} /></CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 @4xl/main:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">为什么 {!(confirmed || review.humanConfirmed) ? <Badge variant="outline" className="text-status-warning">待人确认</Badge> : null}</CardTitle><CardDescription>findings 带证据引用</CardDescription></CardHeader>
          <CardContent><ul className="flex flex-col gap-2 text-sm">{why && why.key === "why" ? why.findings.map((finding) => <li key={finding.text} className="rounded-lg border px-3 py-2"><p>{finding.text}</p><p className="mt-1 flex flex-wrap gap-1">{finding.evidenceRefs.map((ref) => { const href = citationHref(ref); return href ? <Link key={ref} href={href}><Badge variant="outline" className="font-mono text-[10px]">{ref}</Badge></Link> : <Badge key={ref} variant="outline" className="font-mono text-[10px]">{ref}</Badge> })}</p></li>) : null}</ul></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">下一步 {!(confirmed || review.humanConfirmed) ? <Badge variant="outline" className="text-status-warning">待人确认</Badge> : null}</CardTitle><CardDescription>suggestions · 可逆标记</CardDescription></CardHeader>
          <CardContent><ul className="flex flex-col gap-2 text-sm">{next && next.key === "next" ? next.suggestions.map((item) => <li key={item.text} className="rounded-lg border px-3 py-2"><p className="flex items-start justify-between gap-2">{item.text}{item.reversible ? <TypeChip className="shrink-0">可逆</TypeChip> : <StatusChip tone="warning" className="shrink-0">不可逆</StatusChip>}</p><p className="mt-1 flex flex-wrap gap-1">{item.evidenceRefs.map((ref) => <Badge key={ref} variant="outline" className="font-mono text-[10px]">{ref}</Badge>)}</p></li>) : null}</ul></CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>引用</CardTitle><CardDescription>citations · 每条可跳回来源</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">{review.citations.map((citation) => { const href = citationHref(citation.ref); const chip = <Badge variant="secondary">{citation.type} · {citation.label}</Badge>; return href ? <Link key={citation.ref} href={href}>{chip}</Link> : <span key={citation.ref}>{chip}</span> })}</CardContent>
      </Card>
    </div>
  )
}
