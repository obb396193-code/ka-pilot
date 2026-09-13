import type { MetricValue } from "@/lib/fixtures/contract"

/**
 * 大盘的两处算术。**放在 `lib/data/` 下是有原因的**：
 * `package.json` 的测试 glob 只跑 `lib/data/*.test.ts`，
 * 这两个函数原来住在 `lib/fixtures/dashboard.ts`，**挨着它们写的测试根本不会执行**
 * （审查员 D 点名）。搬过来才真的被门禁覆盖。
 *
 * 这里只做算术，不碰 fixture、不碰 React。
 */

type CostOnly = { metrics: { cost: MetricValue } }

/**
 * BI 数按消耗占比分摊到下级。
 *
 * ★分母是**已返回子行的消耗之和**，不是父行消耗——列表被截断/分页时，
 * 父行消耗里含着没返回的那部分，拿它当分母，每一行分到的都会偏小，
 * 而且加起来不等于父行（审查点名过一次）。
 */
export function allocateBi(input: {
  parentBi: MetricValue | null | undefined
  /** 已返回的同级子行（分母取它们的消耗之和） */
  siblings: CostOnly[]
  childCost: number | null
  /** 结果被截断或只是部分时不分摊 */
  incomplete?: boolean
}): number | null {
  const { parentBi, siblings, childCost, incomplete } = input
  if (incomplete || childCost === null) return null
  // bi 可能是 0（真的一个都没回传）——用显式判断，别被 falsy 吃掉
  if (!parentBi || parentBi.availability !== "available" || parentBi.value === null) return null
  const denominator = siblings.reduce<number | null>((total, row) => {
    const value = row.metrics.cost.value
    return total === null || value === null ? null : total + value
  }, 0)
  if (denominator === null || denominator === 0) return null
  return Math.round((childCost / denominator) * parentBi.value)
}

export type DayMetrics = {
  cost: MetricValue; cashCost: MetricValue; conversion: MetricValue; realConversion: MetricValue
}

/**
 * 按选中的窗口从**按天**的行重算汇总（只在 mock 用；真实模式换窗口由后端重算）。
 *
 * 两条口径：
 * ① 只要有一天缺数，和就是「不完整」→ 返回 null，**不把缺的当 0 加进去**；
 * ② 比率用「总和 ÷ 总和」，**不能对每天的比率取平均**——那会被小消耗日拉偏。
 */
export function aggregateDays<T extends { ds: string; metrics: DayMetrics }>(days: T[], from: string, to: string) {
  const inWindow = days.filter((day) => day.ds >= from && day.ds <= to)
  if (inWindow.length === 0) return null
  const sum = (pick: (m: DayMetrics) => MetricValue) =>
    inWindow.reduce<number | null>((total, day) => {
      const value = pick(day.metrics).value
      return total === null || value === null ? null : total + value
    }, 0)
  const cost = sum((m) => m.cost)
  const cashCost = sum((m) => m.cashCost)
  const conversion = sum((m) => m.conversion)
  const realConversion = sum((m) => m.realConversion)
  const ratio = (numerator: number | null, denominator: number | null) =>
    numerator === null || !denominator ? null : numerator / denominator
  return {
    days: inWindow.length,
    cost, cashCost, conversion, realConversion,
    realCpa: ratio(cost, realConversion),
    cashCpa: ratio(cashCost, realConversion),
  }
}
