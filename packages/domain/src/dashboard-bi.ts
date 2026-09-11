import { z } from "zod";
import { dashboardBiFrom, type DashboardBi } from "./dashboard-bi-math.js";
import { sumMetricValues } from "./metric-value.js";

// 算术与 schema 搬到 dashboard-bi-math：window-assessment 要调它，留在这里会形成循环依赖。
export { biCashCostMetricValue, dashboardBiFrom, dashboardBiSchema, type DashboardBi } from "./dashboard-bi-math.js";
import {
  computeKaDailyWindowAssessment, computeWindowAssessment,
  dailyAssessmentInputSchema, kaDailyAssessmentInputSchema,
} from "./window-assessment.js";


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
  return dashboardBiFrom(cash, bi, costSpace);
}
