"use client"

import { IconAlertTriangle } from "@tabler/icons-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type SystemHealthState = "fresh" | "backfilling" | "stale" | "unknown"
export type SystemHealth = { state: SystemHealthState; dataAsOf: string | null; detail: string }

// 契约缺口：`GET /system/health` 尚无 BFF 同源路径（R-010）。mock 用与 mock-data 同一 AS_OF 的 fixture；
// 真实模式在路径冻结前不猜测时效，显示「待接入」。
const MOCK_AS_OF = "2026-08-24T09:30:00+08:00"

export function useSystemHealth(): SystemHealth {
  const isMock = process.env.NEXT_PUBLIC_KA_DATA_PROVIDER === "mock"
  if (isMock) return { state: "fresh", dataAsOf: MOCK_AS_OF, detail: "脱敏 Mock：最近一次全量同步已完成，执行入口可用。" }
  return { state: "unknown", dataAsOf: null, detail: "数据时效服务接入后，这里显示最近同步时间与是否允许执行。" }
}

function hhmm(value: string | null) {
  if (!value) return "--:--"
  const time = value.split("T")[1]
  return time ? time.slice(0, 5) : "--:--"
}

const presentation: Record<SystemHealthState, { dot: string; label: (asOf: string) => string }> = {
  fresh: { dot: "bg-status-success", label: (asOf) => `数据截至 ${asOf} ✓` },
  backfilling: { dot: "bg-status-warning", label: (asOf) => `补拉中 · 截至 ${asOf}` },
  stale: { dot: "bg-status-critical", label: () => "今日数据未更新 · 展示为昨日" },
  unknown: { dot: "bg-muted-foreground/40", label: () => "数据时效待接入" },
}

export function DataHealthPill() {
  const health = useSystemHealth()
  const view = presentation[health.state]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`数据健康：${view.label(hhmm(health.dataAsOf))}`}
          className="inline-flex h-8 items-center gap-2 rounded-md border border-transparent px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className={cn("size-2 rounded-full", view.dot)} aria-hidden />
          <span className="hidden sm:inline">{view.label(hhmm(health.dataAsOf))}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">{health.detail}</TooltipContent>
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
      <span>{stale ? "今日数据未更新，当前展示为昨日数据；执行入口已置灰。" : `数据截至 ${hhmm(health.dataAsOf)}，正在补拉；执行入口暂时置灰。`}</span>
    </div>
  )
}
