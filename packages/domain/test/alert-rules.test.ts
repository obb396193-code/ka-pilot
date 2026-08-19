import { describe, expect, it } from "vitest";

import {
  evaluateOverCostRamp,
  evaluateSpendCliff,
  evaluateZeroDelivery,
} from "../src/alert-rules.js";

describe("evaluateOverCostRamp", () => {
  it("matches a scaling account only when CPA and spend both cross the rule", () => {
    const result = evaluateOverCostRamp({
      realCpa: 36.01,
      assessmentPrice: 30,
      cost: 3000.01,
      lifecycleStage: "scaling",
      realConversion: 100,
    });

    expect(result.outcome).toBe("matched");
    expect(result.severity).toBe("P0");
    expect(result.trace.every((item) => item.reason.length > 0)).toBe(true);
  });

  it("does not judge a cold-start account before ten real conversions", () => {
    const result = evaluateOverCostRamp({
      realCpa: 45,
      assessmentPrice: 30,
      cost: 5000,
      lifecycleStage: "cold_start",
      realConversion: 9,
    });

    expect(result.outcome).toBe("not_matched");
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        condition: "cold_start_sample_guard",
        outcome: "not_matched",
      }),
    );
  });

  it("uses the wider 1.5x CPA threshold after a cold-start account has enough samples", () => {
    expect(
      evaluateOverCostRamp({
        realCpa: 44,
        assessmentPrice: 30,
        cost: 5000,
        lifecycleStage: "cold_start",
        realConversion: 10,
      }).outcome,
    ).toBe("not_matched");
    expect(
      evaluateOverCostRamp({
        realCpa: 45.01,
        assessmentPrice: 30,
        cost: 5000,
        lifecycleStage: "cold_start",
        realConversion: 10,
      }).outcome,
    ).toBe("matched");
  });

  it("treats an infinite CPA as over threshold but an undefined CPA as insufficient", () => {
    expect(
      evaluateOverCostRamp({
        realCpa: { value: null, state: "infinite" },
        assessmentPrice: 30,
        cost: 5000,
        lifecycleStage: "scaling",
        realConversion: 0,
      }).outcome,
    ).toBe("matched");
    expect(
      evaluateOverCostRamp({
        realCpa: { value: null, state: "undefined" },
        assessmentPrice: 30,
        cost: 5000,
        lifecycleStage: "scaling",
        realConversion: 0,
      }).outcome,
    ).toBe("insufficient_data");
  });

  it("returns insufficient data instead of replacing a missing metric with zero", () => {
    const result = evaluateOverCostRamp({
      assessmentPrice: 30,
      cost: 5000,
      lifecycleStage: "scaling",
      realConversion: 100,
    });

    expect(result.outcome).toBe("insufficient_data");
  });
});

describe("evaluateZeroDelivery", () => {
  it("matches a zero-spend entity after 24 hours", () => {
    const result = evaluateZeroDelivery({ entityAgeHours: 24, cost: 0 });
    expect(result.outcome).toBe("matched");
    expect(result.ruleCode).toBe("zero_delivery");
  });

  it("does not match before 24 hours and reports missing creation age", () => {
    expect(evaluateZeroDelivery({ entityAgeHours: 23.99, cost: 0 }).outcome).toBe(
      "not_matched",
    );
    expect(evaluateZeroDelivery({ cost: 0 }).outcome).toBe("insufficient_data");
  });
});

describe("evaluateSpendCliff", () => {
  it("matches a 30 percent drop only when there was no manual budget change", () => {
    expect(
      evaluateSpendCliff({ spendChange: -0.3, hadManualBudgetChange: false }).outcome,
    ).toBe("matched");
    expect(
      evaluateSpendCliff({ spendChange: -0.4, hadManualBudgetChange: true }).outcome,
    ).toBe("not_matched");
  });

  it("reports insufficient data when the operation-history exclusion is unknown", () => {
    const result = evaluateSpendCliff({
      spendChange: -0.31,
      hadManualBudgetChange: undefined,
    });

    expect(result.outcome).toBe("insufficient_data");
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        condition: "manual_budget_change_exclusion",
        outcome: "insufficient_data",
      }),
    );
  });
});
