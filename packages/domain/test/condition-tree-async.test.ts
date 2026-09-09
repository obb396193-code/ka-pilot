import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { evaluateConditionTree, evaluateConditionTreeAsync } from "../src/condition-tree.js";

const leaf = { metric: "cash_cost", operator: ">", threshold: 10 };
const tree = (node: unknown) => ({ version: "v1", all: [node] });
const observation = (value: number | null) => ({ value: { value, availability: value === null ? "missing" : "available" }, granularity: "daily" });

describe("async condition evidence", () => {
  it("has parity with every authoritative tree using separately supplied synthetic facts", async () => {
    const fixture = JSON.parse(readFileSync(new URL("../../contract/fixtures/rules/list.json", import.meta.url), "utf8"));
    for (const rule of fixture.data.items) {
      expect(await evaluateConditionTreeAsync(rule.conditionTree, async () => observation(20)))
        .toEqual(evaluateConditionTree(rule.conditionTree, () => observation(20)));
    }
  });
  it.each(["all", "any", "not"])("does not short-circuit missing evidence in %s", async group => {
    const input = { version: "v1", [group]: [leaf, { ...leaf, metric: "real_conversion" }] };
    const result = await evaluateConditionTreeAsync(input, async request => observation(request.metric === "cash_cost" ? 20 : null));
    expect(result.pass).toBeNull(); expect(result.reason).toBe("METRIC_MISSING"); expect(result.leaves).toHaveLength(2);
  });
  it("reads each consecutive-day weighted price once without concurrent IO", async () => {
    let active = 0, maximum = 0;
    const reader = vi.fn(async () => {
      maximum = Math.max(maximum, ++active);
      await Promise.resolve(); active--; return observation(20);
    });
    const node = { ...leaf, threshold: "assessment_price", window_hours: 48, consecutive_days: 2 };
    const result = await evaluateConditionTreeAsync({ version: "v1", all: [node, node] }, reader);
    expect(reader).toHaveBeenCalledTimes(4); expect(maximum).toBe(1);
    expect(reader).toHaveBeenCalledWith({ metric: "assessment_price", windowHours: 48, dayOffset: 1 });
    expect(result.pass).toBe(false); expect(result.leaves).toHaveLength(4);
  });
  it.each([{}, tree({ ...leaf, threshold: "eval(1)" }), tree({ ...leaf, consecutive_days: 4097 })])("invalid tree %# causes no reads", async input => {
    const reader = vi.fn();
    await expect(evaluateConditionTreeAsync(input, reader)).rejects.toThrow("Invalid rule condition or evidence");
    expect(reader).not.toHaveBeenCalled();
  });
  it("freezes rule and evidence across awaits, including reader request mutation", async () => {
    const node = { ...leaf }, returned = observation(20);
    const input = { version: "v1", all: [node, { ...leaf, metric: "real_conversion" }] };
    const result = await evaluateConditionTreeAsync(input, async request => {
      if (request.metric === "cash_cost") {
        node.threshold = 100; input.all.push({ ...leaf, metric: "unrequested" });
        request.metric = "mutated"; return returned;
      }
      returned.value.value = 0;
      return observation(30);
    });
    expect(result.pass).toBe(true); expect(result.leaves).toHaveLength(2);
    expect(result.leaves[0]!.threshold).toBe(10);
    expect(result.leaves[0]!.value.value).toBe(20);
  });
  it("preserves infinite actual CPA and missing assessment", async () => {
    const result = await evaluateConditionTreeAsync(tree({ ...leaf, metric: "cash_cpa" }), async () =>
      ({ value: { value: null, state: "infinite" }, granularity: "daily" }));
    expect(result.pass).toBe(true);
    expect((await evaluateConditionTreeAsync(tree({ ...leaf, threshold: "assessment_price" }), async req =>
      observation(req.metric === "assessment_price" ? null : 20))).pass).toBeNull();
  });
  it.each([undefined, observation(NaN), { ...observation(20), granularity: "monthly" },
    { value: { value: "20", availability: "available" }, granularity: "daily" },
  ])("rejects malformed evidence %# without treating it as missing", async value => {
    await expect(evaluateConditionTreeAsync(tree(leaf), async () => value)).rejects.toThrow("Invalid rule condition or evidence");
  });
  it("daily data cannot satisfy an hourly window", async () => {
    await expect(evaluateConditionTreeAsync(tree({ ...leaf, window_hours: 6 }), async () => observation(20))).rejects.toThrow();
  });
  it("a reader rejection is safe and stops subsequent IO", async () => {
    const reader = vi.fn(async () => { throw new Error("token=synthetic-secret; SELECT private_body"); });
    await expect(evaluateConditionTreeAsync({ version: "v1", all: [leaf, { ...leaf, metric: "real_conversion" }] }, reader))
      .rejects.toThrow(/^Rule evidence source unavailable$/);
    expect(reader).toHaveBeenCalledTimes(1);
  });
  it("permits the exact 4096 planned observations without inventing a window", async () => {
    const reader = vi.fn(async () => observation(20));
    const result = await evaluateConditionTreeAsync(tree({ ...leaf, consecutive_days: 4096 }), reader);
    expect(reader).toHaveBeenCalledTimes(4096); expect(result.leaves).toHaveLength(4096);
    expect(reader).toHaveBeenLastCalledWith({ metric: "cash_cost", windowHours: null, dayOffset: 4095 });
  });
});
