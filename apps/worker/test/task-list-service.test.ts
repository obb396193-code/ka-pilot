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
      // v1.9.28 任务管理视图的三个字段（be2 Q-043）：仓储行现在恒有它们。
      aliases: [],
      monitorUrl: null,
      productName: null,
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
      // v1.5.1 ②（S6）新增的仓储字段
      stage: "delivering",
      stageSource: "system",
      stageChangedAt: null,
      sopRunId: null,
      readinessFacts: {
        accountCount: 1, rechargedCount: 0, builtCount: 0,
        unfundedAccounts: ["account-1"], unbuiltAccounts: ["account-1"],
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
    // v1.9.28 起 paused 是合法状态（停投），换一个真正认不出的值当反例。
    invalidStatus.rows[0] = { ...invalidStatus.rows[0]!, status: "stopped" };
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

/**
 * 绊线：v1.9.37（Q-043 ⑦）的 `budget` **产出路径必须恒发**。
 *
 * 它在 schema 里暂为 optional，只因为几份冻结 fixture 是这个字段存在之前从真响应导出的，
 * 转必填会把它们全判非法。**「optional」不等于「可以不发」**——没有这条绊线，漏发它不会有
 * 任何东西报警，页面只是不显示预算列，而「后端没发」与「这些任务都没填预算」长得一模一样。
 * fixture 重导、`budget` 转必填之后，这条绊线退役。
 */
describe("v1.9.37 task list always emits budget", () => {
  async function itemFor(budget: number | null) {
    const base = readyResult();
    const { service } = serviceFor({ ...base, rows: [{ ...base.rows[0]!, budget }] });
    const response = await service.execute({}, auth, "task-list-budget", new Date("2026-08-25T04:00:00Z"));
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error("unreachable");
    return response.data.items[0]!;
  }

  it("emits it as a MetricValue reading the same column the task detail reads", async () => {
    expect(await itemFor(10_000)).toMatchObject({ budget: { value: 10_000, availability: "available" } });
  });

  it("reports an unset budget as missing, never as zero and never by omission", async () => {
    // 「没填预算」和「预算填了 0」是两件事：压成 0 会让页面显示一个这个任务根本没有的上限，
    // 整个键不发又让前端分不清是后端没算还是真没填。
    const item = await itemFor(null);
    expect(item).toHaveProperty("budget");
    expect(item.budget).toEqual({ value: null, availability: "missing" });
  });

  it("does not disturb the pacing budget, which is a different consumer of the same column", async () => {
    // pacing 里的 budget 是拿去算进度的；这一列是直接显示给人看的。两者同源但不同用途，
    // 加这一列不该改动任何进度数字。
    const { service } = serviceFor(readyResult());
    const response = await service.execute({}, auth, "task-list-budget-pacing", new Date("2026-08-25T04:00:00Z"));
    if (!response.ok) throw new Error("unreachable");
    const item = response.data.items[0]!;
    expect(item.pacing?.budgetProgress).toEqual(
      computeTaskPacing({
        periodStart: "2026-08-01", periodEnd: "2026-08-31", asOf: "2026-08-25",
        targetVolume: 1_000, completedVolume: 420, budget: 10_000, spent: 4_000,
        recentDailyVolumes: [20, 22, 24, 26, 28, 30, 32],
      }).budgetProgress,
    );
  });
});
