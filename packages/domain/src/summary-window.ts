import { z } from "zod";
import { accountSummaryRowSchema, calendarDateSchema, canonicalMetricSetSchema, ratioValueSchema } from "./data-query-rows.js";
import { canonicalMetricValueSchema, divideMetricValues, sumMetricValues, type CanonicalMetricValue } from "./metric-value.js";
import { compareAbsolute, compareRate } from "./metrics.js";

/** Additive v3 building blocks. The public source boundary remains v2 until both adapters are wired. */
export const queryWindowSchema = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema,
  preset: z.enum(["today", "yesterday", "last_7d", "month_to_date", "last_month", "task_period", "custom"]).optional(),
}).strict().refine((window) => window.from <= window.to, "window must be ordered");

export const windowAssessmentSchema = z.object({
  price: z.object({ value: z.number().finite(), effectiveDate: calendarDateSchema }).strict().nullable(),
  onTarget: z.boolean().nullable(),
  costStatus: z.enum(["green", "yellow", "red"]).nullable(),
  costStatusReason: z.enum(["window_ok", "day_over_window_ok", "window_over", "cash_missing", "assessment_missing"]),
  budgetUsageRate: ratioValueSchema,
}).strict().superRefine((assessment, context) => {
  const expected = {
    window_ok: [true, "green"], day_over_window_ok: [true, "yellow"], window_over: [false, "red"],
    cash_missing: [null, null], assessment_missing: [null, null],
  } as const;
  const [target, status] = expected[assessment.costStatusReason];
  if (assessment.onTarget !== target || assessment.costStatus !== status) {
    context.addIssue({ code: "custom", message: "assessment status and reason disagree" });
  }
});

export const windowComparisonSchema = z.object({
  mode: z.enum(["dod", "wow"]),
  deltas: z.object({
    cost: ratioValueSchema, cashCost: ratioValueSchema, realConversion: ratioValueSchema,
    cashCpa: ratioValueSchema, onTargetRate: ratioValueSchema,
  }).strict(),
}).strict();

export const summaryWindowRowSchema = accountSummaryRowSchema.extend({
  assessment: windowAssessmentSchema,
  compare: windowComparisonSchema.optional(),
}).strict().superRefine((row, context) => {
  if (row.metrics.cashCost.availability !== "available" && row.assessment.onTarget !== null) {
    context.addIssue({ code: "custom", path: ["assessment", "onTarget"], message: "unavailable cash cannot determine a cost status" });
  }
});
// v3 trend is ds + flat MetricSet, not ds + nested v2 SummaryRow.
export const trendWindowRowSchema = z.object({ ds: calendarDateSchema, metrics: canonicalMetricSetSchema }).strict();
export type SummaryWindowRow = z.infer<typeof summaryWindowRowSchema>;

const sumFields = ["cost", "cashCost", "exposure", "click", "conversion", "realConversion", "costSpace", "wakeUv", "potentialUv"] as const;

/** Caller must supply every expected account-day, including explicit missing members.
 * Does not claim scope/coverage or infer a representative price from heterogeneous versions.
 */
export function aggregateWindowMetrics(input: readonly unknown[]): z.infer<typeof canonicalMetricSetSchema> {
  const rows = input.map((row) => canonicalMetricSetSchema.parse(row));
  const values = Object.fromEntries(sumFields.map((key) => [key, sumMetricValues(rows.map((row) => row[key]))])) as Record<typeof sumFields[number], CanonicalMetricValue>;
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

export function compareWindowPoints(mode: "dod" | "wow", current: unknown, previous: unknown): z.infer<typeof windowComparisonSchema> {
  const now = comparisonPointSchema.parse(current), before = comparisonPointSchema.parse(previous);
  const toRatio = (value: ReturnType<typeof compareAbsolute>) => ratioValueSchema.parse(value === "NEW"
    ? { value: null, state: "infinite" }
    : value === null ? { value: null, state: "undefined" } : { value, state: "finite" });
  return windowComparisonSchema.parse({ mode, deltas: {
    cost: toRatio(compareAbsolute(now.cost.value, before.cost.value)),
    cashCost: toRatio(compareAbsolute(now.cashCost.value, before.cashCost.value)),
    realConversion: toRatio(compareAbsolute(now.realConversion.value, before.realConversion.value)),
    cashCpa: toRatio(compareRate(now.cashCpa.value, before.cashCpa.value)),
    onTargetRate: toRatio(compareRate(now.onTargetRate.value, before.onTargetRate.value)),
  } });
}
