import { describe, expect, it, vi } from "vitest";

import type { WorkItemListResponse } from "@ka/domain";
import {
  WorkItemListRepositoryContractError,
  type WorkItemListRepositoryResult,
} from "@ka/db";

import {
  WorkItemListService,
  WorkItemListSourceError,
} from "../src/work-items/work-item-list-service.js";

const workspaceId = "00000000-0000-4000-8000-000000000024";
const userId = "00000000-0000-4000-8000-000000000001";
const auth = {
  workspaceId,
  userId,
  allowedAccounts: [
    { media: "KUAISHOU", accountId: "account-1" },
    { media: "TENCENT", accountId: "account-1" },
  ],
};

function readyResult(
  overrides: Partial<WorkItemListRepositoryResult> = {},
): WorkItemListRepositoryResult {
  return {
    rows: [{
      workItemId: "00000000-0000-4000-8000-000000000201",
      workspaceId,
      type: "diagnosis",
      status: "open",
      severity: "P1",
      title: "成本异常",
      media: "KUAISHOU",
      accountId: "account-1",
      accountName: "账户一",
      taskId: "task-1",
      taskName: null,
      assigneeUserId: userId,
      assigneeDisplayName: "脱敏优化师",
      creatorUserId: userId,
      slaDue: "2026-08-26T12:00:00.000Z",
      createdAt: "2026-08-25T12:00:00.000Z",
      resolvedAt: null,
    }],
    page: 1,
    pageSize: 20,
    total: 1,
    accountItemCount: 1,
    dataAsOf: "2026-08-25T12:00:00.000Z",
    coverageComplete: true,
    initialFullComplete: true,
    ...overrides,
  };
}

function personalResult(): WorkItemListRepositoryResult {
  const source = readyResult({ accountItemCount: 0, initialFullComplete: false });
  source.rows[0] = {
    ...source.rows[0]!,
    type: "agent_question",
    media: null,
    accountId: null,
    accountName: null,
    taskId: null,
    taskName: null,
    assigneeUserId: null,
    assigneeDisplayName: null,
    creatorUserId: userId,
  };
  return source;
}

function serviceFor(result: WorkItemListRepositoryResult | Error) {
  const list = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { service: new WorkItemListService({ repository: { list } }), list };
}

function expectError(response: WorkItemListResponse, code: string): void {
  expect(response).toMatchObject({ ok: false, error: { code } });
}

