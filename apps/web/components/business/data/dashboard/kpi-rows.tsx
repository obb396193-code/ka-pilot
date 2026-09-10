"use client"

import { IconArrowDownRight, IconArrowUpRight, IconMinus } from "@tabler/icons-react"

import { Card } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { mv, rv } from "@/lib/fixtures/contract"
import { deltaRate, type DashboardSummaryRow } from "@/lib/fixtures/dashboard"
import { cn } from "@/lib/utils"

// F8-19 两行 KPI：第一行**账面**口径、第二行**考核**口径。
// 两行分开不混，是因为这两套数在业务上不是一回事——账面是平台扣的，考核是结算认的；
// 混在一排会让人拿账面成本去对考核指标。

const percent = new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" })
const cny0 = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 })
const cny2 = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 2 })
const num = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 })
// 窗口内有一天缺数，合出来就是 null——显「−」而不是把缺的当 0 加进去
const money0 = (value: number | null) => (value === null ? "−" : cny0.format(value))
const money2 = (value: number | null) => (value === null ? "−" : cny2.format(value))
const int = (value: number | null) => (value === null ? "−" : num.format(value))

/** 环比角标。缺任一边显「环比 −」，不显 0%——「没数」和「没变化」是两件事 */
function Delta({ rate, goodWhenDown }: { rate: number | null; goodWhenDown?: boolean }) {
  if (rate === null) return <span className="text-xs text-muted-foreground">环比 −</span>
  const up = rate > 0
  const good = goodWhenDown ? !up : up
  const Icon = rate === 0 ? IconMinus : up ? IconArrowUpRight : IconArrowDownRight
  return (
    <span className={cn("flex items-center gap-0.5 text-xs tabular-nums", rate === 0 ? "text-muted-foreground" : good ? "text-status-success" : "text-status-critical")}>
      <Icon className="size-3" />{percent.format(rate)}
    </span>
  )
}

function Kpi({ label, value, delta, hint, tone }: { label: string; value: string; delta?: React.ReactNode; hint?: string; tone?: "critical" | "warning" }) {
  return (
    <Card className="gap-0 p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild><span className="cursor-help border-b border-dotted border-muted-foreground/50">{label}</span></TooltipTrigger>
            <TooltipContent className="max-w-64">{hint}</TooltipContent>
          </Tooltip>
        ) : label}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className={cn("text-xl font-semibold tabular-nums", tone === "critical" && "text-status-critical", tone === "warning" && "text-status-warning")}>{value}</span>
        {delta}
      </div>
    </Card>
  )
}

export function KpiRows({ row, windowed }: {
  row: DashboardSummaryRow
  /** 用户选的窗口内按天重算的结果；给了就以它为准，没给（窗口内没有天）用后端那份 */
  windowed?: { days: number; cost: number | null; cashCost: number | null; conversion: number | null; realCpa: number | null } | null
}) {
  const scoped = windowed ?? null
  const now = row.metrics
  const before = row.previous?.metrics
  const assess = row.assessment
  const beforeAssess = row.previous?.assessment

  return (
    <div className="flex flex-col gap-3">
      <section aria-label="账面口径">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          账面口径 · 平台侧扣费与转化
          {/* 环比只有在用后端那份 summary 时才成立：窗口是用户临时选的，后端没算对应的上一窗口，
              这时**不显环比**，而不是拿别的窗口的环比冒充 */}
          {scoped ? <span className="ml-1 font-normal">（本窗口 {scoped.days} 天；换窗口后暂不显环比，接后端重查后恢复）</span>
            : row.previous ? <span className="ml-1 font-normal">（环比 {row.previous.window.from} ~ {row.previous.window.to}）</span> : null}
        </p>
        <div className="grid gap-2 @2xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          <Kpi label="账面花费" value={scoped ? money0(scoped.cost) : mv(now.cost, "money0")} delta={scoped ? undefined : <Delta rate={deltaRate(now.cost.value, before?.cost.value)} />} />
          <Kpi label="激励花费" value={mv(now.costSpace, "money0")} hint="账面花费里由平台激励承担的部分；不进结算。" delta={<Delta rate={deltaRate(now.costSpace.value, before?.costSpace.value)} />} />
          <Kpi label="转化数" value={scoped ? int(scoped.conversion) : mv(now.conversion)} delta={scoped ? undefined : <Delta rate={deltaRate(now.conversion.value, before?.conversion.value)} />} />
          <Kpi label="转化成本" value={scoped ? money2(scoped.realCpa) : rv(now.ratios.realCpa, "money")} hint="账面花费 / 真实转化数。" delta={<Delta rate={deltaRate(now.ratios.realCpa.value, before?.ratios.realCpa.value)} goodWhenDown />} />
        </div>
      </section>

      <section aria-label="考核口径">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">考核口径 · 结算认的数</p>
        <div className="grid gap-2 @2xl/main:grid-cols-2 @5xl/main:grid-cols-4">
          <Kpi label="现金花费" value={scoped ? money0(scoped.cashCost) : mv(now.cashCost, "money0")} hint="扣掉激励后自己真花的钱，结算按它算。" delta={<Delta rate={deltaRate(now.cashCost.value, before?.cashCost.value)} />} />
          <Kpi label="考核 BI 数" value={mv(assess.biConv)} hint="回传给 BI 并被认可的转化数；与平台转化数之间的差就是回传 GAP。" delta={<Delta rate={deltaRate(assess.biConv.value, beforeAssess?.biConv.value)} />} />
          <Kpi label="BI 现金成本" value={rv(assess.biCashCost, "money")} hint="现金花费 / 考核 BI 数。考核看的就是这个成本。" tone={assess.costStatus === "red" ? "critical" : assess.costStatus === "yellow" ? "warning" : undefined} delta={<Delta rate={deltaRate(assess.biCashCost.value, beforeAssess?.biCashCost.value)} goodWhenDown />} />
          <Kpi
            label="超成本金额"
            value={mv(assess.overCost, "money0")}
            hint="现金花费 − Σ（当日考核 BI 数 × 当日生效考核价）。正数 = 超出考核价的部分。"
            tone={(assess.overCost.value ?? 0) > 0 ? "critical" : undefined}
            delta={<Delta rate={deltaRate(assess.overCost.value, beforeAssess?.overCost.value)} goodWhenDown />}
          />
        </div>
      </section>
    </div>
  )
}
