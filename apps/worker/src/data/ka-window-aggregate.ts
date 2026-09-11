import { z } from "zod";
import { calendarDateSchema, dashboardBiFrom, metricValue, summaryWindowRowSchema, compareWindowPoints,
  unavailableWindowComparison, comparisonWindow, type WindowComparisonMode} from "@ka/domain";
import type { KaDataWindowQueryPlan } from "./query-registry.js";
import { canonicalSummaryBaseRow } from "./canonical-query-rows.js";

const count = z.number().int().nonnegative().safe();
const metric = z.number().finite().nullable();
const ratioUnknown = { value: null, state: "undefined" } as const;
const metrics = ["cost_yuan", "cash_yuan", "show", "click", "conv", "target"] as const;
const rowSchema = z.object({
  kind: z.enum(["window", "day"]), period: z.enum(["current", "previous"]),
  date_from: calendarDateSchema, date_to: calendarDateSchema, ds: calendarDateSchema.nullable(),
  expected_count: count, member_count: count, observed_count: count, account_count: count, catalog_count: count,
  invalid_count: z.literal(0), cost_yuan: metric, cash_yuan: metric, show: metric, click: metric, conv: metric, target: metric,
  missing_price_count: count, price_count: count, unique_price: metric,
  determinable_count: count.nullable(), on_target_count: count.nullable(), day_over_count: count,
}).strict();
type Row = z.infer<typeof rowSchema>;
function invalid(): never { throw new Error("Invalid window aggregate evidence"); }
function dates(from: string, to: string) {
  const days: string[] = [];
  for (let day = Date.parse(from); day <= Date.parse(to); day += 86400000) days.push(new Date(day).toISOString().slice(0, 10));
  return days;
}
function equalMetric(actual: number | null, expected: number | null) {
  if (actual === null || expected === null) return actual === expected;
  return Number.isFinite(expected) && Math.abs(actual - expected) <= Math.max(0.000001, Math.abs(actual) * Number.EPSILON * 16);
}
function checkRow(row: Row) {
  if (row.expected_count !== row.member_count || row.observed_count > row.member_count ||
    row.account_count > row.catalog_count || row.account_count > row.observed_count ||
    row.missing_price_count > row.member_count || row.price_count > row.member_count - row.missing_price_count ||
    (row.price_count === 1) !== (row.unique_price !== null) ||
    (row.member_count > row.missing_price_count && row.price_count === 0)) invalid();
  // The target is complete iff every price and BI conversion is present. SQL
  // supplies invalid_count before missing propagation, so overflow is not null.
  const targetKnown = row.member_count > 0 && row.missing_price_count === 0 && row.conv !== null;
  if ((row.target !== null) !== targetKnown) invalid();
  if (row.catalog_count === 0 && metrics.some((key) => row[key] !== null)) invalid();
  if (row.kind === "day") {
    if (row.ds === null || row.member_count !== row.catalog_count || row.determinable_count !== null || row.on_target_count !== null ||
      row.day_over_count !== Number(row.cash_yuan !== null && row.target !== null && row.cash_yuan > row.target)) invalid();
  } else if (row.ds !== null || row.determinable_count === null || row.on_target_count === null ||
    row.on_target_count > row.determinable_count || row.determinable_count > row.account_count) invalid();
}

function rowSummary(row: Row) {
  const base = canonicalSummaryBaseRow({ row_count: row.observed_count, account_count: row.account_count,
    cost_yuan: row.cost_yuan, cash_yuan: row.cash_yuan, show: row.show, click: row.click, conv: row.conv }, "ka_data");
  const completePrices = row.member_count > 0 && row.missing_price_count === 0;
  const reason = !completePrices ? "assessment_missing" : row.cash_yuan === null ? "cash_missing" : row.target === null
    ? "conversion_missing" : row.cash_yuan > row.target ? "window_over" : row.day_over_count > 0 ? "day_over_window_ok" : "window_ok";
  const determined = reason === "window_ok" || reason === "day_over_window_ok" || reason === "window_over";
  const costSpace = metricValue(
    row.cash_yuan === null || row.target === null ? null : row.target - row.cash_yuan);
  // v1.9.27 ③（Q-041 ②）：KA 这条路自己拼 assessment（不走 computeWeightedAssessment），
  // 三个 BI 值也必须在这儿补齐——少发它们前端只会静悄悄显「−」，看不出是后端没算。
  // 用的是同一个算术入口，口径与个人源那条路一致。
  const bi = dashboardBiFrom(base.metrics.cashCost, base.metrics.realConversion, costSpace);
  return summaryWindowRowSchema.parse({ ...base, metrics: { ...base.metrics, costSpace },
    assessment: { priceSource: "ka_daily", price: completePrices && row.price_count === 1
      ? { value: row.unique_price, effectiveDate: null } : null,
    ...(completePrices && row.price_count > 1 ? { priceVersions: row.price_count } : {}),
    onTarget: determined ? reason !== "window_over" : null,
    costStatus: !determined ? null : reason === "window_over" ? "red" : reason === "day_over_window_ok" ? "yellow" : "green",
    costStatusReason: reason, budgetUsageRate: ratioUnknown,
    biConv: bi.bi_conv, biCashCost: bi.bi_cash_cost, overCost: bi.over_cost },
  });
}

