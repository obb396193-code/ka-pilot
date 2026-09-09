import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  TASK_DETAIL_TABS, deriveSopProgressFromStage, taskDetailSchema,
} from "../../src/r014/task-detail-contract.js";

const fixture = JSON.parse(readFileSync(
  new URL("../../../contract/fixtures/task-detail/overview-v151.json", import.meta.url), "utf8",
)) as { data: unknown };

describe("v1.5.1 ② task detail (D5)", () => {
  it("parses the frozen v1.5.1 fixture", () => {
    const parsed = taskDetailSchema.parse(fixture.data);
    expect(parsed.task.taskId).toBe("fixture-task-ready");
    expect(parsed.overview.stage).toMatchObject({ value: "delivering", source: "system" });
    expect(parsed.overview.anomalySummary).toEqual({ p0: 1, p1: 3, opportunity: 2 });
    expect(parsed.overview.assessmentPrice).toMatchObject({ current: 38, historyCount: 2 });
    expect(parsed.tabs).toEqual([...TASK_DETAIL_TABS]);
  });

  it("pins the eight tabs and their order", () => {
    expect(TASK_DETAIL_TABS).toHaveLength(8);
    const good = taskDetailSchema.parse(fixture.data);
    expect(() => taskDetailSchema.parse({ ...good, tabs: [...good.tabs].reverse() }))
      .toThrow(/frozen order/);
    expect(() => taskDetailSchema.parse({ ...good, tabs: good.tabs.slice(1) })).toThrow();
  });

  it("accepts the blocks that have no source yet as null, but not as fabricated values", () => {
    const good = taskDetailSchema.parse(fixture.data);
    const empty = {
      ...good,
      overview: {
        ...good.overview,
        cost: null, costStatus: null, costStatusReason: null, onTarget: null,
        budgetUsageRate: null, budgetUsageDate: null, dailyBudgetCap: null,
      },
    };
    expect(() => taskDetailSchema.parse(empty)).not.toThrow();
    // 达标状态只有三种；用 "unknown" 之类的字符串顶替会让前端把「算不出来」画成一个状态。
    expect(() => taskDetailSchema.parse({
      ...good, overview: { ...good.overview, costStatus: "unknown" },
    })).toThrow();
  });

  it("derives SOP steps from the stage without inventing timestamps", () => {
    const derived = deriveSopProgressFromStage("building");
    expect(derived.runId).toBeNull();
    expect(derived.steps.map((step) => step.status))
      .toEqual(["done", "done", "done", "running", "pending", "pending"]);
    // 推导出来的步骤没有真实发生时间，编一个时间就是造假。
    expect(derived.steps.every((step) => step.at === null)).toBe(true);
  });

  it("marks every step done once the task has ended", () => {
    expect(deriveSopProgressFromStage("ended").steps.every((step) => step.status === "done")).toBe(true);
    expect(deriveSopProgressFromStage("preparing").steps.map((step) => step.status))
      .toEqual(["running", "pending", "pending", "pending", "pending", "pending"]);
  });

  it("refuses a blocker or next action without a real reference", () => {
    const good = taskDetailSchema.parse(fixture.data);
    for (const blockers of [[{ kind: "work_item", title: "没有 ref" }], [{ kind: "guess", ref: "x", title: "t" }]]) {
      expect(() => taskDetailSchema.parse({ ...good, overview: { ...good.overview, blockers } })).toThrow();
    }
  });
});
