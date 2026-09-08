"use client"

import type { ReactNode } from "react"

import { StatusChip } from "@/components/business/data-grid/data-grid"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { costStatusDot, costStatusLabel, mv, rv, type CostStatus } from "@/lib/fixtures/contract"
import type { AssessmentV3, Lineage, MetricsV3 } from "@/lib/fixtures/data-analysis"
import { windowLabel } from "@/lib/fixtures/data-analysis"
import { cn } from "@/lib/utils"

// 数据分析各 tab 共用的小件：达标 chip（三色只从 DTO 拿）、口径徽章、血缘页脚、账面/现金列组表头
export function OnTargetChip({ assessment }: { assessment: AssessmentV3 }) {
  if (assessment.onTarget === null || !assessment.costStatus) return <StatusChip tone="muted">不可判断</StatusChip>
  const tone = assessment.costStatus === "green" ? "success" : assessment.costStatus === "yellow" ? "warning" : "critical"
  return <StatusChip tone={tone}>{assessment.onTarget ? (assessment.costStatus === "yellow" ? "累计达标" : "达标") : "超线"}</StatusChip>
}

export function CostStatusDot({ status, className }: { status: CostStatus; className?: string }) {
  if (!status) return <span className={cn("inline-block size-2 rounded-full border border-muted-foreground/50", className)} title="不可判断" />
  return <span className={cn("inline-block size-2 rounded-full", costStatusDot[status], className)} title={costStatusLabel[status]} />
}

/** 列组表头：账面 / 现金 两组并排不混用 */
export function GroupHeader({ group, children }: { group: "账面" | "现金" | "漏斗"; children: ReactNode }) {
  const tone = group === "现金" ? "text-foreground" : "text-muted-foreground"
  return <span className="inline-flex items-center gap-1"><span className={cn("text-[10px] font-normal", tone)}>{group}</span>{children}</span>
}

export function LineageFooter({ lineage, extra }: { lineage: Lineage; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>来源 {lineage.source === "ka_data" ? "KA Data（团队源）" : "启航（本人授权账户）"}</span>
      {lineage.window ? <span>窗口 {windowLabel(lineage.window.preset)} {lineage.window.from} ～ {lineage.window.to}</span> : null}
      {lineage.metricVersion ? <span>口径 {lineage.metricVersion}</span> : null}
      {lineage.coverage && !lineage.coverage.complete ? <Badge variant="outline" className="text-status-warning">覆盖不完整</Badge> : null}
      {lineage.truncated ? <Badge variant="outline" className="text-status-warning">已截断</Badge> : null}
      {extra}
    </div>
  )
}

export function MetricDefinitionHint({ label, formula }: { label: string; formula: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted underline-offset-4">{label}</span></TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-72">{formula}</TooltipContent>
    </Tooltip>
  )
}

/** 常用指标单元格（右对齐等宽数字） */
export const cell = {
  money: (value: MetricsV3["cost"]) => <span className="tabular-nums">{mv(value, "money0")}</span>,
  money2: (value: MetricsV3["cost"]) => <span className="tabular-nums">{mv(value, "money")}</span>,
  int: (value: MetricsV3["cost"]) => <span className="tabular-nums">{mv(value, "int")}</span>,
  ratioMoney: (value: MetricsV3["ratios"]["cashCpa"]) => <span className="tabular-nums">{rv(value, "money")}</span>,
  percent: (value: MetricsV3["ratios"]["ctr"]) => <span className="tabular-nums">{rv(value, "percent")}</span>,
}

export const metricFormulas = {
  cashCpa: "现金 CPA = Σ现金消耗 / Σ真实转化（考核用，先聚合再相除）",
  realCpa: "账面 CPA = Σ账面消耗 / Σ真实转化（只展示，不用于考核）",
  cashCost: "现金消耗 = (账面消耗 − 赔付) ⊕ 渠道系数（按渠道 + 生效日期版本化）",
  costSpace: "成本空间 = Σ考核价 × 真实转化 − Σ现金消耗（>0 = 窗口内还没超线的钱）",
  gap: "差异 = 回传转化 / 真实转化 − 1（媒体回传比 BI 真实多出的比例）",
  ctr: "CTR = 点击 / 曝光",
  cvr: "CVR = 回传转化 / 点击",
  budgetUsage: "预算使用率 = 当日消耗 / 当日生效日预算卡；无卡显 −",
}
