"use client"

import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react"

import { useSession } from "@/components/business/session/session-provider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fmtTime } from "@/lib/fixtures/contract"
import { cn } from "@/lib/utils"
import healthFixture from "@contract/fixtures/system/health.json"

// DATA-ROUTE-001：每页页头常显「空间 · 来源 · 数据日期 · 更新时间 · 口径 ⓘ」+ 三色——切空间后金额不同是换源不是算错。
// 数据来自 `GET /system/health`（fixture `system/health.json`）；真实模式 BFF 路径未冻（F-006-Q1）→ 显「待接入」。
export type SystemHealthState = "fresh" | "backfilling" | "stale" | "unknown"
type SourceKey = "platform" | "ka_data"
type HealthSource = { source: SourceKey; dataAsOf: string | null; businessDate: string | null; status: "green" | "yellow" | "red"; note: string | null; etl: { lastRun: string; status: string; at: string } | null; coverage: { accounts: number; withData: number } | null }
export type SystemHealth = {
  state: SystemHealthState
  workspaceKind: "personal" | "team" | null
  source: SourceKey | null
  dataAsOf: string | null
  businessDate: string | null
  updatedAt: string | null
  metricVersion: string
  detail: string
  sources: HealthSource[]
}

const sourceLabel: Record<SourceKey, string> = { platform: "启航", ka_data: "KA Data" }
const kindLabel = { personal: "个人空间", team: "团队数据" } as const
const stateOf: Record<HealthSource["status"], SystemHealthState> = { green: "fresh", yellow: "backfilling", red: "stale" }

export function useSystemHealth(): SystemHealth {
  const { session, isMock } = useSession()
  const workspaceKind = session?.activeWorkspace.kind ?? null
  const source: SourceKey | null = workspaceKind === "team" ? "ka_data" : workspaceKind === "personal" ? "platform" : null
  if (!isMock) {
    return { state: "unknown", workspaceKind, source, dataAsOf: null, businessDate: null, updatedAt: null, metricVersion: "−", detail: "数据时效服务接入后，这里显示来源、数据日期与更新时间。", sources: [] }
  }
  const sources = healthFixture.data.sources as HealthSource[]
  const current = sources.find((item) => item.source === source) ?? sources[0]
  return {
    state: current ? stateOf[current.status] : "unknown",
    workspaceKind,
    source,
    dataAsOf: current?.dataAsOf ?? null,
    businessDate: current?.businessDate ?? null,
    updatedAt: current?.etl?.at ?? healthFixture.meta.dataAsOf ?? null,
    metricVersion: "account-metrics-v2 · 考核=现金口径",
    detail: current?.note ?? "脱敏 Mock：最近一次同步已完成。",
    sources,
  }
}

const dotOf: Record<SystemHealthState, string> = { fresh: "bg-status-success", backfilling: "bg-status-warning", stale: "bg-status-critical", unknown: "bg-muted-foreground/40" }
const stateLabel: Record<SystemHealthState, string> = { fresh: "数据正常", backfilling: "补拉中", stale: "今日未更新 · 展示昨日", unknown: "时效待接入" }

/** 页头五件 + 三色点；窄屏只留点 + 数据日期 */
export function DataHealthPill() {
  const health = useSystemHealth()
  const items = [
    health.workspaceKind ? kindLabel[health.workspaceKind] : "空间 −",
    health.source ? sourceLabel[health.source] : "来源 −",
    `数据日 ${health.businessDate ? health.businessDate.slice(5) : "−"}`,
    `更新 ${health.updatedAt ? fmtTime(health.updatedAt).slice(6) : "−"}`,
  ]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`数据健康：${stateLabel[health.state]}；${items.join("，")}`}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-transparent px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className={cn("size-2 shrink-0 rounded-full", dotOf[health.state])} aria-hidden />
          <span className="hidden items-center gap-1.5 2xl:inline-flex">
            {items.map((item, index) => <span key={item} className="inline-flex items-center gap-1.5">{index > 0 ? <span className="text-border">·</span> : null}{item}</span>)}
            <span className="text-border">·</span>
            <span className="inline-flex items-center gap-0.5">口径<IconInfoCircle className="size-3.5" /></span>
          </span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap 2xl:hidden">数据日 {health.businessDate ? health.businessDate.slice(5) : "−"}<span className="text-border">·</span><span className="inline-flex items-center gap-0.5">口径<IconInfoCircle className="size-3.5" /></span></span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-80">
        <p className="font-medium">{stateLabel[health.state]}</p>
        <p className="mt-1 opacity-80">{health.detail}</p>
        <p className="mt-1 opacity-80">口径：{health.metricVersion}；切空间即切源（个人 = 启航本人授权账户，团队 = KA Data 只读）。</p>
        {health.sources.length ? (
          <ul className="mt-2 space-y-0.5 opacity-80">
            {health.sources.map((item) => <li key={item.source}>{sourceLabel[item.source]}：数据至 {fmtTime(item.dataAsOf)}{item.note ? ` · ${item.note}` : ""}</li>)}
          </ul>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}

// 不新鲜时整页顶部黄/红条（PRD 2.3.1）；新鲜或未知时不占空间。
export function DataHealthBar() {
  const health = useSystemHealth()
  if (health.state !== "backfilling" && health.state !== "stale") return null
  const stale = health.state === "stale"
  return (
    <div role="alert" className={cn("flex items-center gap-2 border-b px-4 py-2 text-sm lg:px-6", stale ? "bg-status-critical/10 text-status-critical" : "bg-status-warning/10 text-status-warning")}>
      <IconAlertTriangle className="size-4 shrink-0" />
      <span>{stale ? "今日数据未更新，当前展示为昨日数据；执行入口已置灰。" : `数据截至 ${fmtTime(health.dataAsOf)}，正在补拉（${health.detail}）；执行入口暂时置灰。`}</span>
    </div>
  )
}
