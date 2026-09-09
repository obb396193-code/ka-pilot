import { describe, expect, it } from "vitest";

import {
  accountListRequestSchema,
  accountListResponseSchema,
} from "../src/account-list-contract.js";

const ready = {
  ok: true,
  data: {
    items: [{
      workspaceId: "00000000-0000-4000-8000-000000000024",
      media: "KUAISHOU",
      accountId: "account-1",
      accountName: "账户一",
      status: "active",
      lifecycleStage: "declining",
      starred: true,
      tags: ["重点"],
      owner: { userId: "00000000-0000-4000-8000-000000000001", displayName: "优化师甲" },
      linkedTasks: [{ taskId: "task-1", taskName: "任务一" }],
      metrics: {
        businessDate: "2026-08-25",
        cost: 120.5,
        realConversion: 8,
        realCpa: { value: 15.0625, state: "finite" },
        assessmentPrice: 38,
      },
      balance: {
        value: 1_000, syncedAt: "2026-08-25T12:00:00.000Z",
        // v1.5.1 ①：balance 在就必须带 cutoff（断量倒计时）；velocity 无源时是 unknown 而不是缺省。
        cutoff: { hours: { value: null, availability: "missing" }, state: "unknown" },
      },
      // v1.5.1 ① 的新字段现在必填（fixture 已升级）：漏发一个就该解析失败。
      poolStatus: "in_delivery",
      poolStatusSource: "system",
      product: null,
      dailyBudgetCap: null,
      capacityLoad: { value: null, state: "undefined" },
      lastAction: null,
      nextSuggestion: null,
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
    requestId: "account-contract-ready",
  },
} as const;

describe("ACCOUNTS-LIST-001 domain contract", () => {
  it("applies frozen defaults and accepts only frozen filters", () => {
    expect(accountListRequestSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(accountListRequestSchema.parse({
      page: 2,
      pageSize: 100,
      q: "账户",
      media: "KUAISHOU",
      stage: "cold_start",
      starred: false,
      tags: ["重点", "测试"],
      ownerUserId: "00000000-0000-4000-8000-000000000001",
      status: "active",
    })).toMatchObject({ page: 2, pageSize: 100, starred: false });
  });

  it("rejects forged scope/source, bad filters and duplicate tags", () => {
    for (const invalid of [
      { workspaceId: "forged" },
      { accountIds: ["forged"] },
      { dataSource: "ka_data" },
      { page: 0 },
      { pageSize: 101 },
      { q: "x".repeat(101) },
      { media: "TENCENT" },
      { stage: "new" },
      { tags: ["same", "same"] },
      { tags: Array.from({ length: 11 }, (_, index) => `tag-${index}`) },
      { ownerUserId: "not-a-uuid" },
      { status: "" },
    ]) expect(() => accountListRequestSchema.parse(invalid)).toThrow();
  });

  it("accepts explicit missing sources and rejects fabricated/invalid shapes", () => {
    expect(accountListResponseSchema.parse(ready)).toEqual(ready);
    const item = ready.data.items[0];
    expect(accountListResponseSchema.safeParse({
      ...ready,
      data: { ...ready.data, items: [{
        ...item,
        accountName: null,
        status: null,
        owner: null,
        linkedTasks: [],
        metrics: null,
        balance: null,
      }] },
      meta: { ...ready.meta, dataState: "stale", dataAsOf: null },
    }).success).toBe(true);
    for (const invalidItem of [
      { ...item, media: "TENCENT" },
      { ...item, linkedTasks: [{ taskId: "z", taskName: null }, { taskId: "a", taskName: null }] },
      { ...item, tags: ["same", "same"] },
      { ...item, metrics: { ...item.metrics, realCpa: { value: 0, state: "undefined" } } },
      { ...item, internalSql: "select 1" },
    ]) {
      expect(accountListResponseSchema.safeParse({
        ...ready,
        data: { ...ready.data, items: [invalidItem] },
      }).success).toBe(false);
    }
  });

  it("accepts only the stable error envelope", () => {
    const error = {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid account list request",
        retryable: false,
        requestId: "account-contract-error",
      },
    } as const;
    expect(accountListResponseSchema.parse(error)).toEqual(error);
    expect(accountListResponseSchema.safeParse({
      ...error,
      error: { ...error.error, upstreamBody: "secret" },
    }).success).toBe(false);
  });
});
