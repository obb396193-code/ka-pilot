import { describe, expect, it } from "vitest";
import { assessRuleReadiness } from "../src/rule-readiness.js";

const now = new Date("2026-09-06T10:00Z");
const good = { initialFullDone: true, source: { kind: "realtime", dataAsOf: new Date("2026-09-06T09:00Z") }, requiredMetrics: { cost: "available", conversion: "available" } };
describe("rule evidence readiness", () => {
  it("allows only complete current evidence", () => {
    expect(assessRuleReadiness(good, now)).toMatchObject({ coverage: "checked", reason: "ok" });
  });
  it("prioritizes initial full over missing and stale source", () => {
    expect(assessRuleReadiness({ ...good, initialFullDone: false, source: { kind: "offline", dataAsOf: null }, requiredMetrics: { cost: "missing" } }, now)).toMatchObject({ coverage: "pending", reason: "INITIAL_FULL_PENDING" });
  });
  it.each([null, new Date("2026-09-06T03:59:59Z"), new Date("2026-09-07T00:00Z")])("never declares stale/unknown/future data current: %s", (dataAsOf) => {
    expect(assessRuleReadiness({ ...good, source: { kind: "realtime", dataAsOf } }, now)).toMatchObject({ coverage: "pending", reason: "SOURCE_STALE" });
  });
  it.each(["suppress", "evaluate_available_only"])("never substitutes missing/error metrics under %s", (availabilityPolicy) => {
    for (const availability of ["missing", "error"]) {
      expect(assessRuleReadiness({ ...good, availabilityPolicy, requiredMetrics: { cost: availability } }, now)).toMatchObject({ coverage: "undeterminable", reason: "METRIC_MISSING", leaves: [{ metric: "cost", availability }] });
    }
  });
  it("uses 6h/30h defaults and the explicit source freshness setting", () => {
    const at = new Date(now.getTime() - 6 * 3600000);
    expect(assessRuleReadiness({ ...good, source: { kind: "realtime", dataAsOf: at } }, now).coverage).toBe("checked");
    expect(assessRuleReadiness({ ...good, source: { kind: "offline", dataAsOf: new Date(now.getTime() - 30 * 3600000) } }, now).coverage).toBe("checked");
    expect(assessRuleReadiness({ ...good, source: { kind: "offline", dataAsOf: at, freshnessMaxHours: 5 } }, now).coverage).toBe("pending");
  });
  it.each([undefined, {}, { ...good, requiredMetrics: {} }, { ...good, initialFullDone: "true" }, { ...good, source: { kind: "realtime", dataAsOf: new Date(NaN) } }, { ...good, requiredMetrics: { cost: "invented" } }, { ...good, source: { ...good.source, freshnessMaxHours: 0 } }, { ...good, availabilityPolicy: "fill_zero" }])("rejects invalid or absent evidence %j", (evidence) => {
    expect(() => assessRuleReadiness(evidence, now)).toThrow();
  });
  it("rejects invalid clocks", () => { expect(() => assessRuleReadiness(good, new Date(NaN))).toThrow(); });
});
