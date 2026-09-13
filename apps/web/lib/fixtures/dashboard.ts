import summary from "@/lib/data/fixtures/v1922/summary.json"
import optimizerDim from "@/lib/data/fixtures/v1922/dimension-optimizer.json"
import bizDim from "@/lib/data/fixtures/v1922/dimension-biz.json"
import resourceDim from "@/lib/data/fixtures/v1922/dimension-resource-position.json"
import drill from "@/lib/data/fixtures/v1922/drill.json"
import { z } from "zod"

import { accountSummaryRowSchema, dimensionWindowRowSchema } from "@/lib/data/canonical-query-rows"
import type { Fixture, MetricValue, RatioValue } from "@/lib/fixtures/contract"

// F8-19 数据看板（契约 v1.9.22 / v1.9.23）。
// ★这四份是**过渡 fixture**（自写，放 apps/web 本地不进契约包，免得撞 Codex 的严格契约测试）；
//   Codex P-210 落地 `data-query/summary-v1922.json` 等之后，这里改成 import 契约包并删本地文件。

export type DashboardAssessment = {
  /**
   * ★这三个是 v1.9.22 **新增**，只有 summary 和新维度（optimizer/resource_position）带；
   * 契约里已有的 biz/task 维度 fixture 里**没有**。所以是可选——
   * 写成必填再靠 `as unknown as` 转过去，就是把「字段不存在」藏进类型里，运行时照崩。
   */
  biConv?: MetricValue
  /** 现金花费 / 考核 BI 数。v1.9.32 起是 RatioValue（`infinite` = 零 BI 回传）；
   *  be2 Q-041 ③ 切换前后端还发 MetricValue 形，两形都收，读它一律走 `normalizeBiCost`/`biCostText`。 */
  biCashCost?: MetricValue | RatioValue
  /** 现金花费 − Σ日(考核BI数 × 当日生效考核价)；正 = 超成本 */
  overCost?: MetricValue
  /** 两种形状并存（summary 是 MetricValue，维度行是 {value,effectiveDate}）；钻取表不读它，放宽即可 */
  price?: unknown
  priceSource?: string | null
  onTarget: boolean | null
  costStatus: "green" | "yellow" | "red" | null
  costStatusReason: string | null
  budgetUsageRate?: RatioValue
}

export type DashboardMetrics = {
  cost: MetricValue; cashCost: MetricValue; exposure: MetricValue; click: MetricValue
  conversion: MetricValue; realConversion: MetricValue; costSpace: MetricValue
  /** v1.9.27：账面里由平台激励承担的部分。**不是 costSpace**（那是「离考核线还剩多少」）。后端未给时缺席 */
  incentiveCost?: MetricValue
  wakeUv: MetricValue; potentialUv: MetricValue
  ratios: { ctr: RatioValue; cvr: RatioValue; realCpa: RatioValue; cashCpa: RatioValue; gap: RatioValue; potentialRate: RatioValue; biConversionRate: RatioValue }
}

export type DashboardRow = { key: string; label: string; metrics: DashboardMetrics; assessment: DashboardAssessment; anomaly: unknown }

export type DashboardSummaryRow = {
  rowCount: number; accountCount: number; anomalyRows: number
  metrics: DashboardMetrics
  /** summary 一定带 v1.9.27 三项（后端保证），所以这里收紧成必填 */
  assessment: DashboardAssessment & { biConv: MetricValue; biCashCost: MetricValue | RatioValue; overCost: MetricValue }
  /**
   * 环比：**后端算好的比率**（`compare.deltas`，RatioValue）。
   * ★不再自造 `previous` + 前端相减：窗口口径、缺数怎么算、除零怎么办全在后端，
   *   前端自己算必然和日报/结算对不上。后端没给 compare 就不显环比。
   */
  /** `realCpa` 是 F8-26 ③ 要的：转化成本卡的环比。be2 还没发，所以是可选——没有就不显环比，
   *  不拿 cashCpa 的顶上（数和环比不同口径 = 假话）。 */
  compare?: { mode: "dod" | "wow" | "prev_window"; deltas: Partial<Record<"cost" | "cashCost" | "realConversion" | "cashCpa" | "realCpa" | "onTargetRate", RatioValue>> }
}


/**
 * ★这四份过渡 fixture 走**真校验**再进代码，不用 `as unknown as` 蒙混。
 * 断言不校验任何东西——之前正是它压着十几处不合 schema 的字段，等真接口一上就是又一次崩。
 * 校验失败时**不抛**（一份坏 fixture 不该让整页白屏），退成「没有数据」，
 * 同时把原因打到控制台；CI 侧由 `lib/data/dashboard-fixtures.test.ts` 硬挡。
 */
function checked<T>(payload: unknown, rows: z.ZodTypeAny, label: string): Fixture<T> | { ok: false; error: { code: string; message: string; retryable: boolean; requestId: string } } {
  const envelope = payload as { ok?: boolean; data?: { source?: { rows?: unknown[] } } }
  const list = envelope?.data?.source?.rows
  if (envelope?.ok === true && Array.isArray(list)) {
    const parsed = z.array(rows).safeParse(list)
    if (parsed.success) return payload as Fixture<T>
    console.error(`[dashboard fixture] ${label} 不合 schema：`, parsed.error.issues.slice(0, 3))
  }
  return { ok: false, error: { code: "UPSTREAM_INVALID_RESPONSE", message: `${label} 过渡 fixture 不合契约`, retryable: false, requestId: `fixture-${label}` } }
}

export const dashboardSummaryFixture = checked<{ mode: string; source: { rows: DashboardSummaryRow[]; lineage: unknown } }>(summary, accountSummaryRowSchema, "summary")
export const optimizerDimensionFixture = checked<{ mode: string; source: { rows: DashboardRow[]; dimension: string; lineage: unknown } }>(optimizerDim, dimensionWindowRowSchema, "dimension-optimizer")
export const bizDimensionFixture = checked<{ mode: string; source: { rows: DashboardRow[]; dimension: string; lineage: unknown } }>(bizDim, dimensionWindowRowSchema, "dimension-biz")
export const resourcePositionFixture = checked<{ mode: string; source: { rows: DashboardRow[]; dimension: string; lineage: unknown } }>(resourceDim, dimensionWindowRowSchema, "dimension-resource-position")
export const drillFixture = drill as unknown as Fixture<{ byParent: Record<string, DashboardRow[]> }>

// 这两个算术搬到了 `lib/data/dashboard-math.ts`——测试 glob 只跑 `lib/data/*.test.ts`，
// 放在这个目录下的测试根本不会执行（审查员 D 点名）。这里只做转发，调用方不用改。
export { allocateBi, aggregateDays } from "@/lib/data/dashboard-math"
