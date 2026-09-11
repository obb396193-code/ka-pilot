import { z } from "zod";
import { accountSummaryRowSchema, calendarDateSchema, canonicalMetricSetSchema, ratioValueSchema } from "./data-query-base-rows.js";
import { canonicalMetricValueSchema, divideMetricValues, metricValue, sumMetricValues, type CanonicalMetricValue } from "./metric-value.js";
import { compareAbsolute, compareRate } from "./metrics.js";

/** Strict public v3 window and assessment values. */
export const queryWindowSchema = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema,
  preset: z.enum(["today", "yesterday", "last_7d", "month_to_date", "last_month", "task_period", "custom"]).default("custom"),
}).strict().refine((window) => window.from <= window.to, "window must be ordered");

export const windowAssessmentSchema = z.object({
  priceSource: z.enum(["history", "ka_daily"]),
  price: z.object({ value: z.number().finite(), effectiveDate: calendarDateSchema.nullable() }).strict().nullable(),
  priceVersions: z.number().int().min(2).optional(),
  onTarget: z.boolean().nullable(),
  costStatus: z.enum(["green", "yellow", "red"]).nullable(),
  costStatusReason: z.enum(["window_ok", "day_over_window_ok", "window_over", "cash_missing", "conversion_missing", "assessment_missing"]),
  budgetUsageRate: ratioValueSchema,
  /**
   * v1.9.27 ③ 三个 BI 指标（Q-041 ②）。**必填**，与 stage 那批同理——
   * 留 optional 的话哪条路径漏发都不会有东西报警，前端只是静悄悄显「−」。
   * 三个值由 `dashboardBiFrom` 一处算出：
   * - `biConv` = 考核 BI 数（= 确认口径的 realConversion 求和，不是媒体侧转化）；
   * - `biCashCost` = 现金花费 / biConv，wire 形是 MetricValue（契约与前端镜像已冻）；
   *   BI 数为 0 而花了钱那种情况只能落成 missing，**这一档是有损的**，已请 arch 裁；
   * - `overCost` = 成本空间取反，正数 = 超成本，可负。
   */
  // 同 incentiveCost：**暂为 optional 只是为了不判死几十份冻结 fixture**，
  // 真实产出路径恒发三个值（绊线 new-metric-fields-emitted 钉住），fixtures 重导后转必填。
  biConv: canonicalMetricValueSchema.optional(),
  /** wire 形按契约与前端镜像是 MetricValue（不是 RatioValue），见 `biCashCostMetricValue` 的注释。 */
  biCashCost: canonicalMetricValueSchema.optional(),
  overCost: canonicalMetricValueSchema.optional(),
}).strict().superRefine((assessment, context) => {
  if (assessment.price !== null && assessment.priceSource === "history" && assessment.price.effectiveDate === null) {
    context.addIssue({ code: "custom", message: "history price requires a real effective date" });
  }
  if (assessment.price !== null && assessment.priceSource === "ka_daily" && assessment.price.effectiveDate !== null) {
    context.addIssue({ code: "custom", message: "daily KA price has no historical effective date" });
  }
  if (assessment.priceVersions !== undefined && assessment.price !== null) {
    context.addIssue({ code: "custom", message: "mixed versions cannot have a representative price" });
  }
  if (assessment.onTarget !== null && assessment.price === null && assessment.priceVersions === undefined) {
    context.addIssue({ code: "custom", message: "determined assessment requires a price or mixed version evidence" });
  }
  if (assessment.costStatusReason === "assessment_missing" && (assessment.price !== null || assessment.priceVersions !== undefined)) {
    context.addIssue({ code: "custom", message: "incomplete prices cannot claim complete representative versions" });
  }
  const expected = {
    window_ok: [true, "green"], day_over_window_ok: [true, "yellow"], window_over: [false, "red"],
    cash_missing: [null, null], conversion_missing: [null, null], assessment_missing: [null, null],
  } as const;
  const [target, status] = expected[assessment.costStatusReason];
  if (assessment.onTarget !== target || assessment.costStatus !== status) {
    context.addIssue({ code: "custom", message: "assessment status and reason disagree" });
  }
});

export const windowComparisonSchema = z.object({
  // v1.9.27 ①：`prev_window` = 与当前窗口等长、紧邻的前一窗口
  //（month_to_date 的前窗 = 上月同样天数）。前端不自造 previous 块、不二次查询。
  mode: z.enum(["dod", "wow", "prev_window"]),
  deltas: z.object({
    cost: ratioValueSchema, cashCost: ratioValueSchema, realConversion: ratioValueSchema,
    cashCpa: ratioValueSchema, onTargetRate: ratioValueSchema,
  }).strict(),
}).strict();
export const windowComparisonModeSchema = windowComparisonSchema.shape.mode;
export type WindowComparisonMode = z.infer<typeof windowComparisonModeSchema>;

