import { IconAlertTriangle, IconCheck, IconChevronDown, IconClock, IconShieldCheck, IconX } from "@tabler/icons-react"
import Link from "next/link"

import { SpendRealCpaTrend } from "@/components/charts/spend-real-cpa-trend"
import { DataStateFrame } from "@/components/data-view/data-state-frame"
import { DataViewSwitcher } from "@/components/data-view/data-view-switcher"
import { MetricGrid } from "@/components/data-view/metric-grid"
import { PageShell } from "@/components/data-view/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { WorkbenchData } from "@/lib/data/contracts"
import type { DataResponse, DataViewMode, QueryRecord } from "@/lib/data/data-view"
import { WorkItemActions } from "./work-item-actions"

export function WorkbenchDashboard({
  response,
  dataView,
  query,
}: {
  response: DataResponse<WorkbenchData>
  dataView: DataViewMode
  query: QueryRecord
}) {
  const sources = response.lineage.mode === "single" ? [response.lineage.source] : [response.lineage.kaData, response.lineage.platform]
  const disabled = response.state === "stale" || response.state === "partial" || sources.some((source) => source.stale || source.partial)
  const data = response.data

  return (
    <div className="min-h-full">
      <PageShell
        eyebrow="KA Pilot · 工作台"
        title={data.anomalies.length ? `今天先处理这 ${data.anomalies.length} 个关键账户` : "今日经营工作台"}
        description={`${data.greeting}。${data.scopeLabel}；页面指标均由候选 domain/API 响应提供，前端只展示。`}
        actions={<div className="flex items-center gap-2"><Badge variant="outline">Neutral</Badge>{response.isMock ? <Badge variant="secondary">脱敏 Mock</Badge> : <Badge variant="outline">内网 API</Badge>}</div>}
      >
        <DataViewSwitcher pathname="/" current={dataView} query={query} />
        <DataStateFrame response={response}>
          <MetricGrid metrics={data.metrics} />

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,.7fr)]">
            <Card className="min-w-0 overflow-hidden shadow-xs">
              <CardHeader className="flex-row items-center justify-between">
                <div><CardTitle>消耗与真实 CPA</CardTitle><p className="mt-1 text-xs text-muted-foreground">近 7 日 · 缺失点保持为空，不补 0</p></div>
                <Badge variant="outline">ECharts</Badge>
              </CardHeader>
              <CardContent className="min-w-0 overflow-hidden"><SpendRealCpaTrend data={data.trend} /></CardContent>
            </Card>
            <Card className="shadow-xs">
              <CardHeader><CardTitle>P0 / P1 警报监控</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.alerts.map((alert) => (
                  <div key={alert.level} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between"><Badge variant={alert.level === "P0" ? "destructive" : "secondary"}>{alert.level}</Badge><span className="font-mono text-xl font-semibold tabular-nums">{alert.value}</span></div>
                    <div className="mt-3 text-sm font-medium">{alert.label}</div><div className="mt-1 text-xs text-muted-foreground">{alert.detail}</div>
                  </div>
                ))}
                <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground"><IconShieldCheck className="mt-0.5 size-4 shrink-0" /><span>{disabled ? "数据不完整或已过期，执行入口已禁用。" : "当前数据通过时效与覆盖检查；写动作仍须预览和二次确认。"}</span></div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-xs">
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>今日待处理队列</CardTitle><p className="mt-1 text-xs text-muted-foreground">账户、证据、归因、建议动作和执行入口完整展示</p></div><Badge variant="outline">{data.anomalies.length} 个优先项</Badge></CardHeader>
            <CardContent className="space-y-4">
              {data.anomalies.map((item) => (
                <article key={item.id} className="grid gap-4 rounded-xl border p-4 lg:grid-cols-[minmax(180px,.55fr)_minmax(0,1.25fr)_minmax(230px,.8fr)]">
                  <div><div className="flex items-center gap-2"><Badge variant={item.severity === "critical" ? "destructive" : "secondary"}>{item.severity === "critical" ? "P0" : "P1"}</Badge><span className="text-xs text-muted-foreground">{response.isMock ? "脱敏示例" : "规则命中"}</span></div><Link href={`/accounts/${item.accountId}?data_view=platform&media=${encodeURIComponent(item.media)}`} className="mt-3 block font-medium underline-offset-4 hover:underline">{item.accountName}</Link><div className="mt-1 font-mono text-[11px] text-muted-foreground">{item.media} · {item.accountId}</div></div>
                  <div>{item.findingId ? <Link href={`/diagnostics/${item.findingId}`} className="font-medium underline-offset-4 hover:underline">{item.title}</Link> : <span className="font-medium">{item.title}</span>}<dl className="mt-3 grid gap-2 text-sm"><div><dt className="inline text-muted-foreground">证据：</dt><dd className="inline">{item.evidence}</dd></div><div><dt className="inline text-muted-foreground">归因：</dt><dd className="inline">{item.attribution}</dd></div><div><dt className="inline text-muted-foreground">建议：</dt><dd className="inline">{item.suggestedAction}</dd></div></dl></div>
                  <WorkItemActions accountName={item.accountName} suggestion={item.suggestedAction} disabled={disabled} />
                </article>
              ))}
              <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm"><IconCheck className="size-4 text-[var(--kp-status-success)]" /><span>{data.healthyAccountMessage}</span></div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="shadow-xs"><CardHeader><CardTitle>昨日动作回收 · T+1</CardTitle></CardHeader><CardContent className="space-y-3">{data.yesterdayActions.map((item) => <div key={item.id} className="flex gap-3 rounded-lg border p-3">{item.result === "positive" ? <IconCheck className="mt-0.5 size-4 shrink-0 text-[var(--kp-status-success)]" /> : <IconX className="mt-0.5 size-4 shrink-0 text-[var(--kp-status-critical)]" />}<div><div className="text-sm font-medium">{item.title}</div><div className="mt-1 text-xs text-muted-foreground">{item.evidence}</div></div></div>)}</CardContent></Card>
            <Card className="shadow-xs"><CardHeader><CardTitle>我的待办</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3">{data.todos.map((todo) => <div key={todo.kind} className="rounded-lg border p-4"><div className="text-xs text-muted-foreground">{todo.label}</div><div className="mt-2 font-mono text-2xl font-semibold tabular-nums">{todo.value}</div></div>)}<Button variant="outline" className="col-span-2">查看全部待办</Button></CardContent></Card>
            <Card className="shadow-xs"><CardHeader><div className="flex items-center justify-between"><CardTitle>AI 早报</CardTitle><Badge variant="outline">{response.isMock ? "脱敏示例" : "待接契约"}</Badge></div></CardHeader><CardContent><div className="font-medium">{data.morningBrief.title}</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{data.morningBrief.summary}</p><details className="mt-3 rounded-lg border p-3"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">展开依据<IconChevronDown className="size-4" /></summary><ul className="mt-3 space-y-2 text-xs text-muted-foreground">{data.morningBrief.details.map((detail) => <li key={detail} className="flex gap-2"><IconClock className="mt-0.5 size-3.5 shrink-0" />{detail}</li>)}</ul></details><Button className="mt-3 w-full" variant="outline" disabled={disabled}>预览发群内容</Button></CardContent></Card>
          </div>

          {disabled ? <div role="alert" className="flex items-start gap-2 rounded-lg border border-[var(--kp-status-warning)]/35 bg-[var(--kp-status-warning)]/8 px-4 py-3 text-sm"><IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--kp-status-warning)]" /><span>数据未通过完整性或时效门：只允许查看，所有执行入口保持禁用。</span></div> : null}
        </DataStateFrame>
      </PageShell>
    </div>
  )
}
