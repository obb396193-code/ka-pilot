import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { metricValue as mv } from "../src/metric-value.js";
import type { RatioValue } from "../src/types.js";
import {
  aggregateWindowMetrics, compareWindowPoints, summaryWindowRowSchema,
  trendWindowRowSchema, queryWindowSchema,
} from "../src/summary-window.js";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../contract/fixtures/data-query/${name}.json`, import.meta.url), "utf8"));
const metrics = () => structuredClone(fixture("summary-window-v3-green").data.source.rows[0].metrics);
const finite = (value: number): RatioValue => ({ value, state: "finite" });
const missing = { value: null, state: "undefined" as const };
const point = () => ({ cost: mv(100), cashCost: mv(80), realConversion: mv(2), cashCpa: finite(40), onTargetRate: finite(0.5) });

describe("frozen v3 window row boundary (not the public route switch)", () => {
  it.each(["green", "yellow", "cash-missing"])("reads arch %s fixture directly", (kind) => {
    const source = fixture(`summary-window-v3-${kind}`).data.source;
    expect(summaryWindowRowSchema.parse(source.rows[0])).toEqual(source.rows[0]);
    expect(queryWindowSchema.parse(source.lineage.window)).toEqual(source.lineage.window);
  });
  it("reads flat trend metrics instead of the old nested summary object", () => {
    const rows = fixture("trend-v3").data.source.rows;
    for (const row of rows) expect(trendWindowRowSchema.parse(row)).toEqual(row);
    expect(trendWindowRowSchema.safeParse({ ds: "2026-09-01", metrics: { metrics: metrics() } }).success).toBe(false);
  });
  it.each(["2026-02-31", "2025-02-29", "bad", "2026-13-01"])("rejects calendar date %s", (date) => {
    expect(queryWindowSchema.safeParse({ from: date, to: date }).success).toBe(false);
    expect(trendWindowRowSchema.safeParse({ ds: date, metrics: metrics() }).success).toBe(false);
  });
  it("rejects reversed windows and unknown fields/presets", () => {
    for (const window of [{ from: "2026-09-02", to: "2026-09-01" }, { from: "2026-09-01", to: "2026-09-02", preset: "weekly" }, { from: "2026-09-01", to: "2026-09-02", workspaceId: "spoof" }]) expect(queryWindowSchema.safeParse(window).success).toBe(false);
    expect(queryWindowSchema.parse({ from: "2024-02-29", to: "2024-02-29" })).toEqual({ from: "2024-02-29", to: "2024-02-29", preset: "custom" });
  });
  it("rejects missing blocks, invalid numbers and impossible assessment states", () => {
    const row = fixture("summary-window-v3-green").data.source.rows[0];
    for (const bad of [{ ...row, assessment: undefined }, { ...row, arbitrary: 1 }, { ...row, assessment: { ...row.assessment, costStatus: "red" } }, { ...row, assessment: { ...row.assessment, price: { value: 38, effectiveDate: "2026-02-31" } } }, { ...row, metrics: { ...row.metrics, cost: { value: "100", availability: "available" } } }]) expect(summaryWindowRowSchema.safeParse(bad).success).toBe(false);
  });
  it("cannot declare an on-target status when cash is unavailable", () => {
    const row = fixture("summary-window-v3-green").data.source.rows[0];
    for (const availability of ["missing", "error"]) {
      expect(summaryWindowRowSchema.safeParse({ ...row, metrics: { ...row.metrics, cashCost: { value: null, availability } } }).success).toBe(false);
    }
  });
});

describe("window arithmetic never averages daily CPA", () => {
  it("adds ordinary metrics first and rebuilds ratios", () => {
    const first = metrics(), second = metrics();
    first.cost = mv(100); first.cashCost = mv(80); first.realConversion = mv(1);
    second.cost = mv(100); second.cashCost = mv(80); second.realConversion = mv(9);
    const sum = aggregateWindowMetrics([first, second]);
    expect(sum.cost).toEqual(mv(200)); expect(sum.cashCost).toEqual(mv(160));
    expect(sum.ratios.realCpa).toEqual(finite(20)); expect(sum.ratios.cashCpa).toEqual(finite(16));
    expect(sum.wakeUv).toEqual(mv(null)); expect(sum.ratios.potentialRate).toEqual(missing);
  });
  it.each(["missing", "error"])("preserves %s members as missing aggregate, not partial sum", (availability) => {
    const second = metrics(); second.cashCost = { value: null, availability };
    expect(aggregateWindowMetrics([metrics(), second]).cashCost).toEqual(mv(null));
    expect(aggregateWindowMetrics([metrics(), second]).ratios.cashCpa).toEqual(missing);
  });
  it("empty/zero/infinite remain different", () => {
    expect(aggregateWindowMetrics([]).cost).toEqual(mv(null));
    const zero = metrics(); zero.cost = mv(0); zero.cashCost = mv(0); zero.realConversion = mv(0);
    expect(aggregateWindowMetrics([zero]).cashCost).toEqual(mv(0));
    expect(aggregateWindowMetrics([zero]).ratios.cashCpa).toEqual(missing);
    zero.cashCost = mv(1);
    expect(aggregateWindowMetrics([zero]).ratios.cashCpa).toEqual({ value: null, state: "infinite" });
  });
  it("present-invalid and overflow fail closed", () => {
    for (const value of ["100", NaN, Infinity]) {
      const bad = metrics(); bad.cost = { value, availability: "available" };
      expect(() => aggregateWindowMetrics([bad])).toThrow();
    }
    const large = metrics(); large.cost = mv(Number.MAX_VALUE);
    expect(() => aggregateWindowMetrics([large, large])).toThrow();
  });
});

describe("v3 compare canonical ratios", () => {
  it("onTargetRate is a percentage-point difference even when the previous rate is zero", () => {
    const previous = { ...point(), onTargetRate: finite(0) };
    expect(compareWindowPoints("dod", { ...point(), onTargetRate: finite(1) }, previous).deltas.onTargetRate).toEqual(finite(1));
    expect(compareWindowPoints("dod", previous, previous).deltas.onTargetRate).toEqual(finite(0));
  });
  it.each(["dod", "wow"] as const)("%s uses relative amounts but absolute ratio differences", (mode) => {
    const current = point(); current.cost = mv(120); current.cashCpa = finite(42); current.onTargetRate = finite(0.8);
    const result = compareWindowPoints(mode, current, point());
    expect(result.mode).toBe(mode); expect(result.deltas.cost).toEqual(finite(0.2));
    expect(result.deltas.cashCpa).toEqual(finite(2)); expect(result.deltas.onTargetRate.value).toBeCloseTo(0.3);
  });
  it("zero previous produces NEW, zero/zero 0, missing side undefined", () => {
    const previous = point(); previous.cost = mv(0); previous.cashCost = mv(0); previous.cashCpa = finite(0); previous.realConversion = mv(null);
    const current = point(); current.cashCost = mv(0); current.onTargetRate = missing;
    const result = compareWindowPoints("dod", current, previous);
    expect(result.deltas.cost).toEqual({ value: null, state: "infinite" });
    expect(result.deltas.cashCost).toEqual(finite(0)); expect(result.deltas.cashCpa.state).toBe("infinite");
    expect(result.deltas.realConversion).toEqual(missing); expect(result.deltas.onTargetRate).toEqual(missing);
  });
  it("does not compare infinite ratio values as numbers and rejects malformed inputs", () => {
    const current = { ...point(), cashCpa: { value: null, state: "infinite" as const } };
    expect(compareWindowPoints("dod", current, point()).deltas.cashCpa).toEqual(missing);
    expect(() => compareWindowPoints("dod", { ...point(), cost: { value: "bad", availability: "available" } }, point())).toThrow();
  });
});
