"use client"

import { useEffect, useState } from "react"
import { IconAlertTriangle, IconCheck, IconChevronDown, IconClock, IconRefresh, IconSend, IconShieldCheck, IconX } from "@tabler/icons-react"

import { useSession } from "@/components/business/session/session-provider"
import { useTheme } from "@/components/business/theme/theme-provider"
import { DataStateFrame } from "@/components/data-view/data-state-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { WorkbenchData } from "@/lib/data/contracts"
import type { DataResponse, QueryRecord } from "@/lib/data/data-view"
import { KpiCards } from "./kpi-cards"
import { QueueCard } from "./queue-card"
import { SeverityBadge } from "./severity-badge"
import { readTrendRange, TrendCard } from "./trend-card"

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }
function asOfLabel(value: string | null) {
  if (!value) return null
  const [date, rest] = value.split("T")
  return rest ? `${date.slice(5).replace("-", "/")} ${rest.slice(0, 5)}` : date
}
function useGreeting() {
  const [greeting, setGreeting] = useState("你好")
  useEffect(() => {
    const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", hour: "numeric", hour12: false }).format(new Date()))
    setGreeting(hour < 5 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好")
  }, [])
  return greeting
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/60 px-3 py-2.5">
      <div className="truncate text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

export function WorkbenchDashboard({
  response,
  query,
  onRefresh,
}: {
  response: DataResponse<WorkbenchData>
  query: QueryRecord
  onRefresh: () => void
}) {
  const { session } = useSession()
  const { theme } = useTheme()
  const greeting = useGreeting()
  const sources = response.lineage.mode === "single" ? [response.lineage.source] : [response.lineage.kaData, response.lineage.platform]
  // 执行入口三道闸：数据时效/覆盖门、AUTH-001 team 空间只读（不携带 execute grant）
  const dataGate = response.state === "stale" || response.state === "partial" || sources.some((source) => source.stale || source.partial)
  const readOnly = session?.activeWorkspace.readOnly ?? false
  const disabled = dataGate || readOnly
  const data = response.data
  const dataAsOf = asOfLabel(sources[0]?.dataAsOf ?? null)
  const p0 = data.alerts.find((alert) => alert.level === "P0")?.value ?? "−"
  const range = readTrendRange(first(query.date_from) ?? first(query.start), first(query.date_to) ?? first(query.end))
  const displayName = session?.identity.displayName ?? "KA 经营团队"

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-5 md:py-5 [&_[data-slot=card]]:gap-4 [&_[data-slot=card]]:py-4 [&_[data-slot=card-content]]:px-4 [&_[data-slot=card-footer]]:px-4 [&_[data-slot=card-header]]:px-4 @3xl/main:[&_[data-slot=card]]:py-5 @3xl/main:[&_[data-slot=card-content]]:px-5 @3xl/main:[&_[data-slot=card-footer]]:px-5 @3xl/main:[&_[data-slot=card-header]]:px-5">
      <div className="flex flex-col gap-3 px-4 lg:px-6 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{greeting}，{displayName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.scopeLabel} · {data.accountCoverage}
            {dataAsOf ? ` · 报告日 ${dataAsOf}` : ""}
            {session ? ` · ${session.activeWorkspace.name}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {response.isMock ? <Badge variant="secondary">脱敏 Mock</Badge> : <Badge variant="outline">内网数据</Badge>}
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <IconRefresh />
            刷新
          </Button>
        </div>
      </div>

      <DataStateFrame response={response} lineage="inline">
        <KpiCards metrics={data.metrics} sparklines={{ spend: data.trend.map((point) => point.spend), cpa: data.trend.map((point) => point.realCpa) }} />

        <div className="grid gap-4 px-4 lg:px-6 @5xl/main:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-4 @5xl/main:col-span-8">
            <TrendCard data={data.trend} range={range} dataAsOf={dataAsOf} colorKey={`${theme.mode}-${theme.hue}`} />
            <QueueCard items={data.anomalies} disabled={disabled} isMock={response.isMock} healthyMessage={data.healthyAccountMessage} />
          </div>

          <div className="flex min-w-0 flex-col gap-4 @5xl/main:col-span-4">
            <Card>
              <CardHeader>
                <CardTitle>P0 / P1 警报监控</CardTitle>
                <CardDescription>今天谁值班、几条未确认、几条在升级</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="今日值班" value="−" hint="值班表接入后显示" />
                  <Stat label="P0 未确认" value={p0} />
                  <Stat label="升级中" value="−" hint="升级链接入后显示" />
                </div>
                {data.alerts.map((alert) => (
                  <div key={alert.level} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <SeverityBadge level={alert.level} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{alert.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{alert.detail}</div>
                      </div>
                    </div>
                    <span className="text-lg font-semibold tabular-nums">{alert.value}</span>
                  </div>
                ))}
                <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                  <IconShieldCheck className="mt-0.5 size-4 shrink-0" />
                  <span>{readOnly ? "团队数据为只读空间，不开放执行入口；切回个人空间可对本人授权账户操作。" : dataGate ? "数据不完整或已过期，执行入口已禁用。" : "当前数据通过时效与覆盖检查；写动作仍须预览和二次确认。"}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>昨日动作回收 · T+1</CardTitle>
                <CardDescription>昨天做过的调整，今天看结果</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {data.yesterdayActions.map((item) => (
                  <div key={item.id} className="flex gap-3 rounded-lg border p-3">
                    {item.result === "positive" ? <IconCheck className="mt-0.5 size-4 shrink-0 text-status-success" /> : <IconX className="mt-0.5 size-4 shrink-0 text-status-critical" />}
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.evidence}</div>
                    </div>
                  </div>
                ))}
                {data.yesterdayActions.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">昨天没有已执行的变更；执行后次日在这里回收效果</div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>我的待办</CardTitle>
                <CardDescription>上级派发与自建</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {(data.todos.length ? data.todos : [{ kind: "assigned" as const, label: "上级派发", value: "−" }, { kind: "self_created" as const, label: "自建", value: "−" }]).map((todo) => (
                  <Stat key={todo.kind} label={todo.label} value={todo.value} hint={data.todos.length ? undefined : "派发或自建后出现"} />
                ))}
                <Button variant="outline" className="col-span-2" disabled={data.todos.length === 0}>查看全部待办</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AI 早报</CardTitle>
                <CardAction><Badge variant="outline">{response.isMock ? "示例" : "生成中"}</Badge></CardAction>
              </CardHeader>
              <CardContent>
                <div className="font-medium">{data.morningBrief.title}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{data.morningBrief.summary}</p>
                {data.morningBrief.details.length ? (
                  <details className="group mt-3 rounded-lg border p-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">展开依据<IconChevronDown className="size-4 transition-transform group-open:rotate-180" /></summary>
                    <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                      {data.morningBrief.details.map((detail) => <li key={detail} className="flex gap-2"><IconClock className="mt-0.5 size-3.5 shrink-0" />{detail}</li>)}
                    </ul>
                  </details>
                ) : null}
                <Button className="mt-3 w-full" variant="outline" disabled>
                  <IconSend />
                  发到钉钉群（接入后开放）
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {dataGate ? (
          <div role="alert" className="mx-4 flex items-start gap-2 rounded-lg border border-status-warning/35 bg-status-warning/8 px-4 py-3 text-sm lg:mx-6">
            <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning" />
            <span>数据未通过完整性或时效门：只允许查看，所有执行入口保持禁用。</span>
          </div>
        ) : null}
      </DataStateFrame>
    </div>
  )
}
