"use client"

import Link from "next/link"
import { IconArrowUpRight, IconChevronRight } from "@tabler/icons-react"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { signed } from "@/lib/fixtures/contract"
import { accountHref, lifecycleLabel, poolStatuses, type AccountItem, type PipelineStage, type PoolStatus } from "@/lib/fixtures/accounts"
import { cn } from "@/lib/utils"
import { accountStatusTone } from "./account-status"
import { mediaLabel } from "./account-status"

// 账户池「九态库存流水线」的三种表达（老板 09-05：分层卡 / 流程条 / 看板三种都留、用户自己切；矩阵不要）。
// 户数与昨日增减都来自 GET /accounts/pipeline（fixture），前端不算；count 缺显 −。
export type PoolView = "tiles" | "pipeline" | "kanban"
export const poolViews: { value: PoolView; label: string; hint: string }[] = [
  { value: "tiles", label: "分层卡", hint: "一态一张卡，带户数与昨日增减，点即筛" },
  { value: "pipeline", label: "流程条", hint: "按开户→关户顺序串成一条，宽度随户数" },
  { value: "kanban", label: "看板", hint: "一态一列，账户是卡片" },
]
export type StatusFilter = "all" | PoolStatus
type SummaryProps = { stages: PipelineStage[]; total: number; value: StatusFilter; onChange: (value: StatusFilter) => void; asOf: string }

const ordered = (stages: PipelineStage[]) => poolStatuses.map((meta) => ({ meta, stage: stages.find((item) => item.poolStatus === meta.value) ?? null }))

function Delta({ stage }: { stage: PipelineStage | null }) {
  if (!stage) return null
  const text = signed(stage.deltaVsYesterday)
  const positive = stage.deltaVsYesterday.availability === "available" && (stage.deltaVsYesterday.value ?? 0) > 0
  const negative = stage.deltaVsYesterday.availability === "available" && (stage.deltaVsYesterday.value ?? 0) < 0
  return <span className={cn("text-[11px] tabular-nums", positive && "text-status-success", negative && "text-status-critical", !positive && !negative && "text-muted-foreground")} title="较昨日">{text === "−" ? "昨 −" : `昨 ${text}`}</span>
}

/** 1 · 分层卡：左「全部账户」深色锚点卡，右九态（中屏 3×3，宽屏一排 9），卡底一条占比细线 */
export function PoolTiles({ stages, total, value, onChange }: SummaryProps) {
  const allActive = value === "all"
  return (
    <div className="grid gap-2 @3xl/main:grid-cols-[minmax(150px,180px)_1fr]" role="tablist" aria-label="库存态">
      <button type="button" role="tab" aria-selected={allActive} onClick={() => onChange("all")} className={cn("flex flex-col justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", allActive ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted/50")}>
        <span className={cn("text-xs", allActive ? "text-background/70" : "text-muted-foreground")}>全部账户</span>
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{total}</span>
      </button>
      <div className="grid grid-cols-3 gap-2 @xl/main:grid-cols-5 @6xl/main:grid-cols-9">
        {ordered(stages).map(({ meta, stage }) => {
          const active = value === meta.value
          const count = stage?.count ?? null
          const share = count === null || total === 0 ? 0 : count / total
          return (
            <button key={meta.value} type="button" role="tab" aria-selected={active} title={meta.hint} onClick={() => onChange(meta.value)} className={cn("flex flex-col gap-1.5 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring", active && "border-foreground ring-1 ring-foreground")}>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-1.5 rounded-full", meta.dot)} />{meta.label}</span>
              <span className="flex items-baseline justify-between gap-2"><span className={cn("text-2xl font-semibold tabular-nums tracking-tight", count === null && "text-muted-foreground")}>{count ?? "−"}</span><Delta stage={stage} /></span>
              <span className="h-0.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden><span className={cn("block h-full rounded-full transition-[width] duration-500", meta.dot)} style={{ width: `${Math.max(share > 0 ? 6 : 0, share * 100)}%` }} /></span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 2 · 流程条：九态按顺序串起来，段宽随户数，下面一条分布细条 */
export function PoolPipeline({ stages, total, value, onChange, asOf }: SummaryProps) {
  const max = Math.max(1, ...stages.map((item) => item.count ?? 0))
  const list = ordered(stages)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onChange("all")} className={cn("rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted", value === "all" ? "font-medium text-foreground" : "text-muted-foreground")}>全部账户 <span className="font-semibold tabular-nums">{total}</span></button>
        <span className="text-xs text-muted-foreground">可用 → 已关，从左到右 · 截至 {asOf.slice(5, 16).replace("T", " ")}</span>
      </div>
      <div className="flex items-stretch gap-1 overflow-x-auto">
        {list.map(({ meta, stage }, index) => {
          const count = stage?.count ?? null
          const active = value === meta.value
          const grow = count === null ? 1 : 1 + (count / max) * 3
          return (
            <div key={meta.value} className="flex min-w-0 items-stretch" style={{ flexGrow: grow, flexBasis: 0 }}>
              <button type="button" onClick={() => onChange(meta.value)} title={meta.hint} className={cn("flex min-w-[84px] flex-1 flex-col gap-1 rounded-lg border-t-2 bg-card px-3 py-2 text-left transition-colors hover:bg-muted/50", active ? "ring-1 ring-foreground" : "border-border")}>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn("size-1.5 rounded-full", meta.dot)} />{meta.label}</span>
                <span className="flex items-baseline gap-2"><span className={cn("text-lg font-semibold tabular-nums tracking-tight", count === null && "text-muted-foreground")}>{count ?? "−"}</span><Delta stage={stage} /></span>
              </button>
              {index < list.length - 1 ? <IconChevronRight className="my-auto size-3.5 shrink-0 text-muted-foreground/50" /> : null}
            </div>
          )
        })}
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {list.map(({ meta, stage }) => (stage?.count ?? 0) > 0 ? <span key={meta.value} className={cn("h-full", meta.dot)} style={{ width: `${((stage?.count ?? 0) / Math.max(1, total)) * 100}%` }} title={`${meta.label} ${stage?.count}`} /> : null)}
      </div>
    </div>
  )
}

/** 3 · 看板：一态一列，账户是卡（替代表格） */
export function PoolKanban({ items }: { items: AccountItem[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {poolStatuses.map((meta) => {
        const column = items.filter((item) => item.poolStatus === meta.value)
        return (
          <section key={meta.value} className="flex w-64 shrink-0 flex-col gap-2 rounded-xl bg-muted/50 p-2" aria-label={meta.label}>
            <header className="flex items-center justify-between px-1.5 pt-1">
              <span className="flex items-center gap-1.5 text-sm font-medium"><span className={cn("size-1.5 rounded-full", meta.dot)} />{meta.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{column.length}</span>
            </header>
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
              {column.length ? column.map((item) => {
                const chip = accountStatusTone(item.assessment)
                return (
                  <article key={item.accountId} className="flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium leading-5">{item.accountName}</div>
                      <Button asChild variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground"><Link href={accountHref(item)} title="打开完整账户页"><IconArrowUpRight className="size-3.5" /></Link></Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TypeChip>{mediaLabel(item.media)}</TypeChip>
                      {item.product ? <TypeChip>{item.product.name}</TypeChip> : null}
                      {item.lifecycleStage !== "unknown" ? <TypeChip>{lifecycleLabel[item.lifecycleStage]}</TypeChip> : null}
                      <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{item.linkedTasks[0]?.taskName ?? "未挂任务"}</span><span>{item.owner?.displayName ?? "待分配"}</span></div>
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
