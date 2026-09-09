import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateConditionTree } from "../src/condition-tree.js";

const leaf = { metric: "cash_cost", operator: ">", threshold: 10 };
const tree = (node: unknown) => ({ version: "v1", all: [node] });
const observation = (value: number | null, availability = value === null ? "missing" : "available") =>
  ({ value: { value, availability }, granularity: "daily" });
describe("restricted condition AST", () => {
  it("executes all authoritative fixture trees with separately resolved daily evidence", () => {
    const fixture = JSON.parse(readFileSync(new URL("../../contract/fixtures/rules/list.json", import.meta.url), "utf8"));
    for (const rule of fixture.data.items) {
      expect(evaluateConditionTree(rule.conditionTree, () => observation(20)).leaves.length).toBeGreaterThan(0);
    }
  });
  it("combines same-node groups by AND and not as NOT(OR)", () => {
    expect(evaluateConditionTree({ version: "v1", all: [leaf], any: [leaf], not: [{ ...leaf, threshold: 100 }] }, () => observation(20)).pass).toBe(true);
    expect(evaluateConditionTree({ version: "v1", not: [leaf, { ...leaf, threshold: 100 }] }, () => observation(20)).pass).toBe(false);
  });
  it.each(["all", "any", "not"])("missing evidence in %s cannot be hidden", group => {
    const output = evaluateConditionTree({ version: "v1", [group]: [leaf, { ...leaf, metric: "real_conversion" }] },
      request => observation(request.metric === "real_conversion" ? null : 20));
    expect(output.pass).toBeNull(); expect(output.reason).toBe("METRIC_MISSING"); expect(output.leaves).toHaveLength(2);
  });
  it("resolves threshold for every consecutive business day and caches identical requests", () => {
    const calls: unknown[] = [];
    const node = { ...leaf, threshold: "assessment_price", window_hours: 24, consecutive_days: 2 };
    const result = evaluateConditionTree({ version: "v1", all: [node, node] }, request => {
      calls.push(request); return observation(request.metric === "assessment_price" ? 10 : request.dayOffset === 0 ? 20 : 5);
    });
    expect(result.pass).toBe(false); expect(result.reason).toBe("CONDITION_FALSE"); expect(calls).toHaveLength(4);
    expect(calls).toContainEqual({ metric: "assessment_price", windowHours: 24, dayOffset: 1 });
    expect(result.leaves).toHaveLength(4);
  });
  it("missing dynamic price makes the entire condition undeterminable", () => {
    expect(evaluateConditionTree(tree({ ...leaf, threshold: "assessment_price" }),
      req => observation(req.metric === "assessment_price" ? null : 20)).pass).toBeNull();
  });
  it("preserves infinite ratios and undefined values without converting them to zero", () => {
    const input = tree({ ...leaf, metric: "cash_cpa" });
    expect(evaluateConditionTree(input, () => ({ value: { value: null, state: "infinite" }, granularity: "daily" })).pass).toBe(true);
    expect(evaluateConditionTree(input, () => ({ value: { value: null, state: "undefined" }, granularity: "daily" })).pass).toBeNull();
  });
  it("requires hourly evidence for a non-day window and does not invent a default window", () => {
    expect(() => evaluateConditionTree(tree({ ...leaf, window_hours: 6 }), () => observation(20))).toThrow();
    expect(evaluateConditionTree(tree({ ...leaf, window_hours: 6 }), () => ({ ...observation(20), granularity: "hourly" })).pass).toBe(true);
    const requests: unknown[] = []; evaluateConditionTree(tree(leaf), req => { requests.push(req); return observation(20); });
    expect(requests).toEqual([{ metric: "cash_cost", windowHours: null, dayOffset: 0 }]);
  });
  it.each([{}, { version: "v1", all: [] }, tree({ ...leaf, metric: "cost" }), tree({ ...leaf, threshold: "1+2" }),
    tree({ ...leaf, operator: "eval" }), tree({ ...leaf, script: "synthetic" }), { version: "v2", all: [leaf] },
    tree({ ...leaf, consecutive_days: 0 }), tree({ ...leaf, window_hours: 0 }), tree({ ...leaf, threshold: Infinity }),
  ])("rejects invalid AST %#", input => expect(() => evaluateConditionTree(input, () => observation(20))).toThrow());
  it("bounds nesting, leaf count and observation expansion before reading evidence", () => {
    let node: unknown = leaf;
    for (let i = 0; i < 7; i++) node = { all: [node] };
    expect(evaluateConditionTree({ ...(node as object), version: "v1" }, () => observation(20)).pass).toBe(true);
    expect(() => evaluateConditionTree(tree(node), () => observation(20))).toThrow();
    expect(evaluateConditionTree({ version: "v1", all: Array(128).fill(leaf) }, () => observation(20)).leaves).toHaveLength(128);
    expect(() => evaluateConditionTree({ version: "v1", all: Array(129).fill(leaf) }, () => observation(20))).toThrow();
    expect(() => evaluateConditionTree(tree({ ...leaf, consecutive_days: 4097 }), () => observation(20))).toThrow();
    const cycle: { version: string; all: unknown[] } = { version: "v1", all: [] }; cycle.all.push(cycle);
    expect(() => evaluateConditionTree(cycle, () => observation(20))).toThrow();
  });
  it.each([NaN, Infinity, "20", false])("rejects present-invalid metric %s", value => {
    expect(() => evaluateConditionTree(tree(leaf), () => ({ value: { value, availability: "available" }, granularity: "daily" }))).toThrow();
  });
  it.each([
    [">", 20, true], [">", 10, false], [">=", 10, true], ["<", 9, true],
    ["<=", 10, true], ["==", 10, true], ["!=", 10, false], ["!=", 9, true],
  ])("compares %s without truthy coercion", (operator, value, expected) => {
    expect(evaluateConditionTree(tree({ ...leaf, operator }), () => observation(value as number)).pass).toBe(expected);
  });
  it("errors and missing ratios dominate nested NOT and false siblings", () => {
    const output = evaluateConditionTree({ version: "v1", all: [{ ...leaf, threshold: 100 }], not: [{ any: [
      { ...leaf, metric: "cash_cpa" }, leaf,
    ] }] }, req => req.metric === "cash_cpa" ? observation(null, "error") : observation(20));
    expect(output.pass).toBeNull(); expect(output.leaves).toHaveLength(3);
  });
  it("rejects sparse arrays, custom prototypes, root leaves, extra groups and absent values", () => {
    const sparse = [leaf]; sparse.length = 2;
    for (const input of [{ version: "v1", all: sparse }, { ...leaf, version: "v1" },
      { version: "v1", all: [leaf], code: "synthetic" }, tree(Object.create(leaf)),
      { version: "v1", any: [] }, tree(null), tree({ all: [leaf], metric: "cash_cost" })]) {
      expect(() => evaluateConditionTree(input, () => observation(20))).toThrow();
    }
    expect(() => evaluateConditionTree(tree(leaf), () => undefined)).toThrow();
  });
  it("rejects an infinite assessment price and hourly window disguised as daily price", () => {
    const rule = tree({ ...leaf, threshold: "assessment_price", window_hours: 6 });
    for (const price of [{ value: { value: null, state: "infinite" }, granularity: "hourly" }, observation(10)]) {
      expect(() => evaluateConditionTree(rule, req => req.metric === "assessment_price" ? price :
        { ...observation(20), granularity: "hourly" })).toThrow();
    }
  });
});
