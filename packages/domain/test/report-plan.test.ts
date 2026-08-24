import { describe, expect, it } from "vitest";

import {
  fingerprintReportExecutionPlan,
  parseReportExecutionPlan,
} from "../src/report-plan.js";

function validPlan() {
  return {
    version: "b6-internal-v1",
    title: "近七天任务经营报表",
    scope: {
      dateFrom: "2026-08-13",
      dateTo: "2026-08-19",
      filters: { taskId: "task-1", media: "KUAISHOU" },
    },
    components: [
      { id: "cost_kpi", title: "消耗", kind: "kpi", metric: "cost" },
      { id: "cpa_trend", title: "真实 CPA 趋势", kind: "trend", metric: "realCpa" },
      {
        id: "task_table",
        title: "任务表现",
        kind: "table",
        dimension: "task",
        metrics: ["cost", "realCpa", "gap"],
        limit: 50,
      },
      {
        id: "biz_bar",
        title: "业务消耗",
        kind: "bar",
        dimension: "biz",
        metrics: ["cost"],
      },
    ],
  };
}

describe("parseReportExecutionPlan", () => {
  it("parses only the internal safe execution shape", () => {
    const parsed = parseReportExecutionPlan(validPlan());

    expect(parsed.version).toBe("b6-internal-v1");
    expect(parsed.scope.filters).toEqual({ taskId: "task-1", media: "KUAISHOU" });
    expect(parsed.components[3]).toMatchObject({ kind: "bar", limit: 20 });
  });

  it.each(["sql", "formula", "script", "url", "rows", "schedule", "sharing", "layout"])(
    "rejects the unsafe or public-contract field %s",
    (field) => {
      expect(() => parseReportExecutionPlan({ ...validPlan(), [field]: "forbidden" })).toThrow();
    },
  );

  it("rejects unknown component fields and precomputed values", () => {
    const plan = validPlan();
    plan.components[0] = { ...plan.components[0], value: 999 } as never;
    expect(() => parseReportExecutionPlan(plan)).toThrow();
  });

  it("rejects invalid or reversed real calendar dates", () => {
    const invalid = validPlan();
    invalid.scope.dateFrom = "2026-02-30";
    expect(() => parseReportExecutionPlan(invalid)).toThrow("valid date");

    const reversed = validPlan();
    reversed.scope.dateFrom = "2026-08-20";
    expect(() => parseReportExecutionPlan(reversed)).toThrow("dateFrom");
  });

  it("rejects unsupported metrics, dimensions, duplicate IDs and invalid grouped components", () => {
    const badMetric = validPlan();
    badMetric.components[0] = { ...badMetric.components[0], metric: "madeUpMetric" } as never;
    expect(() => parseReportExecutionPlan(badMetric)).toThrow();

    const badDimension = validPlan();
    badDimension.components[2] = {
      ...badDimension.components[2],
      dimension: "resourcePosition",
    } as never;
    expect(() => parseReportExecutionPlan(badDimension)).toThrow();

    const duplicate = validPlan();
    duplicate.components[1]!.id = duplicate.components[0]!.id;
    expect(() => parseReportExecutionPlan(duplicate)).toThrow("unique");

    const noMetrics = validPlan();
    noMetrics.components[2] = { ...noMetrics.components[2], metrics: [] } as never;
    expect(() => parseReportExecutionPlan(noMetrics)).toThrow();
  });

  it("rejects more than 24 components and out-of-range limits", () => {
    const tooMany = validPlan();
    tooMany.components = Array.from({ length: 25 }, (_, index) => ({
      id: `kpi_${index}`,
      title: `KPI ${index}`,
      kind: "kpi",
      metric: "cost",
    }));
    expect(() => parseReportExecutionPlan(tooMany)).toThrow();

    const invalidLimit = validPlan();
    invalidLimit.components[2] = { ...invalidLimit.components[2], limit: 501 } as never;
    expect(() => parseReportExecutionPlan(invalidLimit)).toThrow();
  });
});

describe("fingerprintReportExecutionPlan", () => {
  it("is deterministic after parsing and changes with executable meaning", () => {
    const first = parseReportExecutionPlan(validPlan());
    const equivalent = parseReportExecutionPlan(JSON.parse(JSON.stringify(validPlan())));
    const changedInput = validPlan();
    changedInput.components[0] = { ...changedInput.components[0], metric: "cashCost" } as never;
    const changed = parseReportExecutionPlan(changedInput);

    expect(fingerprintReportExecutionPlan(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintReportExecutionPlan(first)).toBe(fingerprintReportExecutionPlan(equivalent));
    expect(fingerprintReportExecutionPlan(first)).not.toBe(fingerprintReportExecutionPlan(changed));
  });
});