/** Strict internal proof decoder. Does not claim complete team inventory. */
export function assembleKaWindowAggregates(input: unknown, plan: KaDataWindowQueryPlan, compare?: WindowComparisonMode) {
  const expectedPrevious = compare === undefined ? null : comparisonWindow(plan.window, compare);
  if (JSON.stringify(expectedPrevious) !== JSON.stringify(plan.previousWindow)) invalid();
  const rows = z.array(rowSchema).min(1).max(10000).parse(input);
  const windows = { current: plan.window, ...(plan.previousWindow === null ? {} : { previous: plan.previousWindow }) };
  const periods = new Map<string, { window: Row; days: Row[] }>();
  for (const row of rows) {
    checkRow(row);
    const window = windows[row.period as keyof typeof windows];
    if (window === undefined || row.date_from !== window.from || row.date_to !== window.to ||
      (row.ds !== null && (row.ds < window.from || row.ds > window.to))) invalid();
  }
  for (const [period, window] of Object.entries(windows)) {
    const group = rows.filter((row) => row.period === period), totals = group.filter((row) => row.kind === "window");
    if (totals.length !== 1) invalid();
    const total = totals[0]!, days = group.filter((row) => row.kind === "day").sort((a, b) => a.ds!.localeCompare(b.ds!));
    const expectedDates = total.catalog_count === 0 ? [] : dates(window.from, window.to);
    if (total.expected_count !== total.catalog_count * dates(window.from, window.to).length ||
      JSON.stringify(days.map((row) => row.ds)) !== JSON.stringify(expectedDates) ||
      days.some((row) => row.catalog_count !== total.catalog_count) ||
      total.observed_count !== days.reduce((n, row) => n + row.observed_count, 0) ||
      total.missing_price_count !== days.reduce((n, row) => n + row.missing_price_count, 0) ||
      total.day_over_count !== days.reduce((n, row) => n + row.day_over_count, 0) ||
      total.account_count < Math.max(0, ...days.map((row) => row.account_count)) ||
      total.account_count > days.reduce((n, row) => n + row.account_count, 0) ||
      total.price_count < Math.max(0, ...days.map((row) => row.price_count)) ||
      total.price_count > days.reduce((n, row) => n + row.price_count, 0)) invalid();
    for (const key of metrics) {
      const expected = days.length === 0 || days.some((row) => row[key] === null) ? null : days.reduce((n, row) => n + row[key]!, 0);
      if (!equalMetric(total[key], expected)) invalid();
    }
    if (total.price_count === 1 && days.some((row) => row.unique_price !== null && row.unique_price !== total.unique_price)) invalid();
    periods.set(period, { window: total, days });
  }
  const current = periods.get("current")!, previous = periods.get("previous");
  if (previous !== undefined) {
    if (previous.window.catalog_count !== current.window.catalog_count) invalid();
    // Overlapping calendar days must be identical evidence, not separate reads.
    const values = ({ period: _period, date_from: _from, date_to: _to, ...rest }: Row) => {
      void _period; void _from; void _to; return rest;
    };
    for (const day of current.days) {
      const other = previous.days.find((row) => row.ds === day.ds);
      if (other && JSON.stringify(values(day)) !== JSON.stringify(values(other))) invalid();
    }
  }
  const summary = rowSummary(current.window);
  const point = (row: Row) => {
    const metrics = rowSummary(row).metrics;
    return { cost: metrics.cost, cashCost: metrics.cashCost, realConversion: metrics.realConversion, cashCpa: metrics.ratios.cashCpa,
      onTargetRate: !row.determinable_count ? ratioUnknown : { value: row.on_target_count! / row.determinable_count, state: "finite" as const } };
  };
  const comparison = compare === undefined ? undefined : previous === undefined ? unavailableWindowComparison(compare)
    : compareWindowPoints(compare, point(current.window), point(previous.window));
  return { row: summaryWindowRowSchema.parse({ ...summary, ...(comparison === undefined ? {} : { compare: comparison }) }),
    trend: current.days.map((day) => ({ ds: day.ds!, metrics: rowSummary(day).metrics })),
    returnedObjects: current.window.account_count,
    warnings: [...(summary.assessment.priceVersions === undefined ? [] : ["ASSESSMENT_VERSION_UNKNOWN"]), "BUDGET_SOURCE_NOT_READY"],
  };
}
