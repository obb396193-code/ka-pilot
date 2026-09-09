import { describe, expect, it } from "vitest";

import {
  shanghaiTaskBusinessDate,
  taskListRequestSchema,
  taskListResponseSchema,
} from "../src/task-list-contract.js";

const requestId = "task-list-contract-fixture";

const successFixture = {
  ok: true,
  data: {
    items: [{
      taskId: "opaque-task-1",
      taskName: "任务一",
      bizName: null,
      status: "active",
      period: { start: "2026-08-01", end: "2026-08-31" },
      owner: {
        userId: "00000000-0000-4000-8000-000000000001",
        displayName: "运营甲",
      },
      assessmentPrice: { value: 38, effectiveDate: "2026-08-01" },
      volume: { target: 1_000, completed: 420 },
      pacing: {
        asOf: "2026-08-25",
        elapsedDays: 25,
        totalDays: 31,
        remainingDays: 6,
        targetProgress: { value: 0.42, state: "finite" },
        timeProgress: { value: 25 / 31, state: "finite" },
        projectedVolume: 610,
        projectedCompletion: { value: 0.61, state: "finite" },
        projectedGap: 390,
        requiredDailyVolume: { value: 580 / 6, state: "finite" },
        budgetProgress: { value: null, state: "undefined" },
      },
      linkedAccountCount: 8,
      workItemSummary: {
        openCount: 2,
        highestSeverity: "P1",
        counts: { P0: 0, P1: 1, P2: 1, opportunity: 0 },
      },
      // v1.5.1 ② 的新字段现在必填（fixture 已升级）：漏发一个就该解析失败。
      // 三段没有系统来源的必须是 undefined + 需人工确认，不是 0 分。
      stage: "delivering",
      stageSource: "system",
      readiness: {
        accounts: { ratio: { value: 1, state: "finite" }, ready: true, source: "system", missing: [] },
        recharge: { ratio: { value: 1, state: "finite" }, ready: true, source: "system", missing: [] },
        products: { ratio: { value: null, state: "undefined" }, ready: false, source: "system", missing: ["无系统来源，需人工确认"] },
        materials: { ratio: { value: null, state: "undefined" }, ready: false, source: "system", missing: ["无系统来源，需人工确认"] },
        strategy: { ratio: { value: null, state: "undefined" }, ready: false, source: "system", missing: ["无系统来源，需人工确认"] },
        infra: { ratio: { value: 1, state: "finite" }, ready: true, source: "system", missing: [] },
      },
      nextMilestone: null,
    }],
    page: 1,
    pageSize: 20,
    total: 1,
  },
  meta: {
    dataState: "ready",
    businessDate: "2026-08-25",
    dataAsOf: "2026-08-25T12:00:00.000Z",
    coverage: { complete: true },
    selectedSource: "qihang",
    requestId,
  },
} as const;

describe("TASK-LIST-001 domain contract", () => {
  it("applies frozen pagination defaults and accepts only frozen filters", () => {
    expect(taskListRequestSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(taskListRequestSchema.parse({
      page: 2,
      pageSize: 100,
      q: "任务",
      status: "preparing",
      ownerUserId: "00000000-0000-4000-8000-000000000001",
      periodFrom: "2026-08-01",
      periodTo: "2026-08-31",
      hasOpenWorkItems: false,
    })).toMatchObject({ page: 2, pageSize: 100, hasOpenWorkItems: false });
  });

  it("rejects browser-forged scope, source and unknown query fields", () => {
    for (const forbidden of [
      { workspaceId: "forged" },
      { userId: "forged" },
      { accountIds: ["forged"] },
      { dataSource: "ka_data" },
      { unknown: "field" },
    ]) {
      expect(() => taskListRequestSchema.parse(forbidden)).toThrow();
    }
  });

  it("rejects invalid bounds, status, UUIDs and real calendar dates", () => {
    for (const invalid of [
      { page: 0 },
      { pageSize: 101 },
      { q: "x".repeat(101) },
      { status: "paused" },
      { ownerUserId: "not-a-uuid" },
      { periodFrom: "2026-02-31" },
      { periodFrom: "2026-09-01", periodTo: "2026-08-01" },
    ]) {
      expect(() => taskListRequestSchema.parse(invalid)).toThrow();
    }
  });

  it("accepts the strict success response and rejects unknown or invalid fields", () => {
    expect(taskListResponseSchema.parse(successFixture)).toEqual(successFixture);
    expect(() => taskListResponseSchema.parse({
      ...successFixture,
      data: { ...successFixture.data, internalSql: "select 1" },
    })).toThrow();
    expect(() => taskListResponseSchema.parse({
      ...successFixture,
      data: {
        ...successFixture.data,
        items: [{ ...successFixture.data.items[0], taskId: "x".repeat(129) }],
      },
    })).toThrow();
    expect(() => taskListResponseSchema.parse({
      ...successFixture,
      data: {
        ...successFixture.data,
        items: [{
          ...successFixture.data.items[0],
          pacing: {
            ...successFixture.data.items[0].pacing,
            targetProgress: { value: 0, state: "undefined" },
          },
        }],
      },
    })).toThrow();
  });

  it("allows explicit missing fields without fabricating business facts", () => {
    const item = successFixture.data.items[0];
    const parsed = taskListResponseSchema.parse({
      ...successFixture,
      data: {
        ...successFixture.data,
        items: [{
          ...item,
          taskName: null,
          period: null,
          owner: null,
          assessmentPrice: null,
          volume: null,
          pacing: null,
        }],
      },
      meta: { ...successFixture.meta, dataAsOf: null, dataState: "stale" },
    });
    if (!parsed.ok) throw new Error("expected a success fixture");
    expect(parsed.data.items[0]?.pacing).toBeNull();
    expect(parsed.meta.dataAsOf).toBeNull();
  });

  it("accepts only the stable error envelope", () => {
    const error = {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid task list request",
        retryable: false,
        requestId,
      },
    } as const;
    expect(taskListResponseSchema.parse(error)).toEqual(error);
    expect(() => taskListResponseSchema.parse({
      ...error,
      error: { ...error.error, sql: "select secret" },
    })).toThrow();
  });
});

describe("Shanghai 03:00 task business date", () => {
  it("rolls over at 03:00 Asia/Shanghai", () => {
    expect(shanghaiTaskBusinessDate(new Date("2026-08-24T18:59:59.999Z")))
      .toBe("2026-08-24");
    expect(shanghaiTaskBusinessDate(new Date("2026-08-24T19:00:00.000Z")))
      .toBe("2026-08-25");
  });

  it("handles the year boundary without locale-dependent formatting", () => {
    expect(shanghaiTaskBusinessDate(new Date("2026-12-31T18:59:59.999Z")))
      .toBe("2026-12-31");
    expect(shanghaiTaskBusinessDate(new Date("2026-12-31T19:00:00.000Z")))
      .toBe("2027-01-01");
  });

  it("fails closed for invalid instants", () => {
    expect(() => shanghaiTaskBusinessDate(new Date("invalid"))).toThrow();
  });
});
