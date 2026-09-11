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
    // v1.9.27 ③（Q-041 ②）：三个 BI 值与考核结论同源同批地一起出——
    // 现金 160、BI 数 10、成本空间 −50 ⇒ 超成本 50、BI 现金成本 16。
    expect(out.assessment).toEqual({ priceSource: "history", price: null, priceVersions: 2, onTarget: false,
      costStatus: "red", costStatusReason: "window_over", budgetUsageRate: missingRatio,
      biConv: mv(10), biCashCost: { value: 16, state: "finite" }, overCost: mv(50) });
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
      // v1.9.35：缺一天不再让整窗变「−」——给的是有数那部分的和并标 partial，
      // 但**判定一律挂起**（拿半个窗口的花费跟整窗目标比，结论必错且看不出来）。
      const out = computeWindowAssessment([day(), { ...day("2026-09-02"), [field]: mv(null) }]);
      expect(out.costSpace.availability).toBe("partial");
      expect(out.assessment.onTarget).toBeNull();
      expect(out.assessment.costStatus).toBeNull();
      expect(out.assessment.costStatusReason).toBe("partial_data");
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

    // v1.9.27 ①（Q-041 ③）prev_window：等长、紧邻的前一窗口。
    expect(comparisonWindow({ from: "2026-09-04", to: "2026-09-10" }, "prev_window"))
      .toEqual({ from: "2026-08-28", to: "2026-09-03", preset: "custom" });
    // month_to_date 例外：前窗是**上月同样天数**（9/1–9/10 → 8/1–8/10），
    // 不是往前平移 10 天（那会落到 8/22–8/31，既不是上月同期也不是完整口径）。
    expect(comparisonWindow({ from: "2026-09-01", to: "2026-09-10", preset: "month_to_date" }, "prev_window"))
      .toEqual({ from: "2026-08-01", to: "2026-08-10", preset: "custom" });
    // 上月天数不够就到月末为止，不借下个月的天（3/1–3/31 的前窗是 2 月 29 天）。
    expect(comparisonWindow({ from: "2024-03-01", to: "2024-03-31", preset: "month_to_date" }, "prev_window"))
      .toEqual({ from: "2024-02-01", to: "2024-02-29", preset: "custom" });
    // 单日窗口的前窗就是前一天。
    expect(comparisonWindow({ from: "2026-09-10", to: "2026-09-10" }, "prev_window"))
      .toEqual({ from: "2026-09-09", to: "2026-09-09", preset: "custom" });
    // today 没有可比的快照，三种模式一律 null——不拿昨天冒充。
    expect(comparisonWindow({ from: "2026-09-10", to: "2026-09-10", preset: "today" }, "prev_window")).toBeNull();
    // 未知模式必须抛，不能悄悄当成 dod。
    expect(() => comparisonWindow({ from: "2026-09-10", to: "2026-09-10" }, "nope" as never)).toThrow();
  });
  it("today has no comparable daily snapshot and preset defaults to custom", () => {
    expect(comparisonWindow({ from: "2026-09-06", to: "2026-09-06", preset: "today" }, "dod")).toBeNull();
    expect(queryWindowSchema.parse({ from: "2026-09-01", to: "2026-09-01" }).preset).toBe("custom");
    expect(Object.values(unavailableWindowComparison("dod").deltas)).toEqual(Array(5).fill(missingRatio));
  });
});
