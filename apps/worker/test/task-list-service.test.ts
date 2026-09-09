import { describe, expect, it, vi } from "vitest";

import {
  computeTaskPacing,
  type ApprovedWorkspaceAuthContext,
  type TaskListResponse,
} from "@ka/domain";
import type {
  TaskListRepositoryResult,
} from "@ka/db";

import {
  TaskListService,
  TaskListSourceError,
} from "../src/tasks/task-list-service.js";

const workspaceId = "00000000-0000-4000-8000-000000000024";
const auth = {
  workspaceId,
  userId: "00000000-0000-4000-8000-000000000001",
  role: "admin",
  workspaceKind: "personal",
  scope: {
    kind: "explicit_accounts",
    accounts: [{ media: "KUAISHOU", accountId: "account-1", accessLevel: "read" }],
  },
} satisfies ApprovedWorkspaceAuthContext;

function readyResult(overrides: Partial<TaskListRepositoryResult> = {}): TaskListRepositoryResult {
  return {
    rows: [{
      workspaceId,
      taskId: "opaque-task-1",
      taskName: "任务一",
      bizName: null,
      status: "active",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      targetVolume: 1_000,
      budget: 10_000,
      owner: {
        userId: "00000000-0000-4000-8000-000000000001",
        displayName: "脱敏优化师",
      },
      assessmentPrice: { value: 38, effectiveDate: "2026-08-01" },
      linkedAccountCount: 1,
      totalLinkedAccountCount: 1,
      completedVolume: 420,
      spent: 4_000,
      recentDailyVolumes: [20, 22, 24, 26, 28, 30, 32],
      workItemSummary: {
        openCount: 1,
        highestSeverity: "P1",
        counts: { P0: 0, P1: 1, P2: 0, opportunity: 0 },
      },
      latestMetricDate: "2026-08-25",
      dataAsOf: "2026-08-25T12:00:00.000Z",
      // Explicit synthetic S6 facts, not application readiness defaults.
      stage: null,
      stageSource: null,
      stageChangedAt: null,
      sopRunId: null,
      readinessFacts: { accountCount: 1, rechargedCount: 0, builtCount: 0,
        unfundedAccounts: ["account-1"], unbuiltAccounts: ["account-1"] },
      // v1.5.1 ②（S6）新增的仓储字段
      stage: "delivering",
      stageSource: "system",
      stageChangedAt: null,
      sopRunId: null,
      readinessFacts: {
        accountCount: 0, rechargedCount: 0, builtCount: 0,
        unfundedAccounts: [], unbuiltAccounts: [],
      },
      readinessOverrides: [],
    }],
    page: 1,
    pageSize: 20,
    total: 1,
    coverageComplete: true,
    initialFullComplete: true,
    ...overrides,
  };
}

function serviceFor(result: TaskListRepositoryResult | Error) {
  const list = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { service: new TaskListService({ repository: { list } }), list };
}

function expectError(response: TaskListResponse, code: string): void {
  expect(response).toMatchObject({ ok: false, error: { code } });
}

