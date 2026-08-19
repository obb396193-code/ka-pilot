import { describe, expect, it } from "vitest";

import { assembleDailyReportFacts } from "../src/daily-report.js";

const currentMetrics = {
  accountCount: 2,
  cost: 270,
  exposure: 2_700,
  click: 221,
  conversion: 27,
  realConversion: 23,
  cashCost: 216,
  costSpace: 34,
  wakeUv: 110,
  potentialUv: 55,
  anomalyRows: 1,
};

describe("assembleDailyReportFacts", () => {
  it("assembles stable global and task facts without rendering modules", () => {
    const report = assembleDailyReportFacts({
      reportDate: "2026-08-20",
      dataCutoffAt: "2026-08-21T03:05:00.000Z",
      currentMetrics,
      previousMetrics: { ...currentMetrics, cost: 250, anomalyRows: 0 },
      tasks: [
        {
          taskId: "task-1",
          taskName: "脱敏任务",
          assessmentPrice: 12.5,
          metrics: currentMetrics,
          pacing: {
            periodStart: "2026-08-01",
            periodEnd: "2026-08-31",
            asOf: "2026-08-20",
            targetVolume: 500_000,
            completedVolume: 312_000,
            budget: 600_000,
            spent: 400_000,
            recentDailyVolumes: [13_000, 14_000, 15_000, 16_000, 16_000],
          },
        },
      ],
    });

    expect(report.reportDate).toBe("2026-08-20");
    expect(report.dataCutoffAt).toBe("2026-08-21T03:05:00.000Z");
    expect(report.summary?.ratios.realCpa.value).toBeCloseTo(270 / 23);
    expect(report.previousSummary?.cost).toBe(250);
    expect(report.anomalyCount).toBe(1);
    expect(report.tasks[0]).toMatchObject({
      taskId: "task-1",
      taskName: "脱敏任务",
      assessmentPrice: 12.5,
    });
    expect(report.tasks[0]!.pacing.projectedVolume).toBe(474_800);
    expect(report.tasks[0]!.metrics?.ratios.ctr.value).toBeCloseTo(221 / 2_700);
    expect(report.missingFacts).toEqual([]);
    expect(report).not.toHaveProperty("modules");
    expect(report).not.toHaveProperty("renderedText");
  });

  it("makes unavailable report and task facts explicit", () => {
    const report = assembleDailyReportFacts({
      reportDate: "2026-08-20",
      dataCutoffAt: "2026-08-21T03:05:00.000Z",
      currentMetrics: null,
      previousMetrics: null,
      tasks: [
        {
          taskId: "task-1",
          taskName: null,
          assessmentPrice: null,
          metrics: null,
          pacing: {
            periodStart: "2026-08-01",
            periodEnd: "2026-08-31",
            asOf: "2026-08-20",
            recentDailyVolumes: [],
          },
        },
      ],
    });

    expect(report.summary).toBeNull();
    expect(report.previousSummary).toBeNull();
    expect(report.anomalyCount).toBeNull();
    expect(report.tasks[0]!.pacing.projectedVolume).toBeNull();
    expect(report.missingFacts).toEqual([
      "summary.current",
      "summary.previous",
      "tasks.task-1.assessmentPrice",
      "tasks.task-1.budget",
      "tasks.task-1.completedVolume",
      "tasks.task-1.metrics",
      "tasks.task-1.spent",
      "tasks.task-1.targetVolume",
    ]);
  });

  it("preserves zero-denominator ratio states from aggregate numerators", () => {
    const report = assembleDailyReportFacts({
      reportDate: "2026-08-20",
      dataCutoffAt: "2026-08-20T23:59:59.000Z",
      currentMetrics: {
        accountCount: 1,
        cost: 100,
        exposure: 0,
        click: 0,
        conversion: 0,
        realConversion: 0,
        cashCost: 80,
        costSpace: -20,
        wakeUv: 0,
        potentialUv: 0,
        anomalyRows: 0,
      },
      previousMetrics: currentMetrics,
      tasks: [],
    });

    expect(report.summary?.ratios.ctr).toEqual({ value: null, state: "undefined" });
    expect(report.summary?.ratios.realCpa).toEqual({ value: null, state: "infinite" });
    expect(report.summary?.costSpace).toBe(-20);
  });

  it("rejects an invalid cutoff, duplicate task ids and inconsistent task dates", () => {
    expect(() =>
      assembleDailyReportFacts({
        reportDate: "2026-08-20",
        dataCutoffAt: "not-a-timestamp",
        currentMetrics,
        previousMetrics: currentMetrics,
        tasks: [],
      }),
    ).toThrow("dataCutoffAt");

    const task = {
      taskId: "duplicate",
      taskName: null,
      assessmentPrice: null,
      metrics: null,
      pacing: {
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        asOf: "2026-08-20",
        recentDailyVolumes: [],
      },
    };
    expect(() =>
      assembleDailyReportFacts({
        reportDate: "2026-08-20",
        dataCutoffAt: "2026-08-21T03:05:00.000Z",
        currentMetrics,
        previousMetrics: currentMetrics,
        tasks: [task, task],
      }),
    ).toThrow("taskId");

    expect(() =>
      assembleDailyReportFacts({
        reportDate: "2026-08-19",
        dataCutoffAt: "2026-08-21T03:05:00.000Z",
        currentMetrics,
        previousMetrics: currentMetrics,
        tasks: [task],
      }),
    ).toThrow("reportDate");
  });
});
