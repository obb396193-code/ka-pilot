import { z } from "zod";
import { ratioValueSchema } from "./data-query-base-rows.js";
import { canonicalMetricValueSchema, divideMetricValues, metricValue } from "./metric-value.js";

/** P211 arithmetic result, not a query envelope or a source/coverage claim. */
export const dashboardBiSchema = z.object({
  bi_conv: canonicalMetricValueSchema,
  bi_cash_cost: ratioValueSchema,
  over_cost: canonicalMetricValueSchema,
}).strict();
export type DashboardBi = z.infer<typeof dashboardBiSchema>;

/**
 * 三个 BI 值的**唯一算法**（v1.9.27 键位；Q-041 ② 接线）。窗口考核那条路径也调它——
 * 两处各算一遍必然有一天算法分叉，而分叉的结果长得一模一样，没人看得出哪个是对的。
 *
 * `overCost` = 现金花费 − Σ日(考核BI数×当日生效价)，也就是成本空间取反：正数 = 超成本。
 *
 * **这个文件只做算术，不许 import `window-assessment`**：那边要调它，反向再 import 回来
 * 就是循环依赖。循环在 vitest 里可能不报，在真 CLI 入口会炸成
 * 「Cannot access 'X' before initialization」——已经踩过一次。
 */
/**
 * v1.9.27 ③：`assessment.biCashCost` 的 wire 形是 **MetricValue**（契约 api.md 写死，
 * 前端镜像 apps/web canonical-query-rows 也已按这个形冻了），不是 RatioValue。
 *
 * 于是「花了钱、一个 BI 数都没有」这种真事实只能落成 `missing`——MetricValue 没有
 * infinite 这一档。**这是有损的**：它和「根本没数据」在前端长得一样。
 * 内核 `dashboardBiSchema.bi_cash_cost` 仍保留 RatioValue（那层能表达 infinite），
 * 转换只发生在出到 assessment 的这一步。已在回执里请 arch 裁是否要放开。
 */
export function biCashCostMetricValue(
  ratio: z.infer<typeof ratioValueSchema>,
): z.infer<typeof canonicalMetricValueSchema> {
  return ratio.state === "finite" ? metricValue(ratio.value) : metricValue(null);
}

export function dashboardBiFrom(
  cash: z.infer<typeof canonicalMetricValueSchema>,
  biConv: z.infer<typeof canonicalMetricValueSchema>,
  costSpace: z.infer<typeof canonicalMetricValueSchema>,
): DashboardBi {
  return dashboardBiSchema.parse({
    bi_conv: biConv,
    bi_cash_cost: divideMetricValues(cash, biConv, { infiniteWhenPositiveNumerator: true }),
    over_cost: costSpace.availability === "available"
      ? metricValue(costSpace.value === 0 ? 0 : -costSpace.value)
      : metricValue(null),
  });
}
