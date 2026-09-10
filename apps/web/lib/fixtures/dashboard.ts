import summary from "@/lib/data/fixtures/v1922/summary.json"
import optimizerDim from "@/lib/data/fixtures/v1922/dimension-optimizer.json"
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
  /** 现金花费 / 考核 BI 数。**MetricValue 不是 RatioValue**——它是金额，可缺可「待到」 */
  biCashCost?: MetricValue
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
  assessment: DashboardAssessment & { biConv: MetricValue; biCashCost: MetricValue; overCost: MetricValue }
  /**
   * 环比：**后端算好的比率**（`compare.deltas`，RatioValue）。
   * ★不再自造 `previous` + 前端相减：窗口口径、缺数怎么算、除零怎么办全在后端，
   *   前端自己算必然和日报/结算对不上。后端没给 compare 就不显环比。
   */
  compare?: { mode: "dod" | "wow" | "prev_window"; deltas: Partial<Record<"cost" | "cashCost" | "realConversion" | "cashCpa" | "onTargetRate", RatioValue>> }
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
export const resourcePositionFixture = checked<{ mode: string; source: { rows: DashboardRow[]; dimension: string; lineage: unknown } }>(resourceDim, dimensionWindowRowSchema, "dimension-resource-position")
export const drillFixture = drill as unknown as Fixture<{ byParent: Record<string, DashboardRow[]> }>

/**
 * BI 数按消耗占比分摊到下级（契约 v1.9.22 口径，与同事 v7 一致）。
 *
 * ★分母是**已返回子行的消耗之和**，不是父行消耗——列表被截断/分页时，父行消耗里含着
 * 没返回的那些子行，拿它当分母会把每个可见子行的份额系统性调小，加起来对不上父行。
 *
 * 三种情况**整列不分摊**（返回 null，界面显「−」）：
 * ① 父行没有考核 BI 数（missing / pending）——没有可分的总量；
 * ② 结果被截断或只是部分（truncated / partial）——分母不完整；
 * ③ 子行自己消耗缺数——占比算不出来。
 * 宁可整列空着，也不给一个偷偷算错的数：这列是拿去对考核的。
 */
export function allocateBi(input: {
  parentBi: MetricValue | null | undefined
  /** 已返回的同级子行（分母取它们的消耗之和） */
  siblings: { metrics: Pick<DashboardMetrics, "cost"> }[]
  childCost: number | null
  /** 结果被截断或只是部分时不分摊 */
  incomplete?: boolean
}): number | null {
  const { parentBi, siblings, childCost, incomplete } = input
  // bi 可能是 0（真的一个都没回传）——用 != null 判断，别被 falsy 吃掉
  if (incomplete || childCost === null) return null
  if (!parentBi || parentBi.availability !== "available" || parentBi.value === null) return null
  const denominator = siblings.reduce<number | null>((total, row) => {
    const value = row.metrics.cost.value
    return total === null || value === null ? null : total + value
  }, 0)
  if (denominator === null || denominator === 0) return null
  return Math.round((childCost / denominator) * parentBi.value)
}

/**
 * 按选中的窗口从**按天**的趋势行重算汇总。
 * 为什么要重算而不是直接显示后端那份 summary：窗口是用户选的，选了之后数字不动，
 * 这个选择器就是个摆设（老板 2026-09-10 问的正是这个）。
 * 真实模式下换窗口 = 重发一次 `POST /data/query` 由后端算（F8-19b ① 接上后走这条）；
 * 这里是过渡期用手上的按天数据自己合，口径与后端一致。
 */
export function aggregateDays(days: { ds: string; metrics: DashboardMetrics }[], from: string, to: string) {
  const inWindow = days.filter((day) => day.ds >= from && day.ds <= to)
  if (inWindow.length === 0) return null
  const sum = (pick: (m: DashboardMetrics) => MetricValue) =>
    inWindow.reduce<number | null>((total, day) => {
      const value = pick(day.metrics).value
      // 只要有一天缺数，和就是「不完整」——返回 null，不把缺的当 0 加进去
      return total === null || value === null ? null : total + value
    }, 0)
  const cost = sum((m) => m.cost)
  const cashCost = sum((m) => m.cashCost)
  const conversion = sum((m) => m.conversion)
  const realConversion = sum((m) => m.realConversion)
  // 比率必须用「总和 ÷ 总和」重算，**不能对每天的比率取平均**——那会被小消耗日拉偏
  const ratio = (numerator: number | null, denominator: number | null) =>
    numerator === null || !denominator ? null : numerator / denominator
  return {
    days: inWindow.length,
    cost, cashCost, conversion, realConversion,
    realCpa: ratio(cost, realConversion),
    cashCpa: ratio(cashCost, realConversion),
  }
}