/** Shared cross-field guard for summary and dimension rows; does not recompute ratios. */
export function refineWindowMetricAssessment(row: {
  metrics: z.infer<typeof canonicalMetricSetSchema>;
  assessment: z.infer<typeof windowAssessmentSchema>;
}, context: z.RefinementCtx): void {
  if (row.metrics.cashCost.availability !== "available" && row.assessment.onTarget !== null) {
    context.addIssue({ code: "custom", path: ["assessment", "onTarget"], message: "unavailable cash cannot determine a cost status" });
  }
  if (row.metrics.realConversion.availability !== "available" && row.assessment.onTarget !== null) {
    context.addIssue({ code: "custom", path: ["assessment", "onTarget"], message: "unavailable conversion cannot determine a cost status" });
  }
  if (row.assessment.costStatusReason === "cash_missing" && row.metrics.cashCost.availability === "available") {
    context.addIssue({ code: "custom", path: ["assessment", "costStatusReason"], message: "cash_missing requires unavailable cash" });
  }
  if (row.assessment.costStatusReason === "conversion_missing" &&
    (row.metrics.cashCost.availability !== "available" || row.metrics.realConversion.availability === "available")) {
    context.addIssue({ code: "custom", path: ["assessment", "costStatusReason"], message: "conversion_missing requires known cash and unavailable conversion" });
  }
}

export const summaryWindowRowSchema = accountSummaryRowSchema.extend({
  assessment: windowAssessmentSchema,
  compare: windowComparisonSchema.optional(),
}).strict().superRefine(refineWindowMetricAssessment);
// v3 trend is ds + flat MetricSet, not ds + nested v2 SummaryRow.
export const trendWindowRowSchema = z.object({ ds: calendarDateSchema, metrics: canonicalMetricSetSchema }).strict();
export type SummaryWindowRow = z.infer<typeof summaryWindowRowSchema>;

// v1.9.27 ④：incentiveCost 与其它花费一样可加；源里没有这一列时它恒为 missing，
// 相加的结果也就是 missing——不会因为「有几天有、几天没有」被悄悄当成 0。
const sumFields = ["cost", "cashCost", "exposure", "click", "conversion", "realConversion", "costSpace", "incentiveCost", "wakeUv", "potentialUv"] as const;

/** Caller must supply every expected account-day, including explicit missing members.
 * Does not claim scope/coverage or infer a representative price from heterogeneous versions.
 */
export function aggregateWindowMetrics(input: readonly unknown[]): z.infer<typeof canonicalMetricSetSchema> {
  const rows = input.map((row) => canonicalMetricSetSchema.parse(row));
  // incentiveCost 是 v1.9.27 新增且暂为 optional：老行没有这个键。
  // 缺键按 **missing** 参与求和（`metricValue(null)`），不是 0——源里没有这一列和
  // 「这段时间没花激励」是两件事，压成 0 就分不出来了。
  const values = Object.fromEntries(sumFields.map((key) => [
    key, sumMetricValues(rows.map((row) => row[key] ?? metricValue(null))),
  ])) as Record<typeof sumFields[number], CanonicalMetricValue>;
  const gap = divideMetricValues(values.conversion, values.realConversion);
  return canonicalMetricSetSchema.parse({
    ...values,
    ratios: {
      ctr: divideMetricValues(values.click, values.exposure),
      cvr: divideMetricValues(values.conversion, values.click),
      realCpa: divideMetricValues(values.cost, values.realConversion, { infiniteWhenPositiveNumerator: true }),
      cashCpa: divideMetricValues(values.cashCost, values.realConversion, { infiniteWhenPositiveNumerator: true }),
      gap: gap.state === "finite" ? { value: (gap.value as number) - 1, state: "finite" } : gap,
      potentialRate: divideMetricValues(values.potentialUv, values.wakeUv),
      biConversionRate: divideMetricValues(values.realConversion, values.potentialUv),
    },
  });
}

const comparisonPointSchema = z.object({
  cost: canonicalMetricValueSchema, cashCost: canonicalMetricValueSchema, realConversion: canonicalMetricValueSchema,
  cashCpa: ratioValueSchema, onTargetRate: ratioValueSchema,
}).strict();

export function compareWindowPoints(mode: WindowComparisonMode, current: unknown, previous: unknown): z.infer<typeof windowComparisonSchema> {
  const now = comparisonPointSchema.parse(current), before = comparisonPointSchema.parse(previous);
  const toRatio = (value: ReturnType<typeof compareAbsolute>) => ratioValueSchema.parse(value === "NEW"
    ? { value: null, state: "infinite" }
    : value === null ? { value: null, state: "undefined" } : { value, state: "finite" });
  return windowComparisonSchema.parse({ mode, deltas: {
    cost: toRatio(compareAbsolute(now.cost.value, before.cost.value)),
    cashCost: toRatio(compareAbsolute(now.cashCost.value, before.cashCost.value)),
    realConversion: toRatio(compareAbsolute(now.realConversion.value, before.realConversion.value)),
    cashCpa: toRatio(compareRate(now.cashCpa.value, before.cashCpa.value)),
    // v1.7.4: percentage-point difference; zero is an observed rate, not a NEW denominator.
    onTargetRate: now.onTargetRate.state === "finite" && before.onTargetRate.state === "finite"
      ? ratioValueSchema.parse({ value: now.onTargetRate.value! - before.onTargetRate.value!, state: "finite" })
      : { value: null, state: "undefined" },
  } });
}
