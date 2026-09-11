import { z } from "zod";
import { calendarDateSchema, ratioValueSchema } from "./data-query-base-rows.js";
import { canonicalMetricValueSchema, metricValue, sumMetricValues } from "./metric-value.js";
import { biCashCostMetricValue, dashboardBiFrom } from "./dashboard-bi-math.js";
import { queryWindowSchema, windowAssessmentSchema, windowComparisonSchema } from "./summary-window.js";

const undefinedRatio = { value: null, state: "undefined" } as const;
export const dailyAssessmentInputSchema = z.object({
  ds: calendarDateSchema,
  cashCost: canonicalMetricValueSchema,
  realConversion: canonicalMetricValueSchema,
  // Internal source history identity is required; equal displayed values are not equal versions.
  price: z.object({ value: z.number().finite(), effectiveDate: calendarDateSchema, versionKey: z.string().min(1).max(256) }).strict().nullable(),
}).strict().refine((row) => row.price === null || row.price.effectiveDate <= row.ds, "future assessment version");
export type DailyAssessmentInput = z.infer<typeof dailyAssessmentInputSchema>;
export const kaDailyAssessmentInputSchema = z.object({
  ds: calendarDateSchema, cashCost: canonicalMetricValueSchema, realConversion: canonicalMetricValueSchema,
  price: z.number().finite().nullable(),
}).strict();
type WeightedDay = Omit<DailyAssessmentInput, "price"> & { price: { value: number } | null };
interface PriceEvidence {
  priceSource: "history" | "ka_daily";
  price: { value: number; effectiveDate: string | null } | null;
  priceVersions?: number;
}

/** Input must include missing expected account-days. No scope or completeness is inferred here. */
export function computeWindowAssessment(input: readonly unknown[], budgetUsageRate: unknown = undefinedRatio) {
  const rows = z.array(dailyAssessmentInputSchema).max(10000).parse(input);
  const versions = new Map<string, { value: number; effectiveDate: string }>();
  for (const row of rows) if (row.price) {
    const { versionKey, ...value } = row.price, previous = versions.get(versionKey);
    if (previous && (previous.value !== value.value || previous.effectiveDate !== value.effectiveDate)) throw new Error("Assessment version metadata disagrees");
    versions.set(versionKey, value);
  }
  const completePrices = rows.length > 0 && rows.every((row) => row.price !== null);
  const price = completePrices && versions.size === 1 ? [...versions.values()][0]! : null;
  return computeWeightedAssessment(rows, {
    priceSource: "history", price, ...(completePrices && versions.size > 1 ? { priceVersions: versions.size } : {}),
  }, budgetUsageRate);
}

/** KA supplies daily cash prices, not version IDs or effective dates. Never manufacture history. */
export function computeKaDailyWindowAssessment(input: readonly unknown[], budgetUsageRate: unknown = undefinedRatio) {
  const parsed = z.array(kaDailyAssessmentInputSchema).max(10000).parse(input);
  const prices = new Set(parsed.flatMap((row) => row.price === null ? [] : [row.price]));
  const complete = parsed.length > 0 && parsed.every((row) => row.price !== null);
  const evidence: PriceEvidence = {
    priceSource: "ka_daily", price: complete && prices.size === 1 ? { value: [...prices][0]!, effectiveDate: null } : null,
    ...(complete && prices.size > 1 ? { priceVersions: prices.size } : {}),
  };
  return {
    ...computeWeightedAssessment(parsed.map((row) => ({ ...row, price: row.price === null ? null : { value: row.price } })), evidence, budgetUsageRate),
    warnings: complete && prices.size > 1 ? ["ASSESSMENT_VERSION_UNKNOWN"] : [],
  };
}

function computeWeightedAssessment(rows: readonly WeightedDay[], evidence: PriceEvidence, budgetUsageRate: unknown) {
  const completePrices = rows.length > 0 && rows.every((row) => row.price !== null);
  const cash = sumMetricValues(rows.map((row) => row.cashCost));
  const target = sumMetricValues(rows.map((row) => row.price && row.realConversion.availability === "available"
    ? metricValue(row.price.value * row.realConversion.value) : metricValue(null)));
  const costSpace = cash.availability === "available" && target.availability === "available"
    ? metricValue(target.value - cash.value) : metricValue(null);
  let reason: "assessment_missing" | "cash_missing" | "conversion_missing" | "window_over" | "day_over_window_ok" | "window_ok";
  if (!completePrices) reason = "assessment_missing";
  else if (cash.availability !== "available") reason = "cash_missing";
  else if (costSpace.availability !== "available") reason = "conversion_missing";
  else if (costSpace.value < 0) reason = "window_over";
  else {
    const daily = new Map<string, { cash: number; target: number }>();
    for (const row of rows) {
      const day = daily.get(row.ds) ?? { cash: 0, target: 0 };
      day.cash += row.cashCost.value!; day.target += row.price!.value * row.realConversion.value!;
      if (!Number.isFinite(day.cash) || !Number.isFinite(day.target)) throw new Error("Assessment exceeds finite range");
      daily.set(row.ds, day);
    }
    reason = [...daily.values()].some((day) => day.cash > day.target) ? "day_over_window_ok" : "window_ok";
  }
  const determined = reason !== "cash_missing" && reason !== "conversion_missing" && reason !== "assessment_missing";
  // v1.9.27 ③（Q-041 ②）：三个 BI 值就在这里一起出，与 costSpace 同源同口径。
  // 它们和考核结论用的是同一批天、同一批价，不可能各说各话。
  const bi = dashboardBiFrom(cash, sumMetricValues(rows.map((row) => row.realConversion)), costSpace);
  return {
    costSpace,
    assessment: windowAssessmentSchema.parse({
      ...evidence,
      biConv: bi.bi_conv,
      biCashCost: biCashCostMetricValue(bi.bi_cash_cost),
      overCost: bi.over_cost,
      onTarget: determined ? reason !== "window_over" : null,
      costStatus: !determined ? null : reason === "window_over" ? "red" : reason === "day_over_window_ok" ? "yellow" : "green",
      costStatusReason: reason, budgetUsageRate: ratioValueSchema.parse(budgetUsageRate),
    }),
  };
}

export function comparisonWindow(input: unknown, mode: "dod" | "wow") {
  const window = queryWindowSchema.parse(input);
  const shift = mode === "dod" ? 1 : mode === "wow" ? 7 : null;
  if (shift === null) throw new Error("Invalid comparison mode");
  if (window.preset === "today") return null;
  const move = (value: string) => new Date(new Date(`${value}T00:00:00Z`).valueOf() - shift * 86_400_000).toISOString().slice(0, 10);
  return queryWindowSchema.parse({ from: move(window.from), to: move(window.to), preset: "custom" });
}

export function unavailableWindowComparison(mode: "dod" | "wow") {
  return windowComparisonSchema.parse({ mode, deltas: {
    cost: undefinedRatio, cashCost: undefinedRatio, realConversion: undefinedRatio,
    cashCpa: undefinedRatio, onTargetRate: undefinedRatio,
  } });
}
