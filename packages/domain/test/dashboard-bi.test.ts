import { describe, expect, it } from "vitest";
import { computeDashboardBi, dashboardBiSchema } from "../src/dashboard-bi.js";
import { metricValue as mv } from "../src/metric-value.js";

// Synthetic account-days, never upstream identities or production finance data.
const day = (ds = "2026-09-01", cash = 80, bi = 2, price = 30) => ({
  ds, cashCost: mv(cash), realConversion: mv(bi),
  price: { value: price, effectiveDate: ds, versionKey: ds },
});
const history = (days: unknown[] = [day()]) => ({ priceSource: "history", days });
const ka = (days = [day()]) => ({ priceSource: "ka_daily", days: days.map(row => ({ ...row, price: row.price.value })) });
const finite = (value: number) => ({ value, state: "finite" });
const undefinedRatio = { value: null, state: "undefined" };

describe("P211 source-neutral BI arithmetic (not a public HTTP envelope)", () => {
  it("both price sources produce the same exact three fields", () => {
    const expected = { bi_conv: mv(2), bi_cash_cost: finite(40), over_cost: mv(20) };
    expect(computeDashboardBi(history())).toEqual(expected);
    expect(computeDashboardBi(ka())).toEqual(expected);
    expect(dashboardBiSchema.parse(expected)).toEqual(expected);
  });
  it("weights each day by its effective price, not the latest price or average CPA", () => {
    const rows = [day("2026-09-01", 80, 1, 30), day("2026-09-02", 20, 9, 5)];
    const expected = { bi_conv: mv(10), bi_cash_cost: finite(10), over_cost: mv(25) };
    expect(computeDashboardBi(history(rows))).toEqual(expected);
    expect(computeDashboardBi(ka(rows))).toEqual(expected);
  });
  it("does not confuse two same-day account prices with one global representative price", () => {
    const rows = [day("2026-09-01", 80, 2, 30), { ...day("2026-09-01", 20, 3, 5), price: { value: 5, effectiveDate: "2026-09-01", versionKey: "other-task-v1" } }];
    expect(computeDashboardBi(history(rows)).over_cost).toEqual(mv(25));
    expect(computeDashboardBi(ka(rows)).over_cost).toEqual(mv(25));
  });
  it("under target is negative and exact target is positive zero", () => {
    expect(computeDashboardBi(history([day(undefined, 30, 2, 30)])).over_cost).toEqual(mv(-30));
    const exact = computeDashboardBi(history([day(undefined, 60, 2, 30)])).over_cost.value;
    expect(exact).toBe(0); expect(Object.is(exact, -0)).toBe(false);
  });
  it("keeps zero, absent and infinite distinct", () => {
    expect(computeDashboardBi(history([]))).toEqual({ bi_conv: mv(null), bi_cash_cost: undefinedRatio, over_cost: mv(null) });
    expect(computeDashboardBi(history([day(undefined, 0, 0)]))).toEqual({ bi_conv: mv(0), bi_cash_cost: undefinedRatio, over_cost: mv(0) });
    expect(computeDashboardBi(history([day(undefined, 80, 0)]))).toEqual({ bi_conv: mv(0), bi_cash_cost: { value: null, state: "infinite" }, over_cost: mv(80) });
  });
  it.each(["missing", "error"] as const)("never sums around a %s BI member", availability => {
    expect(computeDashboardBi(history([day(), { ...day(), realConversion: { value: null, availability } }]))).toEqual({
      bi_conv: mv(null), bi_cash_cost: undefinedRatio, over_cost: mv(null),
    });
  });
  it.each(["missing", "error"] as const)("%s cash does not erase available BI", availability => {
    expect(computeDashboardBi(history([{ ...day(), cashCost: { value: null, availability } }]))).toEqual({
      bi_conv: mv(2), bi_cash_cost: undefinedRatio, over_cost: mv(null),
    });
  });
  it.each(["history", "ka_daily"])("missing %s price only blocks over_cost", priceSource => {
    expect(computeDashboardBi({ priceSource, days: [{ ...day(), price: null }] })).toEqual({
      bi_conv: mv(2), bi_cash_cost: finite(40), over_cost: mv(null),
    });
  });
  it("rejects contradictory version evidence and future prices", () => {
    expect(() => computeDashboardBi(history([day(), { ...day(), price: { value: 99, effectiveDate: "2026-09-01", versionKey: "2026-09-01" } }]))).toThrow();
    expect(() => computeDashboardBi(history([{ ...day(), price: { value: 30, effectiveDate: "2026-09-02", versionKey: "future" } }]))).toThrow();
  });
  it.each(["2026-02-31", "2025-02-29", "bad"])("rejects non-calendar day %s", ds => {
    expect(() => computeDashboardBi(history([day(ds)]))).toThrow();
    expect(() => computeDashboardBi(ka([day(ds)]))).toThrow();
  });
  it.each([NaN, Infinity, -Infinity, "10", false])("rejects present-invalid %s", value => {
    for (const field of ["cashCost", "realConversion"]) expect(() => computeDashboardBi(history([{ ...day(), [field]: { value, availability: "available" } }]))).toThrow();
    expect(() => computeDashboardBi({ priceSource: "ka_daily", days: [{ ...day(), price: value }] })).toThrow();
  });
  it("strict input never accepts book conversion aliases or client scope as evidence", () => {
    for (const bad of [{ ...history(), workspaceId: "spoof" }, { ...history(), priceSource: "fallback" }, history([{ ...day(), conversion: mv(200) }]), history([{ ...day(), cost: mv(100) }]), history([{ ...day(), realConversion: undefined }])]) {
      expect(() => computeDashboardBi(bad)).toThrow();
    }
  });
  it("fails closed on aggregation, multiplication and division overflow", () => {
    for (const rows of [[day(undefined, Number.MAX_VALUE), day(undefined, Number.MAX_VALUE)], [day(undefined, 1, Number.MAX_VALUE, 2)], [day(undefined, Number.MAX_VALUE, Number.MIN_VALUE, 0)]]) {
      expect(() => computeDashboardBi(history(rows))).toThrow();
      expect(() => computeDashboardBi(ka(rows))).toThrow();
    }
  });
  it("accepts the proven 10000 member bound, rejects 10001, and does not mutate", () => {
    const input = history(Array.from({ length: 10000 }, () => day()));
    const before = structuredClone(input);
    expect(computeDashboardBi(input).bi_conv).toEqual(mv(20000));
    expect(input).toEqual(before);
    expect(() => computeDashboardBi(history([...input.days, day()]))).toThrow();
  });
  it("strict output rejects missing, additional and contradictory fields", () => {
    const valid = computeDashboardBi(history());
    for (const bad of [{ ...valid, bi_conv: undefined }, { ...valid, extra: 1 }, { ...valid, over_cost: { value: 1, availability: "missing" } }, { ...valid, bi_cash_cost: { value: Infinity, state: "finite" } }]) expect(dashboardBiSchema.safeParse(bad).success).toBe(false);
  });
});
