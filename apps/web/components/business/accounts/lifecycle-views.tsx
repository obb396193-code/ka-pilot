"use client"

import Link from "next/link"
import { IconArrowUpRight, IconChevronRight } from "@tabler/icons-react"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { lifecycleStages, type AccountLifecycle, type LifecycleStage } from "@/lib/data/account-lifecycle"
import type { AnalysisRow } from "@/lib/data/contracts"
import { cn } from "@/lib/utils"
import { accountPageHref } from "./account-peek"
import { accountStatus, mediaLabel } from "./account-status"

// 账户池「全户分层」的四种表达（老板 09-05：换点别的表达方式挑）：
//   tiles = 分层卡（一档一张卡，点即筛）· pipeline = 流程条（八档按生命周期顺序串起来，宽度随户数）· kanban = 看板（一档一列，账户是卡）
//   老板 09-05：三种都留、用户自己切；「产品名 × 阶段」矩阵不要
// 户数都是当前范围内按阶段计数，阶段本身由后端判定（契约 F-006-Q4），前端不推。
export type LifecycleView = "tiles" | "pipeline" | "kanban"
export const lifecycleViews: { value: LifecycleView; label: string; hint: string }[] = [
  { value: "tiles", label: "分层卡", hint: "一档一张卡，带户数，点即筛" },
  { value: "pipeline", label: "流程条", hint: "按生命周期顺序串成一条，宽度随户数" },
  { value: "kanban", label: "看板", hint: "一档一列，账户是卡片" },
]

export type StageFilter = "all" | LifecycleStage
export type LifecycleMap = Map<string, AccountLifecycle | null>
export const rowId = (row: AnalysisRow) => `${row.media}:${row.accountId}`
export const UNASSIGNED = "未填产品名"

type SummaryProps = { counts: Record<LifecycleStage, number>; total: number; value: StageFilter; onChange: (value: StageFilter) => void; available: boolean }

function Unavailable() {
  return <p className="text-xs text-muted-foreground">生命周期阶段 / 产品名字段尚未从后端返回（契约缺口 F-006-Q4），分层先显 −，不用猜的数。</p>
}

