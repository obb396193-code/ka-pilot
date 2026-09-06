import { describe, expect, it } from "vitest";
import { metricValue as mv } from "../src/metric-value.js";
import { computeKaDailyWindowAssessment, computeWindowAssessment } from "../src/window-assessment.js";
import { windowAssessmentSchema } from "../src/summary-window.js";

const day = (ds: string, price: number | null, cash = 10, conv = 1) => ({ ds, cashCost: mv(cash), realConversion: mv(conv), price });
describe("v1.7.4 KA daily assessment without invented history", () => {
  it("uses each day's cash price and conversion weight, never the last price for every day", () => {
    const result = computeKaDailyWindowAssessment([day("2026-09-01", 20, 10, 1), day("2026-09-02", 10, 150, 9)]);
    expect(result.costSpace).toEqual(mv(-50));
    expect(result.assessment).toMatchObject({ priceSource: "ka_daily", price: null, priceVersions: 2, onTarget: false, costStatus: "red" });
    expect(result.warnings).toEqual(["ASSESSMENT_VERSION_UNKNOWN"]);
  });
  it("same price on several days is one observed value, not multiple historical versions", () => {
    const result = computeKaDailyWindowAssessment([day("2026-09-01", 20), day("2026-09-02", 20)]);
    expect(result.assessment).toMatchObject({ priceSource: "ka_daily", price: { value: 20, effectiveDate: null }, onTarget: true });
    expect(result.assessment).not.toHaveProperty("priceVersions"); expect(result.warnings).toEqual([]);
  });
  it("multi-price count is distinct values, not days or row count", () => {
    expect(computeKaDailyWindowAssessment([day("2026-09-01", 10), day("2026-09-02", 20), day("2026-09-03", 10)]).assessment.priceVersions).toBe(2);
  });
  it("preserves yellow when the window is on target but an individual day is not", () => {
    expect(computeKaDailyWindowAssessment([day("2026-09-01", 20, 30), day("2026-09-02", 20, 0)]).assessment).toMatchObject({ onTarget: true, costStatus: "yellow" });
  });
  it("missing prices and metrics stay unknown; genuine zero remains measurable", () => {
    expect(computeKaDailyWindowAssessment([day("2026-09-01", null)]).assessment).toMatchObject({ priceSource: "ka_daily", price: null, onTarget: null, costStatusReason: "assessment_missing" });
    expect(computeKaDailyWindowAssessment([{ ...day("2026-09-01", 20), realConversion: mv(null) }]).assessment.costStatusReason).toBe("conversion_missing");
    expect(computeKaDailyWindowAssessment([day("2026-09-01", 0, 0, 0)]).assessment.onTarget).toBe(true);
    expect(computeKaDailyWindowAssessment([]).assessment.onTarget).toBeNull();
  });
  it.each(["20", NaN, Infinity, {}, undefined])("rejects present-invalid daily price", (price) => {
    expect(() => computeKaDailyWindowAssessment([{ ...day("2026-09-01", 20), price }])).toThrow();
  });
  it("rejects a made-up version/date, impossible calendar date and overflow", () => {
    expect(() => computeKaDailyWindowAssessment([{ ...day("2026-09-01", 20), effectiveDate: "2026-09-01" }])).toThrow();
    expect(() => computeKaDailyWindowAssessment([day("2026-02-31", 20)])).toThrow();
    expect(() => computeKaDailyWindowAssessment([day("2026-09-01", Number.MAX_VALUE, 0, Number.MAX_VALUE)])).toThrow();
  });
  it("priceSource is mandatory and history must contain a real effective date", () => {
    const ka = computeKaDailyWindowAssessment([day("2026-09-01", 20)]).assessment;
    const { priceSource: _source, ...missingSource } = ka; void _source;
    expect(windowAssessmentSchema.safeParse(missingSource).success).toBe(false);
    expect(windowAssessmentSchema.safeParse({ ...ka, priceSource: "history" }).success).toBe(false);
    const historical = computeWindowAssessment([{ ds: "2026-09-01", cashCost: mv(10), realConversion: mv(1), price: { value: 20, effectiveDate: "2026-08-01", versionKey: "real-version" } }]);
    expect(historical.assessment).toMatchObject({ priceSource: "history", price: { effectiveDate: "2026-08-01" } });
  });
});
