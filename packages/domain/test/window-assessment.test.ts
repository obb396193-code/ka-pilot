import { describe, expect, it } from "vitest";
import { metricValue as mv } from "../src/metric-value.js";
import { computeWindowAssessment, comparisonWindow, unavailableWindowComparison } from "../src/window-assessment.js";
import { windowAssessmentSchema, queryWindowSchema } from "../src/summary-window.js";

const missingRatio = { value: null, state: "undefined" as const };
const day = (ds = "2026-09-01", cash = 10, conversions = 1, price = 20, key = "history-1") => ({ ds, cashCost: mv(cash), realConversion: mv(conversions), price: { value: price, effectiveDate: "2026-09-01", versionKey: key } });
describe("v1.7.2 daily effective price aggregation", () => {
  it("does not apply the last price to the whole window or average daily CPA", () => {
    const out = computeWindowAssessment([day("2026-09-01", 10, 1, 20), day("2026-09-02", 150, 9, 10, "history-2")]);
    expect(out.costSpace).toEqual(mv(-50));
    expect(out.assessment).toEqual({ price: null, priceVersions: 2, onTarget: false, costStatus: "red", costStatusReason: "window_over", budgetUsageRate: missingRatio });
  });
  it("preserves unique version metadata but flags a daily aggregate breach inside a good window", () => {
    const out = computeWindowAssessment([day("2026-09-01", 30), day("2026-09-02", 0)]);
    expect(out.costSpace).toEqual(mv(10));
    expect(out.assessment).toMatchObject({ price: { value: 20, effectiveDate: "2026-09-01" }, onTarget: true, costStatus: "yellow", costStatusReason: "day_over_window_ok" });
    expect(out.assessment).not.toHaveProperty("priceVersions");
  });
  it("daily status is an aggregate, not one over-target account inside an otherwise good day", () => {
    expect(computeWindowAssessment([day("2026-09-01", 30), day("2026-09-01", 0)]).assessment.costStatus).toBe("green");
  });
  it("same numeric price and date but distinct source history versions remain mixed", () => {
    expect(computeWindowAssessment([day(), day("2026-09-02", 10, 1, 20, "history-2")]).assessment).toMatchObject({ price: null, priceVersions: 2, onTarget: true });
  });
  it("rejects contradictory metadata for one version and a price effective in the future", () => {
    expect(() => computeWindowAssessment([day(), day("2026-09-02", 10, 1, 40)])).toThrow();
    expect(() => computeWindowAssessment([{ ...day(), price: { ...day().price, effectiveDate: "2026-09-02" } }])).toThrow();
  });
  it("missing price, cash, conversions and empty sets never fabricate a target result", () => {
    expect(computeWindowAssessment([{ ...day(), price: null }]).assessment).toMatchObject({ onTarget: null, costStatusReason: "assessment_missing" });
    for (const field of ["cashCost", "realConversion"] as const) {
      const out = computeWindowAssessment([day(), { ...day("2026-09-02"), [field]: mv(null) }]);
      expect(out.costSpace).toEqual(mv(null)); expect(out.assessment.onTarget).toBeNull();
    }
    expect(computeWindowAssessment([]).costSpace).toEqual(mv(null));
    expect(computeWindowAssessment([]).assessment.onTarget).toBeNull();
  });
  it("real zero and positive cash with zero conversions obey the frozen weighted inequality", () => {
    expect(computeWindowAssessment([day("2026-09-01", 0, 0)]).assessment.onTarget).toBe(true);
    expect(computeWindowAssessment([day("2026-09-01", 1, 0)]).assessment.onTarget).toBe(false);
  });
  it("distinguishes missing conversions from missing cash under v1.7.4", () => {
    const conversionMissing = computeWindowAssessment([{ ...day(), realConversion: mv(null) }]);
    expect(conversionMissing.assessment).toMatchObject({ costStatusReason: "conversion_missing", onTarget: null, costStatus: null });
    expect(conversionMissing.costSpace).toEqual(mv(null));
    expect(computeWindowAssessment([{ ...day(), cashCost: mv(null) }]).assessment.costStatusReason).toBe("cash_missing");
    expect(computeWindowAssessment([{ ...day(), cashCost: mv(null), realConversion: mv(null) }]).assessment.costStatusReason).toBe("cash_missing");
    expect(computeWindowAssessment([{ ...day(), price: null, realConversion: mv(null) }]).assessment.costStatusReason).toBe("assessment_missing");
  });
  it("conversion_missing is valid only with unknown target/status", () => {
    const valid = { ...computeWindowAssessment([day()]).assessment, costStatusReason: "conversion_missing", onTarget: null, costStatus: null };
    expect(windowAssessmentSchema.safeParse(valid).success).toBe(true);
    expect(windowAssessmentSchema.safeParse({ ...valid, onTarget: true, costStatus: "green" }).success).toBe(false);
  });
  it("bad fields, overflow, and impossible mixed-price metadata are rejected", () => {
    expect(() => computeWindowAssessment([{ ...day(), cashCost: { value: "10", availability: "available" } }])).toThrow();
    expect(() => computeWindowAssessment([day("2026-09-01", 1, Number.MAX_VALUE, Number.MAX_VALUE)])).toThrow();
    const valid = computeWindowAssessment([day()]).assessment;
    expect(windowAssessmentSchema.safeParse({ ...valid, priceVersions: 2 }).success).toBe(false);
    expect(windowAssessmentSchema.safeParse({ ...valid, price: null, priceVersions: 1 }).success).toBe(false);
  });
});
describe("window comparison alignment", () => {
  it("shifts both endpoints by one/seven days, including leap dates", () => {
    expect(comparisonWindow({ from: "2024-03-01", to: "2024-03-07" }, "dod")).toEqual({ from: "2024-02-29", to: "2024-03-06", preset: "custom" });
    expect(comparisonWindow({ from: "2024-03-01", to: "2024-03-07" }, "wow")).toEqual({ from: "2024-02-23", to: "2024-02-29", preset: "custom" });
  });
  it("today has no comparable daily snapshot and preset defaults to custom", () => {
    expect(comparisonWindow({ from: "2026-09-06", to: "2026-09-06", preset: "today" }, "dod")).toBeNull();
    expect(queryWindowSchema.parse({ from: "2026-09-01", to: "2026-09-01" }).preset).toBe("custom");
    expect(Object.values(unavailableWindowComparison("dod").deltas)).toEqual(Array(5).fill(missingRatio));
  });
});
