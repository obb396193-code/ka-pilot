import { describe, expect, it } from "vitest";

import { computeTaskPacing } from "../src/task-pacing.js";

describe("computeTaskPacing", () => {
  it("computes calendar-day pacing from complete data days", () => {
    const pacing = computeTaskPacing({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      asOf: "2026-08-20",
      targetVolume: 500_000,
      completedVolume: 312_000,
      budget: 600_000,
      spent: 400_000,
      recentDailyVolumes: [13_000, 14_000, 15_000, 16_000, 16_000],
    });

    expect(pacing.elapsedDays).toBe(20);
    expect(pacing.totalDays).toBe(31);
    expect(pacing.remainingDays).toBe(11);
    expect(pacing.targetProgress.value).toBeCloseTo(0.624);
    expect(pacing.timeProgress.value).toBeCloseTo(20 / 31);
    expect(pacing.recentDailyAverage).toBe(14_800);
    expect(pacing.projectedVolume).toBe(474_800);
    expect(pacing.projectedCompletion.value).toBeCloseTo(0.9496);
    expect(pacing.projectedGap).toBe(25_200);
    expect(pacing.requiredDailyVolume.value).toBeCloseTo(188_000 / 11);
    expect(pacing.budgetProgress.value).toBeCloseTo(2 / 3);
  });

  it("uses only the last seven complete data-day samples and preserves zeroes", () => {
    const pacing = computeTaskPacing({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      asOf: "2026-08-10",
      targetVolume: 100,
      completedVolume: 10,
      recentDailyVolumes: [99, 1, 2, 0, 4, 5, 6, 7],
    });

    expect(pacing.recentDailyAverage).toBeCloseTo(25 / 7);
  });

  it("accepts a caller-owned effective-day calendar", () => {
    const pacing = computeTaskPacing({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      asOf: "2026-08-20",
      targetVolume: 100,
      completedVolume: 50,
      recentDailyVolumes: [5],
      remainingEffectiveDays: ["2026-08-22", "2026-08-25", "2026-08-31"],
    });

    expect(pacing.remainingDays).toBe(3);
    expect(pacing.projectedVolume).toBe(65);
    expect(pacing.requiredDailyVolume.value).toBeCloseTo(50 / 3);
  });

  it("reports the end-day gap without treating the end day as remaining", () => {
    const pacing = computeTaskPacing({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      asOf: "2026-08-31",
      targetVolume: 100,
      completedVolume: 80,
      recentDailyVolumes: [10],
    });

    expect(pacing.elapsedDays).toBe(31);
    expect(pacing.remainingDays).toBe(0);
    expect(pacing.projectedVolume).toBe(80);
    expect(pacing.projectedGap).toBe(20);
    expect(pacing.requiredDailyVolume).toEqual({ value: null, state: "infinite" });
  });

  it("caps elapsed time after the task has ended", () => {
    const pacing = computeTaskPacing({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      asOf: "2026-09-03",
      targetVolume: 100,
      completedVolume: 120,
      recentDailyVolumes: [10],
    });

    expect(pacing.elapsedDays).toBe(31);
    expect(pacing.remainingDays).toBe(0);
    expect(pacing.targetProgress.value).toBeCloseTo(1.2);
    expect(pacing.projectedGap).toBe(0);
    expect(pacing.requiredDailyVolume).toEqual({ value: null, state: "undefined" });
  });

  it("keeps a zero target distinguishable from a missing target", () => {
    const pacing = computeTaskPacing({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      asOf: "2026-08-20",
      targetVolume: 0,
      completedVolume: 0,
      recentDailyVolumes: [0],
    });

    expect(pacing.targetProgress).toEqual({ value: null, state: "undefined" });
    expect(pacing.projectedCompletion).toEqual({ value: null, state: "undefined" });
    expect(pacing.projectedGap).toBe(0);
    expect(pacing.requiredDailyVolume).toEqual({ value: 0, state: "finite" });
  });

  it("keeps missing targets and samples explicit", () => {
    const pacing = computeTaskPacing({
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      asOf: "2026-08-01",
      recentDailyVolumes: [],
    });

    expect(pacing.targetProgress).toEqual({ value: null, state: "undefined" });
    expect(pacing.recentDailyAverage).toBeNull();
    expect(pacing.projectedVolume).toBeNull();
    expect(pacing.projectedCompletion).toEqual({ value: null, state: "undefined" });
    expect(pacing.projectedGap).toBeNull();
    expect(pacing.requiredDailyVolume).toEqual({ value: null, state: "undefined" });
  });

  it("rejects invalid dates, negative facts and invalid effective days", () => {
    expect(() =>
      computeTaskPacing({
        periodStart: "2026-08-31",
        periodEnd: "2026-08-01",
        asOf: "2026-08-20",
        recentDailyVolumes: [],
      }),
    ).toThrow("periodStart");

    expect(() =>
      computeTaskPacing({
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        asOf: "2026-08-20",
        completedVolume: -1,
        recentDailyVolumes: [],
      }),
    ).toThrow("completedVolume");

    expect(() =>
      computeTaskPacing({
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
        asOf: "2026-08-20",
        recentDailyVolumes: [1],
        remainingEffectiveDays: ["2026-08-20"],
      }),
    ).toThrow("remainingEffectiveDays");
  });
});
