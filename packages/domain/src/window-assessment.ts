import { z } from "zod";
import { calendarDateSchema, ratioValueSchema } from "./data-query-base-rows.js";
import { canonicalMetricValueSchema, metricValue, sumMetricValues, sumMetricValuesPartial, type CanonicalMetricValue } from "./metric-value.js";
import { dashboardBiFrom } from "./dashboard-bi-math.js";
import { queryWindowSchema, windowAssessmentSchema, windowComparisonSchema, type WindowComparisonMode } from "./summary-window.js";

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

/**
 * v1.9.35 部分合计**只对个人源（history 价）这条路径开**。
 *
 * 团队 KA 源那条（`ka_daily`）这版仍走「缺一个成员就整体缺」：它的窗口汇总另有一条
 * 由 SQL 直接出总数的对拍路径（`ka-window-aggregate`），那条拿不到逐成员的缺失信息，
 * 两边口径必须一致，否则同一个窗口会出现「成员路径说部分、汇总路径说缺失」。
 * 团队源接 partial 属于 Q-041 ⑧ 的活，届时两条路一起改。
 */
function computeWeightedAssessment(rows: readonly WeightedDay[], evidence: PriceEvidence, budgetUsageRate: unknown) {
  const sum = evidence.priceSource === "history" ? sumMetricValuesPartial : sumMetricValues;
  const completePrices = rows.length > 0 && rows.every((row) => row.price !== null);
  // v1.9.35：窗口聚合走部分合计（缺几天就给有数那部分并标 partial）。
  const cash = sum(rows.map((row) => row.cashCost));
  const target = sum(rows.map((row) => row.price && row.realConversion.availability === "available"
    ? metricValue(row.price.value * row.realConversion.value) : metricValue(null)));
  // 成本空间照样给（两边都有值就能算），但它可能是「部分」的——
  // 部分的空间只能看个大概，不能拿去判达标，下面的 partial_data 就是干这个的。
  const partialSum = cash.availability === "partial" || target.availability === "partial";
  const bothUsable = (value: CanonicalMetricValue) =>
    value.availability === "available" || value.availability === "partial";
  const costSpace = bothUsable(cash) && bothUsable(target)
    ? canonicalMetricValueSchema.parse({
      value: (target.value as number) - (cash.value as number),
      availability: partialSum ? "partial" : "available",
    })
    : metricValue(null);
  let reason: "assessment_missing" | "cash_missing" | "conversion_missing" | "window_over" | "day_over_window_ok" | "window_ok" | "partial_data";
  if (!completePrices) reason = "assessment_missing";
  // v1.9.35 判定挂起：参与判定的任一项是「部分」就不判——拿半个窗口的花费去跟整窗目标比，
  // 结论必错，而且错得看不出来（数字一切正常，只是少了几天）。
  else if (partialSum) reason = "partial_data";
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
  const determined = reason === "window_over" || reason === "day_over_window_ok" || reason === "window_ok";
  // v1.9.27 ③（Q-041 ②）：三个 BI 值就在这里一起出，与 costSpace 同源同口径。
  // 它们和考核结论用的是同一批天、同一批价，不可能各说各话。
  const bi = dashboardBiFrom(cash, sum(rows.map((row) => row.realConversion)), costSpace);
  return {
    costSpace,
    assessment: windowAssessmentSchema.parse({
      ...evidence,
      biConv: bi.bi_conv,
      biCashCost: bi.bi_cash_cost,
      overCost: bi.over_cost,
      onTarget: determined ? reason !== "window_over" : null,
      costStatus: !determined ? null : reason === "window_over" ? "red" : reason === "day_over_window_ok" ? "yellow" : "green",
      costStatusReason: reason, budgetUsageRate: ratioValueSchema.parse(budgetUsageRate),
    }),
  };
}

const DAY_MS = 86_400_000;
const dayOf = (value: string) => new Date(`${value}T00:00:00Z`).valueOf();
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * v1.9.27 ①（Q-041 ③）`prev_window`：与当前窗口**等长、紧邻**的前一窗口。
 *
 * `month_to_date` 例外：它的前窗是**上月同样天数**（9/1–9/10 → 8/1–8/10），不是往前平移 10 天
 * （那会落到 8/22–8/31）。月初至今比的是「上个月同期」，平移过去的那段既不是上月同期、
 * 也不是一个完整口径，拿来算环比等于给人看一个没人要的数。
 */
export function comparisonWindow(input: unknown, mode: WindowComparisonMode) {
  const window = queryWindowSchema.parse(input);
  if (window.preset === "today") return null;
  if (mode === "prev_window") {
    const length = Math.round((dayOf(window.to) - dayOf(window.from)) / DAY_MS) + 1;
    if (window.preset === "month_to_date") {
      const start = new Date(`${window.from}T00:00:00Z`);
      const previousMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
      const daysInPreviousMonth = new Date(Date.UTC(
        previousMonth.getUTCFullYear(), previousMonth.getUTCMonth() + 1, 0)).getUTCDate();
      // 上月天数不够时（3/1–3/31 的前窗是 2 月）到月末为止，不借下个月的天。
      const span = Math.min(length, daysInPreviousMonth);
      const from = dateOf(previousMonth.valueOf());
      return queryWindowSchema.parse({
        from, to: dateOf(previousMonth.valueOf() + (span - 1) * DAY_MS), preset: "custom",
      });
    }
    return queryWindowSchema.parse({
      from: dateOf(dayOf(window.from) - length * DAY_MS),
      to: dateOf(dayOf(window.to) - length * DAY_MS),
      preset: "custom",
    });
  }
  const shift = mode === "dod" ? 1 : mode === "wow" ? 7 : null;
  if (shift === null) throw new Error("Invalid comparison mode");
  const move = (value: string) => dateOf(dayOf(value) - shift * DAY_MS);
  return queryWindowSchema.parse({ from: move(window.from), to: move(window.to), preset: "custom" });
}

export function unavailableWindowComparison(mode: WindowComparisonMode) {
  return windowComparisonSchema.parse({ mode, deltas: {
    cost: undefinedRatio, cashCost: undefinedRatio, realConversion: undefinedRatio,
    cashCpa: undefinedRatio, onTargetRate: undefinedRatio,
  } });
}