describe("TaskListService", () => {
  it("passes a grant-free readonly scope for team tasks", async () => {
    const teamAuth: ApprovedWorkspaceAuthContext = {
      workspaceId,
      userId: auth.userId,
      role: "optimizer",
      workspaceKind: "team",
      scope: { kind: "team_workspace_readonly" },
    };
    const { service, list } = serviceFor(readyResult());
    const response = await service.execute(
      {}, teamAuth, "task-list-team", new Date("2026-08-25T04:00:00Z"),
    );
    expect(response).toMatchObject({ ok: true, data: { total: 1 } });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      scopeKind: "team_workspace_readonly",
      allowedAccounts: [],
    }));
  });

  it("injects approved auth scope and Shanghai 03:00 business date", async () => {
    const { service, list } = serviceFor(readyResult());
    await service.execute(
      { page: 2, pageSize: 10, q: "任务" },
      auth,
      "task-list-scope-001",
      new Date("2026-08-24T19:00:00.000Z"),
    );

    expect(list).toHaveBeenCalledWith({
      workspaceId,
      requestingUserId: auth.userId,
      businessDate: "2026-08-25",
      scopeKind: "explicit_accounts",
      allowedAccounts: auth.scope.accounts.map(({ media, accountId }) => ({ media, accountId })),
      page: 2,
      pageSize: 10,
      q: "任务",
    });
  });

  it("projects pacing field-for-field from computeTaskPacing", async () => {
    const source = readyResult();
    const { service } = serviceFor(source);
    const response = await service.execute({}, auth, "task-list-pacing-001", new Date("2026-08-25T04:00:00Z"));
    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const row = source.rows[0]!;
    const expected = computeTaskPacing({
      periodStart: row.periodStart!,
      periodEnd: row.periodEnd!,
      asOf: "2026-08-25",
      targetVolume: row.targetVolume,
      completedVolume: row.completedVolume,
      budget: row.budget,
      spent: row.spent,
      recentDailyVolumes: row.recentDailyVolumes,
    });
    expect(response.data.items[0]?.pacing).toEqual({
      asOf: "2026-08-25",
      elapsedDays: expected.elapsedDays,
      totalDays: expected.totalDays,
      remainingDays: expected.remainingDays,
      targetProgress: expected.targetProgress,
      timeProgress: expected.timeProgress,
      projectedVolume: expected.projectedVolume,
      projectedCompletion: expected.projectedCompletion,
      projectedGap: expected.projectedGap,
      requiredDailyVolume: expected.requiredDailyVolume,
      budgetProgress: expected.budgetProgress,
    });
    expect(response.data.items[0]?.pacing).not.toHaveProperty("recentDailyAverage");
  });

  it("returns explicit nulls when period or volume facts are unavailable", async () => {
    const source = readyResult();
    source.rows[0] = {
      ...source.rows[0]!,
      periodEnd: null,
      targetVolume: null,
      completedVolume: null,
      budget: null,
      spent: null,
      recentDailyVolumes: [],
      linkedAccountCount: 0,
      totalLinkedAccountCount: 0,
      latestMetricDate: null,
      dataAsOf: null,
    };
    const { service } = serviceFor(source);
    const response = await service.execute({}, auth, "task-list-null-001", new Date("2026-08-25T04:00:00Z"));
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.data.items[0]).toMatchObject({
      period: null,
      volume: null,
      pacing: null,
    });
    expect(response.meta.dataState).toBe("ready");
  });

  it("enforces dataState priority partial over stale over empty over ready", async () => {
    const partial = readyResult({ coverageComplete: false });
    partial.rows[0] = {
      ...partial.rows[0]!,
      latestMetricDate: "2026-08-24",
      dataAsOf: "2026-08-24T12:00:00.000Z",
    };
    const stale = readyResult();
    stale.rows[0] = {
      ...stale.rows[0]!,
      latestMetricDate: "2026-08-24",
      dataAsOf: "2026-08-24T12:00:00.000Z",
    };
    const empty = readyResult({ rows: [], total: 0 });
    const noAccountFacts = readyResult();
    noAccountFacts.rows[0] = {
      ...noAccountFacts.rows[0]!,
      linkedAccountCount: 0,
      totalLinkedAccountCount: 0,
      latestMetricDate: null,
      dataAsOf: null,
    };

    for (const [result, state] of [
      [partial, "partial"],
      [stale, "stale"],
      [empty, "empty"],
      [noAccountFacts, "ready"],
    ] as const) {
      const response = await serviceFor(result).service.execute(
        {},
        auth,
        `task-list-state-${state}`,
        new Date("2026-08-25T04:00:00Z"),
      );
      expect(response.ok && response.meta.dataState).toBe(state);
    }
  });

  it("never reports ready before this user has a successful initial full sync", async () => {
    const response = await serviceFor(readyResult({ initialFullComplete: false })).service.execute(
      {},
      auth,
      "task-list-initial-full-required",
      new Date("2026-08-25T04:00:00Z"),
    );
    expect(response).toMatchObject({
      ok: true,
      meta: {
        dataState: "partial",
        coverage: { complete: false },
      },
    });
  });

  it("returns 401/403/400 before the repository is called", async () => {
    const { service, list } = serviceFor(readyResult());
    expectError(await service.execute({}, null, "task-list-unauthorized"), "UNAUTHORIZED");
    expectError(await service.execute({}, { ...auth, workspaceId: "forged" }, "task-list-forbidden"), "FORBIDDEN");
    expectError(await service.execute({ dataSource: "ka_data" }, auth, "task-list-invalid"), "INVALID_REQUEST");
    expect(list).not.toHaveBeenCalled();
  });

  it("fails closed with 502 for an invalid repository contract", async () => {
    const invalidStatus = readyResult();
    invalidStatus.rows[0] = { ...invalidStatus.rows[0]!, status: "paused" };
    expectError(
      await serviceFor(invalidStatus).service.execute({}, auth, "task-list-invalid-status"),
      "UPSTREAM_INVALID_RESPONSE",
    );

    const crossWorkspace = readyResult();
    crossWorkspace.rows[0] = { ...crossWorkspace.rows[0]!, workspaceId: randomWorkspace() };
    expectError(
      await serviceFor(crossWorkspace).service.execute({}, auth, "task-list-cross-workspace"),
      "UPSTREAM_INVALID_RESPONSE",
    );
  });

  it("maps source unavailable, timeout and unknown failures without leaking details", async () => {
    const unavailable = await serviceFor(
      new TaskListSourceError("SOURCE_UNAVAILABLE", "connector unavailable", true),
    ).service.execute({}, auth, "task-list-503");
    const timeout = await serviceFor(
      new TaskListSourceError("UPSTREAM_TIMEOUT", "connector timeout", true),
    ).service.execute({}, auth, "task-list-504");
    const unknown = await serviceFor(
      new Error("postgres://user:secret@host/db select * from accounts"),
    ).service.execute({}, auth, "task-list-500");

    expectError(unavailable, "SOURCE_UNAVAILABLE");
    expectError(timeout, "UPSTREAM_TIMEOUT");
    expectError(unknown, "INTERNAL_ERROR");
    expect(JSON.stringify(unknown)).not.toContain("secret");
    expect(JSON.stringify(unknown)).not.toContain("select");
  });

  it("preserves a safe BFF requestId in success and error envelopes", async () => {
    const success = await serviceFor(readyResult()).service.execute(
      {}, auth, "bff-task-list-001", new Date("2026-08-25T04:00:00Z"),
    );
    const error = await serviceFor(readyResult()).service.execute(
      { unknown: true }, auth, "bff-task-list-002",
    );
    expect(success.ok && success.meta.requestId).toBe("bff-task-list-001");
    expect(!error.ok && error.error.requestId).toBe("bff-task-list-002");
  });
});

function randomWorkspace(): string {
  return "00000000-0000-4000-8000-000000000099";
}
