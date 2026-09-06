"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { rv } from "@/lib/fixtures/contract"
import { readinessKeys, type Readiness } from "@/lib/fixtures/tasks"
import { cn } from "@/lib/utils"

// 就绪度六段（账户 / 充值 / 商品 / 素材 / 策略 / 基建）：小进度条，缺项 hover 看；ratio 来自 DTO
export function ReadinessBar({ readiness, size = "sm" }: { readiness: Readiness; size?: "sm" | "lg" }) {
  return (
    <div className={cn("flex items-center gap-1", size === "lg" && "gap-1.5")}>
      {readinessKeys.map(({ key, label }) => {
        const item = readiness[key]
        const ratio = item?.ratio.state === "finite" && item.ratio.value !== null ? item.ratio.value : null
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <span className={cn("flex flex-col items-center gap-0.5", size === "lg" ? "w-11" : "w-6")}>
                <span className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", size === "lg" && "h-2")}>
                  <span className={cn("block h-full rounded-full", item?.ready ? "bg-status-success" : ratio === null ? "bg-border" : "bg-status-warning")} style={{ width: `${ratio === null ? 0 : Math.round(ratio * 100)}%` }} />
                </span>
                {size === "lg" ? <span className="text-[10px] text-muted-foreground">{label}</span> : null}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64">
              <p className="font-medium">{label} {ratio === null ? "−" : rv(item.ratio)}{item?.ready ? " · 就绪" : ""}{item?.source === "manual" ? " · 人工勾" : ""}</p>
              {item?.missing.length ? <p className="mt-1 opacity-80">缺：{item.missing.join("；")}</p> : null}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

/** 就绪度环（详情总览）：overall + 六项 */
export function ReadinessRing({ readiness }: { readiness: Readiness }) {
  const overall = readiness.overall?.state === "finite" && readiness.overall.value !== null ? readiness.overall.value : null
  const deg = overall === null ? 0 : Math.round(overall * 360)
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-24 shrink-0 rounded-full" style={{ background: `conic-gradient(var(--foreground) ${deg}deg, var(--muted) ${deg}deg)` }}>
        <div className="absolute inset-2 flex items-center justify-center rounded-full bg-card text-lg font-semibold tabular-nums">{overall === null ? "−" : rv(readiness.overall)}</div>
      </div>
      <ReadinessBar readiness={readiness} size="lg" />
    </div>
  )
}
