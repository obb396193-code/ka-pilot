import { describe, expect, it } from "vitest";

import {
  compareAbsolute,
  compareRate,
  computeDerivedMetrics,
  isSpendAnomaly,
  meanIgnoringZeroSpend,
  safeDivide,
} from "../src/metrics.js";

describe("safeDivide", () => {
  it("returns a finite ratio for valid operands", () => {
    expect(safeDivide(25, 100)).toEqual({ value: 0.25, state: "finite" });
  });

  it("distinguishes an infinite CPA from an undefined ratio", () => {
    expect(safeDivide(100, 0, { infiniteWhenPositiveNumerator: true })).toEqual({
      value: null,
      state: "infinite",
    });
    expect(safeDivide(0, 0)).toEqual({ value: null, state: "undefined" });
    expect(safeDivide(null, 10)).toEqual({ value: null, state: "undefined" });
  });
});

describe("comparisons", () => {
  it("uses relative change for absolute metrics", () => {
    expect(compareAbsolute(120, 100)).toBeCloseTo(0.2);
    expect(compareAbsolute(10, 0)).toBe("NEW");
    expect(compareAbsolute(0, 0)).toBe(0);
    expect(compareAbsolute(null, 1)).toBeNull();
  });

  it("uses percentage-point change for rate metrics", () => {
    expect(compareRate(0.23, 0.2)).toBeCloseTo(0.03);
    expect(compareRate(0.1, 0)).toBe("NEW");
    expect(compareRate(0, 0)).toBe(0);
  });
});

describe("computeDerivedMetrics", () => {
  it("implements every frozen formula without display formatting", () => {
    const output = computeDerivedMetrics({
      cost: 1_000,
      compensation: 109,
      channelCoefficient: 1.09,
      exposure: 20_000,
      click: 1_000,
      conversion: 120,
      realConversion: 100,
      attributionVolume: 110,
      assessmentPrice: 10,
      wakeUv: 500,
      potentialUv: 250,
      lastHourSpend: 80,
      elapsedDayFraction: 0.5,
      balance: 400,
    });

    expect(output.ctr.value).toBeCloseTo(0.05);
    expect(output.cvr.value).toBeCloseTo(0.12);
    expect(output.realCpa).toEqual({ value: 10, state: "finite" });
    expect(output.onTarget).toBe(true);
    expect(output.cashCost).toBeCloseTo(817.43119266);
    expect(output.cashCpa.value).toBeCloseTo(8.1743119266);
    expect(output.costSpace).toBeCloseTo(182.56880734);
    expect(output.gap.value).toBeCloseTo(0.2);
    expect(output.preDeductionGap.value).toBeCloseTo(0.1);
    expect(output.potentialRate.value).toBeCloseTo(0.5);
    expect(output.biConversionRate.value).toBeCloseTo(0.4);
    expect(output.velocity).toBe(80);
    expect(output.estimatedDailySpend).toBe(2_000);
    expect(output.outageCountdownHours.value).toBe(5);
  });

  it("returns explicit infinite/undefined states at zero denominators", () => {
    const output = computeDerivedMetrics({
      cost: 100,
      realConversion: 0,
      conversion: 0,
      assessmentPrice: 20,
      channelCoefficient: 1,
    });

    expect(output.realCpa).toEqual({ value: null, state: "infinite" });
    expect(output.onTarget).toBe(false);
    expect(output.cashCpa).toEqual({ value: null, state: "infinite" });
    expect(output.gap).toEqual({ value: null, state: "undefined" });
  });
});

describe("spend baselines", () => {
  it("excludes zero-spend days but preserves high-spend anomalies", () => {
    expect(meanIgnoringZeroSpend([0, 100, 200, 0])).toBe(150);
    expect(meanIgnoringZeroSpend([0, 0])).toBeNull();
    expect(isSpendAnomaly(751, [0, 100, 200])).toBe(true);
    expect(isSpendAnomaly(750, [100, 200])).toBe(false);
  });
});
