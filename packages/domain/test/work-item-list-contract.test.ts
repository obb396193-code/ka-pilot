import { describe, expect, it } from "vitest";

import { workItemListRequestSchema, workItemListResponseSchema } from "../src/work-item-list-contract.js";

const ready = {
  ok: true,
  data: {
    items: [{
      workItemId: "00000000-0000-4000-8000-000000000201",
      type: "diagnosis",
      status: "open",
      severity: "P1",
      title: "成本异常",
      account: {
        workspaceId: "00000000-0000-4000-8000-000000000024",
        media: "KUAISHOU",
        accountId: "account-1",
        accountName: null,
      },
      task: { taskId: "task-1", taskName: null },
      assignee: null,
      slaDue: "2026-08-26T12:00:00.000Z",
      createdAt: "2026-08-25T12:00:00.000Z",
      resolvedAt: null,
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
    selectedSource: "platform",
    requestId: "work-item-list-ready",
  },
} as const;

describe("WORK-ITEM-LIST-001 domain contract", () => {
  it("accepts frozen dispatched in both filter and item, without accepting arbitrary statuses", () => {
    expect(workItemListRequestSchema.safeParse({ status: "dispatched" }).success).toBe(true);
    expect(workItemListResponseSchema.safeParse({ ...ready, data: { ...ready.data,
      items: [{ ...ready.data.items[0], status: "dispatched" }],
    } }).success).toBe(true);
    expect(workItemListRequestSchema.safeParse({ status: "dispatch" }).success).toBe(false);
  });

  it("applies frozen defaults and accepts only frozen filters", () => {
    expect(workItemListRequestSchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(workItemListRequestSchema.parse({
      page: 2, pageSize: 100, q: "成本", status: "done", severity: "P0",
      type: "diagnosis", assigneeUserId: "00000000-0000-4000-8000-000000000001", taskId: "task-1",
    })).toMatchObject({ page: 2, status: "done" });
  });

  it("rejects forged scope/source and invalid filters", () => {
    for (const invalid of [
      { workspaceId: "forged" }, { accountIds: ["forged"] }, { dataSource: "qihang" },
      { page: 0 }, { pageSize: 101 }, { q: "x".repeat(101) }, { status: "pending" },
      { severity: "P3" }, { type: "change" }, { assigneeUserId: "bad" }, { taskId: "" },
    ]) expect(() => workItemListRequestSchema.parse(invalid)).toThrow();
  });

  it("accepts account/null projections but rejects full diagnosis or invalid identity", () => {
    expect(workItemListResponseSchema.parse(ready)).toEqual(ready);
    expect(workItemListResponseSchema.safeParse({
      ...ready,
      data: { ...ready.data, items: [{
        ...ready.data.items[0], type: "self", severity: null, account: null, task: null,
      }] },
    }).success).toBe(true);
    for (const item of [
      { ...ready.data.items[0], evidenceSnapshot: { raw: true } },
      { ...ready.data.items[0], account: { ...ready.data.items[0].account, media: "bad-media" } },
      { ...ready.data.items[0], workItemId: "not-uuid" },
    ]) expect(workItemListResponseSchema.safeParse({
      ...ready, data: { ...ready.data, items: [item] },
    }).success).toBe(false);
  });

  it("accepts only the stable error envelope", () => {
    const error = { ok: false, error: {
      code: "INVALID_REQUEST", message: "Invalid work item list request",
      retryable: false, requestId: "work-item-list-error",
    } } as const;
    expect(workItemListResponseSchema.parse(error)).toEqual(error);
    expect(workItemListResponseSchema.safeParse({
      ...error, error: { ...error.error, sql: "select 1" },
    }).success).toBe(false);
  });
});
