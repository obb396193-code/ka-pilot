import { describe, expect, it } from "vitest";
import { metricValue } from "../src/metric-value.js";
import { evaluateRuleDailyEvidence, planRuleDailyEvidence } from "../src/rule-daily-evidence.js";

const window = { from: "2026-09-07", to: "2026-09-08", preset: "custom" };
const leaf = { metric: "cash_cpa", operator: ">", threshold: "assessment_price" };
const tree = { version: "v1", all: [leaf] };
const unknown = { value: null, state: "undefined" };
function day(ds: string, cash: number | null, conv: number | null, price = 20) {
  return { ds, metrics: {
    cost: metricValue(null), cashCost: metricValue(cash), realConversion: metricValue(conv), conversion: metricValue(null),
    exposure: metricValue(null), click: metricValue(null), wakeUv: metricValue(null), potentialUv: metricValue(null), costSpace: metricValue(null),
    ratios: { ctr: unknown, cvr: unknown, realCpa: unknown, cashCpa: unknown, gap: unknown, potentialRate: unknown, biConversionRate: unknown },
  }, assessment: { ds, cashCost: metricValue(cash), realConversion: metricValue(conv),
    price: { value: price, effectiveDate: ds, versionKey: ds } } };
}
describe("daily rule evidence", () => {
  it("uses explicit base window and conversion-weighted price, not average daily CPA/price", () => {
    const result = evaluateRuleDailyEvidence(tree, window, [day(window.from, 10, 1, 10), day(window.to, 100, 3, 30)]);
    expect(result.pass).toBe(true);
    expect(result.leaves[0]).toMatchObject({ value: { value: 27.5, state: "finite" }, threshold: { value: 25, state: "finite" } });
  });
  it("plans separate consecutive windows and includes threshold reads", () => {
    const plan = planRuleDailyEvidence({ version: "v1", all: [{ ...leaf, window_hours: 24, consecutive_days: 2 }] }, window);
    expect(plan.window).toMatchObject({ from: "2026-09-07", to: "2026-09-08" });
    expect(plan.reads.map(r => [r.request.metric, r.from, r.to])).toEqual([
      ["cash_cpa", window.to, window.to], ["assessment_price", window.to, window.to],
      ["cash_cpa", window.from, window.from], ["assessment_price", window.from, window.from],
    ]);
    const result = evaluateRuleDailyEvidence({ version: "v1", all: [{ ...leaf, window_hours: 24, consecutive_days: 2 }] }, window,
      [day(window.from, 10, 1), day(window.to, 100, 1)]);
    expect(result.pass).toBe(false); expect(result.leaves.map(l => l.pass)).toEqual([true, false]);
  });
  it("keeps positive cash/zero conversion infinite and zero/zero undefined", () => {
    const single = { from: window.to, to: window.to, preset: "custom" };
    const literal = { version: "v1", all: [{ ...leaf, threshold: 20 }] };
    expect(evaluateRuleDailyEvidence(literal, single, [day(single.to, 10, 0)])).toMatchObject({ pass: true,
      leaves: [{ value: { value: null, state: "infinite" } }] });
    expect(evaluateRuleDailyEvidence(literal, single, [day(single.to, 0, 0)])).toMatchObject({ pass: null, reason: "METRIC_MISSING" });
    expect(evaluateRuleDailyEvidence(tree, single, [day(single.to, 10, 0)])).toMatchObject({ pass: null,
      leaves: [{ threshold: { value: null, state: "undefined" } }] });
  });
  it("does not treat a missing cash day as zero or short circuit it under any", () => {
    const any = { version: "v1", any: [{ metric: "real_conversion", operator: ">", threshold: 0 }, leaf] };
    expect(evaluateRuleDailyEvidence(any, window, [day(window.from, null, 1), day(window.to, 100, 3)])).toMatchObject({ pass: null, reason: "METRIC_MISSING" });
  });
  it("allows weighted assessment evidence without cash, but missing conversion/price stays undefined", () => {
    const explicit = { version: "v1", all: [{ metric: "assessment_price", operator: ">", threshold: 15 }] };
    expect(evaluateRuleDailyEvidence(explicit, window, [day(window.from, null, 1), day(window.to, null, 1)])).toMatchObject({ pass: true });
    const rows = [day(window.from, 20, 1), { ...day(window.to, 20, 1), assessment: { ...day(window.to, 20, 1).assessment, price: null } }];
    expect(evaluateRuleDailyEvidence(explicit, window, rows)).toMatchObject({ pass: null });
  });
  it("unknown/unimplemented metric stays missing, no source fallback", () => {
    const unknownTree = { version: "v1", all: [{ metric: "account_budget", operator: ">", threshold: 0 }] };
    expect(evaluateRuleDailyEvidence(unknownTree, window, [day(window.from, 10, 1), day(window.to, 10, 1)])).toMatchObject({ pass: null,
      leaves: [{ value: { value: null, availability: "missing" } }] });
  });
  it("derives cost space using each effective price, ignoring cached costSpace", () => {
    const costTree = { version: "v1", all: [{ metric: "cost_space", operator: "==", threshold: -10 }] };
    expect(evaluateRuleDailyEvidence(costTree, window, [day(window.from, 10, 1, 10), day(window.to, 100, 3, 30)]).pass).toBe(true);
  });
  it.each([1, 23, 25])("rejects %s hour requests before accepting daily evidence", hours => {
    expect(() => planRuleDailyEvidence({ version: "v1", all: [{ ...leaf, window_hours: hours }] }, window)).toThrow("HOURLY_SOURCE_REQUIRED");
  });
  it("bounds total consecutive read range and rejects invalid base date", () => {
    expect(() => planRuleDailyEvidence({ version: "v1", all: [{ ...leaf, consecutive_days: 31 }] }, window)).toThrow("WINDOW_UNSUPPORTED");
    expect(() => planRuleDailyEvidence(tree, { ...window, from: "2026-02-31" })).toThrow();
    expect(() => planRuleDailyEvidence({ version: "v1", all: [{ ...leaf, window_hours: Number.MAX_SAFE_INTEGER - 7 }] }, window)).toThrow();
  });
  it.each(["missing", "duplicate", "foreign", "inconsistent", "invalid"])("rejects %s daily set rather than silently dropping rows", kind => {
    const rows: unknown[] = [day(window.from, 10, 1), day(window.to, 10, 1)];
    if (kind === "missing") rows.pop();
    if (kind === "duplicate") rows.push(rows[0]);
    if (kind === "foreign") rows[0] = day("2026-09-06", 10, 1);
    if (kind === "inconsistent") rows[0] = { ...day(window.from, 10, 1), assessment: day(window.to, 99, 1).assessment };
    if (kind === "invalid") rows[0] = { ...day(window.from, 10, 1), ds: "2026-02-31" };
    expect(() => evaluateRuleDailyEvidence(tree, window, rows)).toThrow();
  });
});
