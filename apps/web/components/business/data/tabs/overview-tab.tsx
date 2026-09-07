"use client"

import { useMemo, useState } from "react"

import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { SpendRealCpaTrend } from "@/components/charts/spend-real-cpa-trend"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DisplayMetric } from "@/lib/data/contracts"
import { costStatusLabel, isOk, mv, rv } from "@/lib/fixtures/contract"
import { summaryFixtures, trendFixture, windowLabel, type SummaryVariant } from "@/lib/fixtures/data-analysis"
import { cn } from "@/lib/utils"
import { CostStatusDot, LineageFooter, metricFormulas } from "./shared"

// 大盘：六卡（account.summary/v3，三色只从 assessment.costStatus 拿）+ 消耗与现金 CPA 趋势（account.trend/v3）
const variants: { value: SummaryVariant; label: string }[] = [
  { value: "green", label: "样例 · 绿（累计达标）" },
  { value: "yellow", label: "样例 · 黄（单日超线）" },
  { value: "cash-missing", label: "样例 · 现金缺（团队源）" },
]
const reasonLabel: Record<string, string> = { window_ok: "窗口累计达标", day_over_window_ok: "单日超线，累计仍达标", window_over: "窗口累计超线", cash_missing: "现金消耗缺失，无法判定", assessment_missing: "考核价缺失，无法判定" }
const tone = (status: "green" | "yellow" | "red" | null): DisplayMetric["tone"] => status === "green" ? "positive" : status === "yellow" ? "warning" : status === "red" ? "critical" : "neutral"

export function OverviewTab({ colorKey }: { colorKey?: string }) {
  const [variant, setVariant] = useState<SummaryVariant>("green")
  const fixture = summaryFixtures[variant]
  const trend = trendFixture
  const row = isOk(fixture) ? fixture.data.source.rows[0] : null
  const trendRows = isOk(trend) ? trend.data.source.rows : []

  const metrics = useMemo<DisplayMetric[]>(() => {
    if (!row) return []
    const a = row.assessment
    const price = a.price ? `考核 ¥${a.price.value.toFixed(2)}` : null
    return [
      { key: "cost", label: "账面消耗", value: mv(row.metrics.cost, "money0"), delta: null, tone: "neutral" },
      { key: "cashCost", label: "现金消耗", value: mv(row.metrics.cashCost, "money0"), delta: null, tone: "neutral" },
      { key: "cashCpa", label: "现金 CPA", value: rv(row.metrics.ratios.cashCpa, "money"), delta: price, tone: tone(a.costStatus) },
      { key: "onTarget", label: "达标", value: a.onTarget === null ? "−" : a.onTarget ? "达标" : "超线", delta: a.costStatus ? costStatusLabel[a.costStatus] : null, tone: tone(a.costStatus) },
      { key: "costSpace", label: "成本空间", value: mv(row.metrics.costSpace, "money0"), delta: null, tone: "neutral" },
      { key: "realConversion", label: "BI 量级", value: mv(row.metrics.realConversion), delta: null, tone: "neutral" },
    ]
  }, [row])
  const sparklines = useMemo(() => ({
    cost: trendRows.map((item) => item.metrics.cost.availability === "available" ? item.metrics.cost.value : null),
    cashCost: trendRows.map((item) => item.metrics.cashCost.availability === "available" ? item.metrics.cashCost.value : null),
    cashCpa: trendRows.map((item) => item.metrics.ratios.cashCpa.state === "finite" ? item.metrics.ratios.cashCpa.value : null),
  }), [trendRows])
  const chartData = useMemo(() => trendRows.map((item) => ({ label: item.ds.slice(5), spend: item.metrics.cost.availability === "available" ? item.metrics.cost.value : null, realCpa: item.metrics.ratios.cashCpa.state === "finite" ? item.metrics.ratios.cashCpa.value : null })), [trendRows])

  if (!row || !isOk(fixture)) return null
  const lineage = fixture.data.source.lineage
  const status = row.assessment.costStatus

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <CostStatusDot status={status} />
          <span className="font-medium">{windowLabel(lineage.window?.preset)}</span>
          <span className="text-muted-foreground">{lineage.window?.from} ～ {lineage.window?.to}</span>
          <Badge variant="outline" className={cn(status === "red" && "text-status-critical", status === "yellow" && "text-status-warning", status === "green" && "text-status-success")}>{reasonLabel[row.assessment.costStatusReason] ?? row.assessment.costStatusReason}</Badge>
          <Tooltip>
            <TooltipTrigger asChild><span className="cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-4">口径</span></TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-80">{metricFormulas.cashCpa}；颜色按窗口累计判，不按单日（容忍带在个人视图设，默认 0）。</TooltipContent>
          </Tooltip>
        </div>
        <Select value={variant} onValueChange={(value) => setVariant(value as SummaryVariant)}>
          <SelectTrigger size="sm" className="w-56" aria-label="样例"><SelectValue /></SelectTrigger>
          <SelectContent align="end">{variants.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {fixture.data.source.warnings.length ? <div role="alert" className="rounded-lg border border-status-warning/30 bg-status-warning/10 px-4 py-2 text-sm text-status-warning">{fixture.data.source.warnings.join("；")}</div> : null}
      <KpiCards metrics={metrics} sparklines={sparklines} className="px-0 lg:px-0" />
      <Card>
        <CardHeader>
          <CardTitle>消耗与现金 CPA</CardTitle>
          <CardDescription>{windowLabel(lineage.window?.preset)} · 左轴账面消耗、右轴现金 CPA · 缺失日留空，不补 0</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length ? <SpendRealCpaTrend data={chartData} colorKey={`${colorKey}-${variant}`} labels={{ spend: "账面消耗", cpa: "现金 CPA" }} /> : <p className="text-sm text-muted-foreground">后端未返回趋势</p>}
        </CardContent>
      </Card>
      <LineageFooter lineage={lineage} extra={<span>账户 {row.accountCount} · 异常行 {row.anomalyRows}</span>} />
    </div>
  )
}
