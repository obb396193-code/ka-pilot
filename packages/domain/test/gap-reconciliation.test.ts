import { describe, expect, it } from "vitest";

import { reconcileConversionGap } from "../src/gap-reconciliation.js";

describe("reconcileConversionGap", () => {
  it("reports matched and signed mismatch facts without a business threshold", () => {
    expect(reconcileConversionGap({ mediaConversion: 10, realConversion: 10 })).toEqual({
      status: "matched",
      difference: 0,
      gap: { value: 0, state: "finite" },
      evidence: { mediaConversion: 10, realConversion: 10 },
    });
    const positive = reconcileConversionGap({ mediaConversion: 12, realConversion: 10 });
    expect(positive).toMatchObject({
      status: "mismatch",
      difference: 2,
      gap: { state: "finite" },
    });
    expect(positive.gap.value).toBeCloseTo(0.2);
    const negative = reconcileConversionGap({ mediaConversion: 8, realConversion: 10 });
    expect(negative).toMatchObject({
      status: "mismatch",
      difference: -2,
      gap: { state: "finite" },
    });
    expect(negative.gap.value).toBeCloseTo(-0.2);
  });

  it("preserves denominator-zero and missing states", () => {
    expect(reconcileConversionGap({ mediaConversion: 10, realConversion: 0 })).toMatchObject({
      status: "undefined",
      difference: 10,
      gap: { value: null, state: "infinite" },
    });
    expect(reconcileConversionGap({ mediaConversion: 0, realConversion: 0 })).toMatchObject({
      status: "undefined",
      difference: 0,
      gap: { value: null, state: "undefined" },
    });
    expect(reconcileConversionGap({ mediaConversion: null, realConversion: 3 })).toEqual({
      status: "missing",
      difference: null,
      gap: { value: null, state: "undefined" },
      evidence: { mediaConversion: null, realConversion: 3 },
    });
  });

  it("rejects negative and non-finite counts", () => {
    expect(() => reconcileConversionGap({ mediaConversion: -1, realConversion: 1 })).toThrow();
    expect(() =>
      reconcileConversionGap({ mediaConversion: 1, realConversion: Number.NaN }),
    ).toThrow();
  });
});
