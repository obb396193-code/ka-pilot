import summary from "@/lib/data/fixtures/v1922/summary.json"
import optimizerDim from "@/lib/data/fixtures/v1922/dimension-optimizer.json"
import resourceDim from "@/lib/data/fixtures/v1922/dimension-resource-position.json"
import drill from "@/lib/data/fixtures/v1922/drill.json"
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
  /** 现金花费 / 考核 BI 数 */
  biCashCost?: RatioValue
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
  wakeUv: MetricValue; potentialUv: MetricValue
  ratios: { ctr: RatioValue; cvr: RatioValue; realCpa: RatioValue; cashCpa: RatioValue; gap: RatioValue; potentialRate: RatioValue; biConversionRate: RatioValue }
}

export type DashboardRow = { key: string; label: string; metrics: DashboardMetrics; assessment: DashboardAssessment; anomaly: unknown }

export type DashboardSummaryRow = {
  rowCount: number; accountCount: number; anomalyRows: number
  metrics: DashboardMetrics
  /** summary 一定带 v1.9.22 三项（后端保证），所以这里收紧成必填 */
  assessment: DashboardAssessment & { biConv: MetricValue; biCashCost: RatioValue; overCost: MetricValue }
  /** 环比：上一个等长窗口的同口径值。**前端不自己算窗口**，后端给什么显什么 */
  previous: { window: { from: string; to: string }; metrics: DashboardMetrics; assessment: { biConv: MetricValue; biCashCost: RatioValue; overCost: MetricValue } } | null
}

type DimensionEnvelope = Fixture<{ mode: string; source: { rows: DashboardRow[]; dimension: string; lineage: unknown } }>

export const dashboardSummaryFixture = summary as unknown as Fixture<{ mode: string; source: { rows: DashboardSummaryRow[]; lineage: unknown } }>
export const optimizerDimensionFixture = optimizerDim as unknown as DimensionEnvelope
export const resourcePositionFixture = resourceDim as unknown as DimensionEnvelope
export const drillFixture = drill as unknown as Fixture<{ byParent: Record<string, DashboardRow[]> }>

/**
 * BI 数按消耗占比分摊到下级（契约 v1.9.22：口径与同事 v7 一致）。
 * 为什么要分摊：后端只在优化师/大类这一级给考核 BI 数，再往下没有；
 * 直接显「−」会让整列空掉，按消耗占比分是双方约定的近似口径——**所以要在界面上标明是分摊值**。
 */
export function allocateBi(parentBi: number | null, parentCost: number | null, childCost: number | null): number | null {
  if (parentBi === null || !parentCost || childCost === null) return null
  return Math.round((childCost / parentCost) * parentBi)
}

/** 环比：(今 − 昨) / 昨。任一边缺就返回 null——不拿 0 当基数，也不显「+∞」 */
export function deltaRate(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current === null || current === undefined || previous === null || previous === undefined || previous === 0) return null
  return (current - previous) / previous
}

/**
 * 按选中的窗口从**按天**的趋势行重算汇总。
 * 为什么要重算而不是直接显示后端给的那份 summary：窗口是用户选的，
 * 选了之后数字不动的话，这个选择器就是个摆设（老板 2026-09-10 正是问这个）。
 * 真实模式下换窗口 = 重发一次 `POST /data/query`，由后端算；
 * 这里是过渡期用手上的按天数据自己合，口径与后端一致（求和的求和、比率重算而不是平均）。
 */
export function aggregateDays(days: { ds: string; metrics: DashboardMetrics }[], from: string, to: string) {
  const inWindow = days.filter((day) => day.ds >= from && day.ds <= to)
  if (inWindow.length === 0) return null
  const sum = (pick: (m: DashboardMetrics) => MetricValue) =>
    inWindow.reduce<number | null>((total, day) => {
      const value = pick(day.metrics).value
      // 只要有一天缺数，和就是「不完整」——返回 null 而不是把缺的当 0 加进去
      return total === null || value === null ? null : total + value
    }, 0)
  const cost = sum((m) => m.cost)
  const cashCost = sum((m) => m.cashCost)
  const conversion = sum((m) => m.conversion)
  const realConversion = sum((m) => m.realConversion)
  const costSpace = sum((m) => m.costSpace)
  // 比率必须用「总和 ÷ 总和」重算，**不能对每天的比率取平均**——那会被小消耗日拉偏
  const ratio = (numerator: number | null, denominator: number | null) =>
    numerator === null || !denominator ? null : numerator / denominator
  return {
    days: inWindow.length,
    cost, cashCost, conversion, realConversion, costSpace,
    realCpa: ratio(cost, realConversion),
    cashCpa: ratio(cashCost, realConversion),
  }
}
