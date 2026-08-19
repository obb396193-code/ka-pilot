import { describe, expect, it } from "vitest";

import {
  assembleReportDataset,
  type ReportFactsBundle,
  type ReportMetricBag,
} from "../src/report-dataset.js";
import { parseReportExecutionPlan } from "../src/report-plan.js";

const finite = (value: number) => ({ value, state: "finite" as const });
const undefinedValue = { value: null, state: "undefined" as const };
const infiniteValue = { value: null, state: "infinite" as const };

function plan() {
  return parseReportExecutionPlan({
    version: "b6-internal-v1",
    title: "经营报表",
    scope: { dateFrom: "2026-08-18", dateTo: "2026-08-19" },
    components: [
      { id: "cost_kpi", title: "消耗", kind: "kpi", metric: "cost" },
      { id: "cpa_trend", title: "CPA 趋势", kind: "trend", metric: "realCpa" },
      {
        id: "task_table",
        title: "任务表现",
        kind: "table",
        dimension: "task",
        metrics: ["cost", "realCpa"],
        limit: 2,
      },
      {
        id: "biz_bar",
        title: "业务消耗",
        kind: "bar",
        dimension: "biz",
        metrics: ["cost"],
      },
    ],
  });
}

function metrics(overrides: ReportMetricBag = {}): ReportMetricBag {
  return { cost: finite(100), realCpa: finite(20), gap: undefinedValue, ...overrides };
}

function facts(): ReportFactsBundle {
  return {
    workspaceId: "workspace-1",
    dataCutoffAt: "2026-08-19T10:30:00.000Z",
    summary: metrics({ cost: finite(300) }),
    trend: [
      { ds: "2026-08-19", metrics: metrics({ realCpa: infiniteValue }) },
      { ds: "2026-08-18", metrics: metrics({ realCpa: finite(18) }) },
    ],
    dimensions: {
      task: [
        { dimensionKey: "task-b", dimensionLabel: "任务乙", metrics: metrics({ cost: finite(80) }) },
        { dimensionKey: "task-c", dimensionLabel: "任务丙", metrics: metrics({ cost: finite(150) }) },
        { dimensionKey: "task-a", dimensionLabel: "任务甲", metrics: metrics({ cost: finite(150) }) },
      ],
      biz: [],
    },
  };
}

describe("assembleReportDataset", () => {
  it("assembles KPI, trend and grouped components from trusted facts", () => {
    const result = assembleReportDataset(plan(), facts());

    expect(result).toMatchObject({
      version: "b6-internal-v1",
      workspaceId: "workspace-1",
      title: "经营报表",
      dataCutoffAt: "2026-08-19T10:30:00.000Z",
    });
    expect(result.components[0]).toMatchObject({
      id: "cost_kpi",
      kind: "kpi",
      status: "ready",
      metric: "cost",
      value: finite(300),
    });
    expect(result.components[1]).toMatchObject({
      kind: "trend",
      status: "ready",
      points: [
        { ds: "2026-08-18", value: finite(18) },
        { ds: "2026-08-19", value: infiniteValue },
      ],
    });
    expect(result.components[2]).toMatchObject({
      kind: "table",
      status: "ready",
      rows: [
        { dimensionKey: "task-a", metrics: { cost: finite(150) } },
        { dimensionKey: "task-c", metrics: { cost: finite(150) } },
      ],
    });
    expect(result.components[3]).toMatchObject({ kind: "bar", status: "empty", rows: [] });
  });

  it("keeps missing facts distinct from empty datasets and numeric zero", () => {
    const missing = facts();
    missing.summary = null;
    missing.trend = null;
    delete missing.dimensions.task;
    missing.dimensions.biz = [
      { dimensionKey: "biz-1", dimensionLabel: null, metrics: {} },
    ];

    const components = assembleReportDataset(plan(), missing).components;
    expect(components[0]).toMatchObject({ status: "missing", value: { value: null, state: "missing" } });
    expect(components[1]).toMatchObject({ status: "missing", points: [] });
    expect(components[2]).toMatchObject({ status: "missing", rows: [] });
    expect(components[3]).toMatchObject({ status: "missing" });
  });

  it("rejects malformed trusted facts instead of silently normalizing them", () => {
    const invalidTimestamp = facts();
    invalidTimestamp.dataCutoffAt = "not-a-timestamp";
    expect(() => assembleReportDataset(plan(), invalidTimestamp)).toThrow("dataCutoffAt");

    const invalidFinite = facts();
    invalidFinite.summary = metrics({ cost: { value: Number.NaN, state: "finite" } });
    expect(() => assembleReportDataset(plan(), invalidFinite)).toThrow("finite");

    const duplicateTrendDate = facts();
    duplicateTrendDate.trend = [
      { ds: "2026-08-18", metrics: metrics() },
      { ds: "2026-08-18", metrics: metrics() },
    ];
    expect(() => assembleReportDataset(plan(), duplicateTrendDate)).toThrow("unique");

    const duplicateDimension = facts();
    duplicateDimension.dimensions.task = [
      { dimensionKey: "task-1", dimensionLabel: null, metrics: metrics() },
      { dimensionKey: "task-1", dimensionLabel: null, metrics: metrics() },
    ];
    expect(() => assembleReportDataset(plan(), duplicateDimension)).toThrow("unique");
  });
});
