import type { MetricValue } from "@/lib/fixtures/contract"

/**
 * 分布图的数据整形（F8-19b P1 附录）。从 `dimension-chart.tsx` 抽出来的纯逻辑。
 *
 * 三条口径，每条都对应一种「看着正常其实在骗人」：
 * ① **0 消耗剔除**：画出来是根看不见的柱 / 一条缝的扇形，纯噪音；
 * ② **缺数单独计数**，不当 0：一张分布图少了几项，占比就全是错的，
 *    而用户从图上完全看不出少了东西；
 * ③ **降序**：分布图不排序等于让人自己找最大的那块。
 */

export type DimensionInput = { label: string | null; metrics: { cost: MetricValue } }
export type DimensionSlice = { name: string; value: number }

export function dimensionSeries(rows: DimensionInput[]): { data: DimensionSlice[]; missing: number } {
  // 缺数 ≠ 0 消耗：前者是「不知道」，后者是「知道，是 0」。分开数。
  const missing = rows.filter((row) => row.metrics.cost.value === null).length
  const data = rows
    .filter((row) => (row.metrics.cost.value ?? 0) > 0)
    .map((row) => ({ name: row.label ?? "未标注", value: row.metrics.cost.value! }))
    .sort((left, right) => right.value - left.value)
  return { data, missing }
}
