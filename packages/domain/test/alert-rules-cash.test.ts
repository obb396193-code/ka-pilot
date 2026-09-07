import { describe, expect, it } from "vitest";
import { evaluateOverCostRamp, type OverCostRampInput } from "../src/alert-rules.js";

const base = { assessmentPrice: 30, cashCost: 5000, realConversion: 100, lifecycleStage: "scaling" };
function evaluate(input: object) { return evaluateOverCostRamp(input as OverCostRampInput); }
describe("cash assessment rule, never book CPA", () => {
  it("uses cash CPA even when book CPA says the opposite", () => {
    expect(evaluate({ ...base, cashCost: 3500, realCpa: 80, cost: 8000 }).outcome).toBe("not_matched");
    const result = evaluate({ ...base, realCpa: 1, cost: 100 });
    expect(result.outcome).toBe("matched");
    expect(result.trace).toContainEqual(expect.objectContaining({ condition: "cpa_threshold", actual: 50 }));
  });
  it("never infers cash from legacy inputs", () => {
    expect(evaluate({ assessmentPrice: 30, realCpa: 80, cost: 8000, realConversion: 100, lifecycleStage: "scaling" }).outcome).toBe("insufficient_data");
  });
  it.each([null, undefined, NaN, Infinity, "5000"])("missing/invalid cash %s is not zero or book cost", (cashCost) => {
    expect(evaluate({ ...base, cashCost, realCpa: 80, cost: 8000 }).outcome).toBe("insufficient_data");
  });
  it.each([null, undefined, NaN, Infinity, -1])("cannot assess invalid conversion %s", (realConversion) => {
    expect(evaluate({ ...base, realConversion }).outcome).toBe("insufficient_data");
  });
  it("preserves positive cash / zero conversion infinity, but zero / zero is unknown", () => {
    expect(evaluate({ ...base, realConversion: 0 }).outcome).toBe("matched");
    expect(evaluate({ ...base, cashCost: 0, realConversion: 0 }).outcome).toBe("insufficient_data");
  });
  it("keeps strict 3000 cash and 1.2 cost boundaries", () => {
    expect(evaluate({ ...base, cashCost: 3000, realConversion: 1 }).outcome).toBe("not_matched");
    expect(evaluate({ ...base, cashCost: 3000.01, realConversion: 1 }).outcome).toBe("matched");
    expect(evaluate({ ...base, cashCost: 3600 }).outcome).toBe("not_matched");
    expect(evaluate({ ...base, cashCost: 3600.01 }).outcome).toBe("matched");
  });
  it("preserves cold-start sample and tolerance guards", () => {
    expect(evaluate({ ...base, lifecycleStage: "cold_start", realConversion: 9 }).outcome).toBe("not_matched");
    expect(evaluate({ ...base, lifecycleStage: "cold_start", realConversion: 10 }).outcome).toBe("matched");
    expect(evaluate({ ...base, lifecycleStage: "cold_start", cashCost: 4500 }).outcome).toBe("not_matched");
    expect(evaluate({ ...base, lifecycleStage: "cold_start", cashCost: 4500.01 }).outcome).toBe("matched");
  });
  it("does not classify overflow calculations as ordinary finite results", () => {
    expect(evaluate({ ...base, assessmentPrice: Number.MAX_VALUE }).outcome).toBe("insufficient_data");
    expect(evaluate({ ...base, cashCost: Number.MAX_VALUE, realConversion: Number.MIN_VALUE }).outcome).toBe("insufficient_data");
  });
});
