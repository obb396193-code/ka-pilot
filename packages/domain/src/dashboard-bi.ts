import { z } from "zod";
import { ratioValueSchema } from "./data-query-base-rows.js";
import { canonicalMetricValueSchema, divideMetricValues, metricValue, sumMetricValues } from "./metric-value.js";
import {
  computeKaDailyWindowAssessment, computeWindowAssessment,
  dailyAssessmentInputSchema, kaDailyAssessmentInputSchema,
} from "./window-assessment.js";

/** P211 arithmetic result, not a query envelope or a source/coverage claim. */
export const dashboardBiSchema = z.object({
  bi_conv: canonicalMetricValueSchema,
  bi_cash_cost: ratioValueSchema,
  over_cost: canonicalMetricValueSchema,
}).strict();
export type DashboardBi = z.infer<typeof dashboardBiSchema>;

const inputSchema = z.discriminatedUnion("priceSource", [
  z.object({ priceSource: z.literal("history"), days: z.array(dailyAssessmentInputSchema).max(10000) }).strict(),
  z.object({ priceSource: z.literal("ka_daily"), days: z.array(kaDailyAssessmentInputSchema).max(10000) }).strict(),
]);

/** Caller supplies the complete authorized expected account-day set, including
 * missing members. realConversion is the confirmed BI metric, NOT book OCPX
 * conversion. No allocation, price averaging, rounding or source fallback here.
 * Reuse the established daily-price assessment kernel for the sign-reversed
 * over-cost amount, keeping mixed versions and unknown prices meaningful.
 */
export function computeDashboardBi(value: unknown): DashboardBi {
  const input = inputSchema.parse(value);
  const bi = sumMetricValues(input.days.map(day => day.realConversion));
  const cash = sumMetricValues(input.days.map(day => day.cashCost));
  const { costSpace } = input.priceSource === "history"
    ? computeWindowAssessment(input.days)
    : computeKaDailyWindowAssessment(input.days);
  return dashboardBiSchema.parse({
    bi_conv: bi,
    bi_cash_cost: divideMetricValues(cash, bi, { infiniteWhenPositiveNumerator: true }),
    over_cost: costSpace.availability === "available"
      ? metricValue(costSpace.value === 0 ? 0 : -costSpace.value)
      : metricValue(null),
  });
}
