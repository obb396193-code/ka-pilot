import { describe, expect, it } from "vitest";
import { canonicalMetricValueSchema, metricValue, sumMetricValues, divideMetricValues } from "../src/metric-value.js";

describe("P0-04 strict metric availability", () => {
  it("distinguishes an observed zero from absent/null", () => {
    expect(metricValue(0)).toEqual({ value: 0, availability: "available" });
    expect(metricValue(null)).toEqual({ value: null, availability: "missing" });
    expect(metricValue(undefined)).toEqual({ value: null, availability: "missing" });
  });
  it.each([
    { value: null, availability: "available" },
    { value: 0, availability: "missing" },
    { value: 1, availability: "error" },
    { value: 0, availability: "stale" },
    { value: null, availability: "denominator_zero" },
    { value: null, availability: "partial" },
    { value: 1, availability: "available", invented: true },
    { value: Number.NaN, availability: "available" },
    { value: Infinity, availability: "available" },
  ])("rejects non-canonical or contradictory state %#", (value) => {
    expect(canonicalMetricValueSchema.safeParse(value).success).toBe(false);
  });
  it("rejects present-but-invalid source values instead of missing", () => {
    for (const value of ["1", "bad", false, Number.NaN, Infinity, {}, []]) {
      expect(() => metricValue(value)).toThrow();
    }
  });
  it("preserves source error but any missing/error aggregate is missing", () => {
    const error = canonicalMetricValueSchema.parse({ value: null, availability: "error" });
    expect(sumMetricValues([metricValue(10), error])).toEqual(metricValue(null));
    expect(sumMetricValues([metricValue(10), metricValue(null)])).toEqual(metricValue(null));
    expect(sumMetricValues([])).toEqual(metricValue(null));
    expect(sumMetricValues([metricValue(0), metricValue(0)])).toEqual(metricValue(0));
    expect(sumMetricValues([metricValue(10), metricValue(5)])).toEqual(metricValue(15));
  });
  it("does not turn overflow into available Infinity or a silent missing", () => {
    expect(() => sumMetricValues([metricValue(Number.MAX_VALUE), metricValue(Number.MAX_VALUE)])).toThrow();
  });
  it("checks all inputs even after a missing member", () => {
    expect(() => sumMetricValues([metricValue(null), { value: "bad", availability: "available" } as never])).toThrow();
  });
  it("keeps undefined/infinite ratios orthogonal to metric availability", () => {
    expect(divideMetricValues(metricValue(10), metricValue(2))).toEqual({ value: 5, state: "finite" });
    expect(divideMetricValues(metricValue(0), metricValue(0))).toEqual({ value: null, state: "undefined" });
    expect(divideMetricValues(metricValue(10), metricValue(0), { infiniteWhenPositiveNumerator: true })).toEqual({ value: null, state: "infinite" });
    expect(divideMetricValues(metricValue(10), metricValue(null), { infiniteWhenPositiveNumerator: true })).toEqual({ value: null, state: "undefined" });
    expect(() => divideMetricValues(metricValue(Number.MAX_VALUE), metricValue(Number.MIN_VALUE))).toThrow();
  });
});
