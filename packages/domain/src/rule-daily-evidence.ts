import { z } from "zod";
import { calendarDateSchema, canonicalMetricSetSchema } from "./data-query-base-rows.js";
import { conditionReadRequests, evaluateConditionTree, type ConditionReadRequest } from "./condition-tree.js";
import { aggregateWindowMetrics, queryWindowSchema } from "./summary-window.js";
import { computeWindowAssessment, dailyAssessmentInputSchema } from "./window-assessment.js";
import { divideMetricValues, metricValue, sumMetricValues } from "./metric-value.js";

const DAY_MS = 86400000;
export class RuleDailyEvidenceError extends Error {
  constructor(readonly code: "HOURLY_SOURCE_REQUIRED" | "WINDOW_UNSUPPORTED" | "INVALID_EVIDENCE") {
    super(`Rule daily evidence unavailable: ${code}`); this.name = "RuleDailyEvidenceError";
  }
}
function invalid(): never { throw new RuleDailyEvidenceError("INVALID_EVIDENCE"); }
function shift(ds: string, offset: number): string {
  const date = new Date(Date.parse(`${ds}T00:00:00Z`) + offset * DAY_MS);
  if (!Number.isFinite(date.valueOf())) throw new RuleDailyEvidenceError("WINDOW_UNSUPPORTED");
  const value = date.toISOString().slice(0, 10);
  if (!calendarDateSchema.safeParse(value).success) throw new RuleDailyEvidenceError("WINDOW_UNSUPPORTED");
  return value;
}
function key(request: ConditionReadRequest): string { return JSON.stringify([request.metric, request.windowHours, request.dayOffset]); }

/** Explicit business-date windows; does not reinterpret daily totals as intraday windows. */
export function planRuleDailyEvidence(tree: unknown, windowInput: unknown) {
  const base = queryWindowSchema.parse(windowInput);
  const reads = conditionReadRequests(tree).map(request => {
    if (request.windowHours !== null && request.windowHours % 24 !== 0) throw new RuleDailyEvidenceError("HOURLY_SOURCE_REQUIRED");
    if (request.windowHours !== null && request.windowHours / 24 > 31) throw new RuleDailyEvidenceError("WINDOW_UNSUPPORTED");
    const to = shift(base.to, -request.dayOffset);
    const from = request.windowHours === null ? shift(base.from, -request.dayOffset) : shift(to, -(request.windowHours / 24 - 1));
    return { request, from, to };
  });
  const from = reads.reduce((min, read) => read.from < min ? read.from : min, reads[0]!.from);
  const to = reads.reduce((max, read) => read.to > max ? read.to : max, reads[0]!.to);
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days > 31) throw new RuleDailyEvidenceError("WINDOW_UNSUPPORTED");
  return { reads, window: queryWindowSchema.parse({ from, to, preset: "custom" }), days };
}

const daySchema = z.object({ ds: calendarDateSchema, metrics: canonicalMetricSetSchema, assessment: dailyAssessmentInputSchema }).strict()
  .refine(row => row.ds === row.assessment.ds &&
    row.metrics.cashCost.value === row.assessment.cashCost.value && row.metrics.cashCost.availability === row.assessment.cashCost.availability &&
    row.metrics.realConversion.value === row.assessment.realConversion.value && row.metrics.realConversion.availability === row.assessment.realConversion.availability);

/** Pure evaluation only. RR scope, source freshness, initial-full and trigger policy
 * belong to the caller. Every expected day, including explicit missing rows, is required. */
export function evaluateRuleDailyEvidence(tree: unknown, windowInput: unknown, input: readonly unknown[]) {
  const plan = planRuleDailyEvidence(tree, windowInput);
  const parsed = z.array(daySchema).max(31).safeParse(input);
  if (!parsed.success || parsed.data.length !== plan.days) return invalid();
  const rows = parsed.data, seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.ds) || row.ds < plan.window.from || row.ds > plan.window.to) return invalid();
    seen.add(row.ds);
  }
  type Value = ReturnType<typeof metricValue> | ReturnType<typeof divideMetricValues>;
  const observations = new Map<string, { value: Value; granularity: "daily" }>();
  const windows = new Map<string, Record<string, Value>>();
  for (const read of plan.reads) {
    const windowKey = JSON.stringify([read.from, read.to]);
    let values = windows.get(windowKey);
    if (!values) {
      const selected = rows.filter(row => row.ds >= read.from && row.ds <= read.to);
      const metrics = aggregateWindowMetrics(selected.map(row => row.metrics));
      const assessmentRows = selected.map(row => row.assessment);
      const assessment = computeWindowAssessment(assessmentRows);
      const target = sumMetricValues(assessmentRows.map(row => row.price && row.realConversion.availability === "available"
        ? metricValue(row.price.value * row.realConversion.value) : metricValue(null)));
      const price = divideMetricValues(target, metrics.realConversion);
      values = { cash_cost: metrics.cashCost, real_conversion: metrics.realConversion, conversion: metrics.conversion,
        exposure: metrics.exposure, click: metrics.click, wake_uv: metrics.wakeUv, potential_uv: metrics.potentialUv,
        cash_cpa: metrics.ratios.cashCpa, ctr: metrics.ratios.ctr, cvr: metrics.ratios.cvr, gap: metrics.ratios.gap,
        potential_rate: metrics.ratios.potentialRate, bi_conversion_rate: metrics.ratios.biConversionRate,
        cost_space: assessment.costSpace, assessment_price: price };
      windows.set(windowKey, values);
    }
    const value = Object.hasOwn(values, read.request.metric) ? values[read.request.metric]! : metricValue(null);
    observations.set(key(read.request), { value, granularity: "daily" });
  }
  return evaluateConditionTree(tree, request => observations.get(key(request)));
}
