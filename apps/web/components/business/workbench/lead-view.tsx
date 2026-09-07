"use client"

import Link from "next/link"
import { IconCheck, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { ExampleBlock } from "@/components/business/state/page-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DisplayMetric } from "@/lib/data/contracts"
import { fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { windowLabel } from "@/lib/fixtures/data-analysis"
import { blockerKindLabel, leadFixture, leadKindLabel, type LeadItem } from "@/lib/fixtures/workbench"
import { KpiCards } from "./kpi-cards"

// 负责人视图（v1.5.1 ④ = 原型 P02 简化，不加导航）：六卡 + 风险与机会 + 团队阻塞 + 需要拍板 + 经营简报；impact 只用已冻公式，不做预估收益
function ItemList({ items, empty }: { items: LeadItem[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={`${item.taskId}-${item.kind}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
          <div className="flex items-center gap-2"><TypeChip>{leadKindLabel[item.kind]}</TypeChip><Link href={`/tasks/${encodeURIComponent(item.taskId)}`} className="font-medium underline-offset-4 hover:underline">{item.taskName}</Link></div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="tabular-nums">影响 {mv(item.impact, "money0")}</span>{item.suggestion ? <Link href={`/diagnostics/${item.suggestion.workItemId}`} className="underline-offset-4 hover:underline">去处理</Link> : <span>无建议</span>}</div>
        </div>
      ))}
    </div>
  )
}

export function LeadView() {
  const data = isOk(leadFixture) ? leadFixture.data : null
  if (!data) return null
  const cards: DisplayMetric[] = [
    { key: "targetAchievement", label: "目标达成", value: rv(data.cards.targetAchievement), delta: windowLabel(data.window.preset), tone: "neutral" },
    { key: "cumulativeCost", label: "累计消耗", value: mv(data.cards.cumulativeCost, "money0"), delta: null, tone: "neutral" },
    { key: "cashCpa", label: "现金 CPA", value: rv(data.cards.cashCpa.value, "money"), delta: data.cards.cashCpa.assessment !== null ? `考核 ¥${data.cards.cashCpa.assessment.toFixed(2)}` : null, tone: "neutral" },
    { key: "conversions", label: "转化", value: mv(data.cards.conversions), delta: null, tone: "neutral" },
    { key: "healthyTasks", label: "健康任务", value: `${data.cards.healthyTasks.n} / ${data.cards.healthyTasks.total}`, delta: null, tone: data.cards.healthyTasks.n < data.cards.healthyTasks.total ? "warning" : "positive" },
    { key: "budgetGap", label: "预算缺口", value: mv(data.cards.budgetGap.value, "money0"), delta: data.cards.budgetGap.basis === "pacing_projection" ? "按 pacing 外推" : data.cards.budgetGap.basis, tone: "neutral" },
  ]
  return (
    <div className="flex flex-col gap-4">
      <KpiCards metrics={cards} className="px-0 lg:px-0" />
      <div className="grid gap-4 @5xl/main:grid-cols-12">
        <Card className="@5xl/main:col-span-7">
          <CardHeader><CardTitle>风险与机会</CardTitle><CardDescription>按任务聚合工作项；影响 = cost_space / pacing 缺口，无则 −</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div><div className="mb-2 text-xs font-medium text-status-critical">风险</div><ItemList items={data.risks} empty="没有风险项" /></div>
            <div><div className="mb-2 text-xs font-medium text-status-success">机会</div><ItemList items={data.opportunities} empty="没有机会项" /></div>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4 @5xl/main:col-span-5">
          <Card>
            <CardHeader><CardTitle>团队阻塞</CardTitle><CardDescription>派发超期 / 升级中 / 待审批 / 就绪缺项</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data.blockers.map((blocker) => <div key={blocker.kind} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span className="flex items-center gap-2"><StatusChip tone={blocker.kind === "escalation" ? "critical" : "warning"}>{blockerKindLabel[blocker.kind]}</StatusChip><span className="text-xs text-muted-foreground">{blocker.tasks.join("、")}</span></span><span className="font-semibold tabular-nums">{blocker.count}</span></div>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>需要拍板</CardTitle><CardDescription>待你审批</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data.approvalsPending.map((item) => <div key={item.approvalId} className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm"><div className="font-medium">{item.title}</div><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{item.requester.name} · 截止 {fmtTime(item.due)}</span><span className="flex gap-1.5"><Button size="sm" variant="outline" className="h-7" onClick={() => toast.success("已批准")}><IconCheck />批准</Button><Button size="sm" variant="ghost" className="h-7" onClick={() => toast("已驳回")}><IconX />驳回</Button></span></div></div>)}
              {data.approvalsPending.length === 0 ? <p className="text-sm text-muted-foreground">没有待拍板</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>经营简报</CardTitle><CardDescription>{data.brief.status === "ready" ? "由日报负责人版生成" : "数据未就绪，不生成假简报"}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {data.brief.status === "ready" ? data.brief.sections.map((section) => <div key={section.key} className="rounded-lg border px-3 py-2 text-sm"><div className="text-xs font-medium text-muted-foreground">{section.title}</div><div>{section.text}</div></div>) : <p className="text-sm text-muted-foreground">pending_data</p>}
        </CardContent>
      </Card>
      <ExampleBlock unlock="目标差距树（3.7）与「操作后观察结果」统计（7.5）为 P2" inline>
        <div className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">目标差距树 · 操作后观察结果</div>
      </ExampleBlock>
    </div>
  )
}
