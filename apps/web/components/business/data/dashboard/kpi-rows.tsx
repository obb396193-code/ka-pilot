"use client"

import { IconArrowDownRight, IconArrowUpRight, IconMinus } from "@tabler/icons-react"

import { Card } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { biCostText, mv, rv } from "@/lib/fixtures/contract"
import type { DashboardSummaryRow } from "@/lib/fixtures/dashboard"
import type { RatioValue } from "@/lib/fixtures/contract"
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

/**
 * 环比角标。数据来自**后端算好的** `compare.deltas`（RatioValue）——
 * 前端不自己相减：窗口口径、缺数怎么处理、除零怎么办全在后端，自己算必然和日报/结算对不上。
 * 后端没给（或 state 不是 finite）就显「环比 −」，不显 0%——「没数」和「没变化」是两件事。
 */
function Delta({ delta, goodWhenDown }: { delta?: RatioValue; goodWhenDown?: boolean }) {
  const rate = delta && delta.state === "finite" ? delta.value : null
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

function Kpi({ label, value, delta, hint, tone }: { label: string; value: string; delta?: React.ReactNode; hint?: string; tone?: "critical" | "warning" | "success" }) {
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
        <span className={cn("text-xl font-semibold tabular-nums", tone === "critical" && "text-status-critical", tone === "warning" && "text-status-warning", tone === "success" && "text-status-success")}>{value}</span>
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
  const assess = row.assessment
  const deltas = row.compare?.deltas
  // 窗口是用户临时选的时候，后端那份 compare 对不上这个区间——**宁可不显，也不拿别的窗口的环比冒充**
  const showDelta = !scoped

  return (
    <div className="flex flex-col gap-3">
      <section aria-label="账面口径">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          账面口径 · 平台侧扣费与转化
          {scoped ? <span className="ml-1 font-normal">（本窗口 {scoped.days} 天；换窗口后暂不显环比，接后端重查后恢复）</span> : null}
        </p>
        {/* 四列的门槛放到 @4xl（56rem）：1280 屏 + 侧栏展开时，main 容器只有 ~976px，
            卡在 @5xl（64rem）门槛下面，于是最常见的桌面尺寸反而只有两列（审查员 C 点名）。 */}
        <div className="grid gap-2 @2xl/main:grid-cols-2 @4xl/main:grid-cols-4">
          <Kpi label="账面花费" value={scoped ? money0(scoped.cost) : mv(now.cost, "money0")} delta={showDelta ? <Delta delta={deltas?.cost} /> : undefined} />
          {/* ★激励花费读 `incentiveCost`，不是 costSpace——costSpace 是「离考核线还剩多少」，两者含义无关。
              ka-data 源恒 missing（不是 0），所以那边显「−」是对的，别补 0（v1.9.32） */}
          <Kpi
            label="激励花费"
            value={mv(now.incentiveCost, "money0")}
            hint="账面花费里由平台激励承担的部分；不进结算。团队（ka-data）源不提供这个数。"
          />
          <Kpi label="转化数" value={scoped ? int(scoped.conversion) : mv(now.conversion)} delta={showDelta ? <Delta delta={deltas?.realConversion} /> : undefined} />
          <Kpi label="转化成本" value={scoped ? money2(scoped.realCpa) : rv(now.ratios.realCpa, "money")} hint="账面花费 / 真实转化数。" delta={showDelta ? <Delta delta={deltas?.cashCpa} goodWhenDown /> : undefined} />
        </div>
      </section>

      <section aria-label="考核口径">
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">考核口径 · 结算认的数</p>
        <div className="grid gap-2 @2xl/main:grid-cols-2 @4xl/main:grid-cols-4">
          <Kpi label="现金花费" value={scoped ? money0(scoped.cashCost) : mv(now.cashCost, "money0")} hint="扣掉激励后自己真花的钱，结算按它算。" delta={showDelta ? <Delta delta={deltas?.cashCost} /> : undefined} />
          <Kpi
            label="考核 BI 数"
            value={mv(assess.biConv)}
            // 回传 GAP：平台转化和 BI 认可之间差了多少，优化师最关心这个缺口
            hint={`回传给 BI 并被认可的转化数。与平台转化数的缺口（回传 GAP）：${rv(now.ratios.gap)}。`}
          />
          <Kpi
            label="BI 现金成本"
            value={biCostText(assess.biCashCost, assess.biConv)}
            hint="现金花费 / 考核 BI 数。考核看的就是这个成本；花了钱但一个 BI 都没回传时显「∞ · 无 BI 回传」。"
            tone={assess.costStatus === "red" ? "critical" : assess.costStatus === "yellow" ? "warning" : undefined}
          />
          <Kpi
            label="超成本金额"
            value={mv(assess.overCost, "money0")}
            hint="现金花费 − Σ（当日考核 BI 数 × 当日生效考核价）。正数 = 超出考核价；负数 = 还有余量。"
            // 负数是「还有余量」，是好事——不能和超成本一样标红
            tone={(assess.overCost?.value ?? 0) > 0 ? "critical" : (assess.overCost?.value ?? 0) < 0 ? "success" : undefined}
          />
        </div>
      </section>
    </div>
  )
}
