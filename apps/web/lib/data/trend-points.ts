import type { MetricValue, RatioValue } from "@/lib/fixtures/contract"

/**
 * 趋势图的横轴生成（F8-19b P1 附录）。从 `overview-tab.tsx` 抽出来的纯逻辑。
 *
 * ★横轴是**窗口里的每一天**，不是「后端返回了哪几天」。
 * 按返回行画的话，某天整天缺数时那天在轴上**根本不存在**——
 * 09-02 和 09-04 直接挨在一起，看着像连续的，缺的那天神不知鬼不觉（审查 ⑦）。
 */

export type TrendRow = {
  ds: string
  metrics: { cost: MetricValue; conversion: MetricValue; ratios: { realCpa: RatioValue } }
}
export type TrendPoint = { ds: string; cost: number | null; conversion: number | null; cpa: number | null }

/** 窗口异常长时的封顶，别把页面卡死 */
const MAX_DAYS = 366

export function trendPoints(rows: TrendRow[], from: string, to: string): TrendPoint[] {
  if (!from || !to || from > to) return []
  const byDate = new Map(rows.map((row) => [row.ds, row]))
  const out: TrendPoint[] = []
  // 用 UTC 推进，避免夏令时 / 时区把某一天跳过去或算重
  for (let cursor = new Date(`${from}T00:00:00.000Z`); out.length < MAX_DAYS; cursor = new Date(cursor.getTime() + 86_400_000)) {
    const ds = cursor.toISOString().slice(0, 10)
    if (ds > to) break
    const row = byDate.get(ds)
    out.push({
      ds,
      cost: row?.metrics.cost.value ?? null,
      conversion: row?.metrics.conversion.value ?? null,
      // 比率 undefined/infinite 都没有可画的数值 → null（线在这里断开）
      cpa: row?.metrics.ratios.realCpa.state === "finite" ? row.metrics.ratios.realCpa.value : null,
    })
  }
  return out
}