/** 1 · 分层卡：左边「全部账户」一张深色锚点卡，右边八档（中屏 4×2，宽屏一排 8），每卡底部一条按户数占比的细线 */
export function LifecycleTiles({ counts, total, value, onChange, available }: SummaryProps) {
  const allActive = value === "all"
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 @3xl/main:grid-cols-[minmax(150px,180px)_1fr]" role="tablist" aria-label="生命周期">
        <button type="button" role="tab" aria-selected={allActive} title="当前空间可见的全量账户" onClick={() => onChange("all")}
          className={cn("flex flex-col justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", allActive ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted/50")}>
          <span className={cn("text-xs", allActive ? "text-background/70" : "text-muted-foreground")}>全部账户</span>
          <span className="text-3xl font-semibold tabular-nums tracking-tight">{total}</span>
        </button>
        <div className="grid grid-cols-2 gap-2 @xl/main:grid-cols-4 @6xl/main:grid-cols-8">
          {lifecycleStages.map((stage) => {
            const count = available ? counts[stage.value] : null
            const active = value === stage.value
            const share = count === null || total === 0 ? 0 : count / total
            return (
              <button key={stage.value} type="button" role="tab" aria-selected={active} title={stage.hint} onClick={() => onChange(stage.value)}
                className={cn("group flex flex-col gap-2 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", active && "border-foreground ring-1 ring-foreground")}>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-1.5 rounded-full", stage.dot)} />{stage.label}</span>
                <span className={cn("text-2xl font-semibold tabular-nums tracking-tight", count === null && "text-muted-foreground")}>{count === null ? "−" : count}</span>
                <span className="h-0.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className={cn("block h-full rounded-full transition-[width] duration-500", stage.dot)} style={{ width: `${Math.max(share > 0 ? 6 : 0, share * 100)}%` }} />
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {available ? null : <Unavailable />}
    </div>
  )
}

/** 2 · 流程条：八档按顺序串起来，段宽随户数（最小宽保证能读），下面一条分布细条 */
export function LifecyclePipeline({ counts, total, value, onChange, available }: SummaryProps) {
  const max = Math.max(1, ...lifecycleStages.map((stage) => counts[stage.value]))
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onChange("all")} className={cn("rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted", value === "all" ? "font-medium text-foreground" : "text-muted-foreground")}>
          全部账户 <span className="font-semibold tabular-nums">{total}</span>
        </button>
        <span className="text-xs text-muted-foreground">开户 → 关户，从左到右</span>
      </div>
      <div className="flex items-stretch gap-1 overflow-x-auto">
        {lifecycleStages.map((stage, index) => {
          const count = available ? counts[stage.value] : null
          const active = value === stage.value
          const grow = count === null ? 1 : 1 + (count / max) * 3
          return (
            <div key={stage.value} className="flex min-w-0 items-stretch" style={{ flexGrow: grow, flexBasis: 0 }}>
              <button type="button" onClick={() => onChange(stage.value)} title={stage.hint}
                className={cn("flex min-w-[88px] flex-1 flex-col gap-1 rounded-lg border-t-2 bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50", active ? "ring-1 ring-foreground" : "border-border")}
                style={{ borderTopColor: active ? "currentColor" : undefined }}>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-1.5 rounded-full", stage.dot)} />{stage.label}</span>
                <span className={cn("text-lg font-semibold tabular-nums tracking-tight", count === null && "text-muted-foreground")}>{count === null ? "−" : count}</span>
              </button>
              {index < lifecycleStages.length - 1 ? <IconChevronRight className="my-auto size-3.5 shrink-0 text-muted-foreground/50" /> : null}
            </div>
          )
        })}
      </div>
      {available ? (
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          {lifecycleStages.map((stage) => counts[stage.value] > 0 ? <span key={stage.value} className={cn("h-full", stage.dot)} style={{ width: `${(counts[stage.value] / Math.max(1, total)) * 100}%` }} title={`${stage.label} ${counts[stage.value]}`} /> : null)}
        </div>
      ) : <Unavailable />}
    </div>
  )
}

/** 3 · 看板：一档一列，账户是卡（替代表格的整体表达） */
export function LifecycleKanban({ rows, lifecycle, available }: { rows: AnalysisRow[]; lifecycle: LifecycleMap; available: boolean }) {
  if (!available) return <div className="rounded-xl border border-dashed p-10 text-center"><Unavailable /></div>
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {lifecycleStages.map((stage) => {
        const items = rows.filter((row) => lifecycle.get(rowId(row))?.stage === stage.value)
        return (
          <section key={stage.value} className="flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-muted/50 p-2" aria-label={stage.label}>
            <header className="flex items-center justify-between px-1.5 pt-1">
              <span className="flex items-center gap-1.5 text-sm font-medium"><span className={cn("size-1.5 rounded-full", stage.dot)} />{stage.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
            </header>
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
              {items.length ? items.map((row) => {
                const chip = accountStatus[row.status]
                const item = lifecycle.get(rowId(row))
                return (
                  <article key={rowId(row)} className="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium leading-5">{row.accountName}</div>
                      <Button asChild variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground"><Link href={accountPageHref(row)} title="打开完整账户页"><IconArrowUpRight className="size-3.5" /></Link></Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TypeChip>{mediaLabel(row.media)}</TypeChip>
                      {item?.productName ? <TypeChip>{item.productName}</TypeChip> : null}
                      <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="tabular-nums">消耗 {row.platform.spend.availability === "available" ? row.platform.spend.displayValue : "−"}</span>
                      <span>{row.owner || "待分配"}</span>
                    </div>
                  </article>
                )
              }) : <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">没有账户</p>}
            </div>
          </section>
        )
      })}
    </div>
  )
}