describe("WorkItemListService", () => {
  it("injects approved tuple scope and the Shanghai 03:00 business date", async () => {
    const { service, list } = serviceFor(readyResult());
    await service.execute(
      { page: 2, pageSize: 10, severity: "P1" },
      auth,
      "work-list-scope",
      new Date("2026-08-24T19:00:00.000Z"),
    );
    expect(list).toHaveBeenCalledWith({
      workspaceId,
      requestingUserId: userId,
      businessDate: "2026-08-25",
      allowedAccounts: auth.allowedAccounts,
      page: 2,
      pageSize: 10,
      severity: "P1",
    });
  });

  it("maps only the frozen list DTO and preserves nullable joined objects", async () => {
    const response = await serviceFor(readyResult()).service.execute(
      {}, auth, "work-list-ready", new Date("2026-08-25T04:00:00Z"),
    );
    expect(response).toMatchObject({
      ok: true,
      data: {
        items: [{
          workItemId: "00000000-0000-4000-8000-000000000201",
          account: { media: "KUAISHOU", accountId: "account-1" },
          task: { taskId: "task-1", taskName: null },
          assignee: { userId, displayName: "脱敏优化师" },
        }],
      },
      meta: { selectedSource: "platform", dataState: "ready" },
    });
    expect(JSON.stringify(response)).not.toContain("creatorUserId");
    expect(JSON.stringify(response)).not.toContain("evidenceSnapshot");
  });

  it("keeps a current user's persisted unscoped item ready without initial full", async () => {
    const response = await serviceFor(personalResult()).service.execute(
      {}, auth, "work-list-personal", new Date("2026-08-25T04:00:00Z"),
    );
    expect(response).toMatchObject({
      ok: true,
      data: { items: [{ account: null, task: null, assignee: null }] },
      meta: { dataState: "ready", coverage: { complete: true } },
    });
  });

  it("enforces dataState priority partial over stale over empty over ready", async () => {
    const cases = [
      [readyResult({ coverageComplete: false, initialFullComplete: false }), "partial"],
      [readyResult({ initialFullComplete: false }), "stale"],
      [readyResult({ rows: [], total: 0, accountItemCount: 0, dataAsOf: null }), "empty"],
      [readyResult(), "ready"],
    ] as const;
    for (const [result, expected] of cases) {
      const response = await serviceFor(result).service.execute(
        {}, auth, `work-list-${expected}`, new Date("2026-08-25T04:00:00Z"),
      );
      expect(response.ok && response.meta.dataState).toBe(expected);
    }
  });

  it("returns an empty successful page when the requested offset is beyond total", async () => {
    const source = readyResult({ rows: [], page: 2 });
    const response = await serviceFor(source).service.execute(
      { page: 2, pageSize: 20 },
      auth,
      "work-list-beyond-last-page",
      new Date("2026-08-25T04:00:00Z"),
    );
    expect(response).toMatchObject({
      ok: true,
      data: { items: [], page: 2, pageSize: 20, total: 1 },
      meta: { dataState: "ready" },
    });
  });

  it("rejects empty pages before total and non-empty pages beyond total", async () => {
    const emptyBeforeTotal = readyResult({ rows: [] });
    const nonEmptyBeyondTotal = readyResult({ page: 2 });
    expectError(await serviceFor(emptyBeforeTotal).service.execute(
      {}, auth, "work-list-empty-before-total", new Date("2026-08-25T04:00:00Z"),
    ), "UPSTREAM_INVALID_RESPONSE");
    expectError(await serviceFor(nonEmptyBeyondTotal).service.execute(
      { page: 2, pageSize: 20 },
      auth,
      "work-list-nonempty-beyond-total",
      new Date("2026-08-25T04:00:00Z"),
    ), "UPSTREAM_INVALID_RESPONSE");
  });

  it("returns 401/403/400 before Repository access", async () => {
    const { service, list } = serviceFor(readyResult());
    expectError(await service.execute({}, null, "work-401"), "UNAUTHORIZED");
    expectError(await service.execute({}, { ...auth, workspaceId: "forged" }, "work-403"), "FORBIDDEN");
    expectError(await service.execute({}, { ...auth, userId: "workspace-user" }, "work-user-403"), "FORBIDDEN");
    expectError(await service.execute({ dataSource: "qihang" }, auth, "work-400"), "INVALID_REQUEST");
    expect(list).not.toHaveBeenCalled();
  });

  it("fails the whole page closed for unauthorized account or personal rows", async () => {
    const outsideAccount = readyResult();
    outsideAccount.rows[0] = { ...outsideAccount.rows[0]!, accountId: "outside" };
    const otherPersonal = personalResult();
    otherPersonal.rows[0] = {
      ...otherPersonal.rows[0]!,
      creatorUserId: "00000000-0000-4000-8000-000000000099",
    };
    const mismatchedIdentity = readyResult();
    mismatchedIdentity.rows[0] = { ...mismatchedIdentity.rows[0]!, media: null };
    for (const result of [outsideAccount, otherPersonal, mismatchedIdentity]) {
      const response = await serviceFor(result).service.execute({}, auth, "work-scope-guard");
      expectError(response, "FORBIDDEN");
      expect(JSON.stringify(response)).not.toContain("outside");
    }
  });

  it("returns 502 for invalid pagination, lineage, joins or row schema", async () => {
    const invalidStatus = readyResult();
    invalidStatus.rows[0] = { ...invalidStatus.rows[0]!, status: "invented" };
    const invalidLineage = readyResult({ dataAsOf: null });
    const invalidTaskJoin = readyResult();
    invalidTaskJoin.rows[0] = { ...invalidTaskJoin.rows[0]!, taskId: null, taskName: "伪造任务" };
    const invalidTotal = readyResult({ total: 0 });
    const invalidAccountCount = readyResult({ accountItemCount: 0 });
    const staleLineage = readyResult({ dataAsOf: "2026-08-25T11:00:00.000Z" });
    for (const result of [
      invalidStatus, invalidLineage, invalidTaskJoin, invalidTotal,
      invalidAccountCount, staleLineage,
    ]) {
      expectError(await serviceFor(result).service.execute(
        {}, auth, "work-invalid", new Date("2026-08-25T04:00:00Z"),
      ), "UPSTREAM_INVALID_RESPONSE");
    }
  });

  it("maps source and unknown failures without leaking details", async () => {
    const invalid = await serviceFor(
      new WorkItemListSourceError("UPSTREAM_INVALID_RESPONSE", "raw row", false),
    ).service.execute({}, auth, "work-502");
    const unavailable = await serviceFor(
      new WorkItemListSourceError("SOURCE_UNAVAILABLE", "offline", true),
    ).service.execute({}, auth, "work-503");
    const timeout = await serviceFor(
      new WorkItemListSourceError("UPSTREAM_TIMEOUT", "timeout", true),
    ).service.execute({}, auth, "work-504");
    const repositoryInvalid = await serviceFor(
      new WorkItemListRepositoryContractError("bad count"),
    ).service.execute({}, auth, "work-repository-502");
    const unknown = await serviceFor(
      new Error("postgres://secret select evidence_snapshot"),
    ).service.execute({}, auth, "work-500");
    expectError(invalid, "UPSTREAM_INVALID_RESPONSE");
    expectError(unavailable, "SOURCE_UNAVAILABLE");
    expectError(timeout, "UPSTREAM_TIMEOUT");
    expectError(repositoryInvalid, "UPSTREAM_INVALID_RESPONSE");
    expectError(unknown, "INTERNAL_ERROR");
    expect(JSON.stringify(unknown)).not.toContain("secret");
    expect(JSON.stringify(unknown)).not.toContain("evidence_snapshot");
  });
});
