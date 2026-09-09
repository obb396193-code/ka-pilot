import { describe, expect, it, vi } from "vitest";

import type { AccountListResponse, ApprovedWorkspaceAuthContext } from "@ka/domain";
import {
  AccountListRepositoryContractError,
  type AccountListRepositoryResult,
} from "@ka/db";

import {
  AccountListService,
  AccountListSourceError,
} from "../src/accounts/account-list-service.js";

const workspaceId = "00000000-0000-4000-8000-000000000024";
const userId = "00000000-0000-4000-8000-000000000001";
const auth = {
  workspaceId,
  userId,
  role: "admin",
  workspaceKind: "personal",
  scope: {
    kind: "explicit_accounts",
    accounts: [
      { media: "KUAISHOU", accountId: "account-1", accessLevel: "read" },
      { media: "TENCENT", accountId: "account-1", accessLevel: "read" },
    ],
  },
} satisfies ApprovedWorkspaceAuthContext;

function readyResult(overrides: Partial<AccountListRepositoryResult> = {}): AccountListRepositoryResult {
  return {
    rows: [{
      workspaceId,
      media: "KUAISHOU",
      accountId: "account-1",
      accountName: "账户一",
      status: "active",
      lifecycleStage: "declining",
      starred: true,
      tags: ["重点"],
      owner: { userId: "00000000-0000-4000-8000-000000000001", displayName: "脱敏优化师" },
      linkedTasks: [{ taskId: "task-1", taskName: "任务一" }],
      metricDate: "2026-08-25",
      cost: 120.5,
      realConversion: 8,
      assessmentPrice: 38,
      dataAsOf: "2026-08-25T12:00:00.000Z",
      balance: 1_000,
      balanceSyncedAt: "2026-08-25T11:00:00.000Z",
      // Synthetic legacy account has no S6 pool/product/action metadata.
      poolStatus: null,
      poolStatusSource: null,
      // v1.5.1 ①（S6）新增的仓储字段
      poolStatus: "in_delivery",
      poolStatusSource: "system",
      productName: null,
      productRef: null,
      lastAction: null,
      nextSuggestion: null,
    }],
    page: 1,
    pageSize: 20,
    total: 1,
    coverageComplete: true,
    metricsComplete: true,
    initialFullComplete: true,
    ...overrides,
  };
}

function serviceFor(result: AccountListRepositoryResult | Error) {
  const list = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { service: new AccountListService({ repository: { list } }), list };
}

function expectError(response: AccountListResponse, code: string): void {
  expect(response).toMatchObject({ ok: false, error: { code } });
}

describe("AccountListService", () => {
  it("uses workspace-bounded readonly scope for a team workspace without account grants", async () => {
    const teamAuth: ApprovedWorkspaceAuthContext = {
      workspaceId,
      userId,
      role: "optimizer",
      workspaceKind: "team",
      scope: { kind: "team_workspace_readonly" },
    };
    const { service, list } = serviceFor(readyResult());
    const response = await service.execute(
      {}, teamAuth, "account-list-team", new Date("2026-08-25T04:00:00Z"),
    );
    expect(response).toMatchObject({ ok: true, data: { total: 1 } });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      scopeKind: "team_workspace_readonly",
      allowedAccounts: [],
    }));
  });

  it("injects only approved KUAISHOU tuples and the Shanghai business date", async () => {
    const { service, list } = serviceFor(readyResult());
    await service.execute(
      { page: 2, pageSize: 10, tags: ["重点"] },
      auth,
      "account-list-scope",
      new Date("2026-08-24T19:00:00.000Z"),
    );
    expect(list).toHaveBeenCalledWith({
      workspaceId,
      requestingUserId: auth.userId,
      businessDate: "2026-08-25",
      scopeKind: "explicit_accounts",
      allowedAccounts: [{ media: "KUAISHOU", accountId: "account-1" }],
      page: 2,
      pageSize: 10,
      tags: ["重点"],
    });
  });

  it("builds RatioValue server-side, including denominator zero", async () => {
    const source = readyResult();
    source.rows[0] = { ...source.rows[0]!, cost: 50, realConversion: 0 };
    const response = await serviceFor(source).service.execute(
      {}, auth, "account-list-ratio", new Date("2026-08-25T04:00:00Z"),
    );
    expect(response).toMatchObject({
      ok: true,
      data: { items: [{ metrics: { realCpa: { value: null, state: "infinite" } } }] },
    });
  });

  it("keeps missing metrics/balance explicit and does not fabricate zero", async () => {
    const source = readyResult({ metricsComplete: false });
    source.rows[0] = {
      ...source.rows[0]!,
      metricDate: null,
      cost: null,
      realConversion: null,
      assessmentPrice: null,
      dataAsOf: null,
      balance: null,
      balanceSyncedAt: null,
    };
    const response = await serviceFor(source).service.execute(
      {}, auth, "account-list-null", new Date("2026-08-25T04:00:00Z"),
    );
    expect(response).toMatchObject({
      ok: true,
      data: { items: [{ metrics: null, balance: null }] },
      meta: { dataState: "stale", dataAsOf: null },
    });
  });

  it("enforces dataState priority partial over stale over empty over ready", async () => {
    const cases = [
      [readyResult({ coverageComplete: false, metricsComplete: false }), "partial"],
      [readyResult({ metricsComplete: false }), "stale"],
      [readyResult({ rows: [], total: 0 }), "empty"],
      [readyResult(), "ready"],
    ] as const;
    for (const [result, expected] of cases) {
      const response = await serviceFor(result).service.execute(
        {}, auth, `account-state-${expected}`, new Date("2026-08-25T04:00:00Z"),
      );
      expect(response.ok && response.meta.dataState).toBe(expected);
    }
  });

  it("returns 401/403/400 before repository access", async () => {
    const { service, list } = serviceFor(readyResult());
    expectError(await service.execute({}, null, "account-401"), "UNAUTHORIZED");
    expectError(await service.execute({}, { ...auth, workspaceId: "forged" }, "account-403"), "FORBIDDEN");
    expectError(await service.execute({}, { ...auth, userId: "workspace-user" }, "account-user-403"), "FORBIDDEN");
    expectError(await service.execute({ dataSource: "ka_data" }, auth, "account-400"), "INVALID_REQUEST");
    expect(list).not.toHaveBeenCalled();
  });

  it("fails closed when Repository returns any unauthorized tuple", async () => {
    const source = readyResult();
    source.rows[0] = { ...source.rows[0]!, accountId: "outside-scope" };
    const response = await serviceFor(source).service.execute(
      {}, auth, "account-row-guard", new Date("2026-08-25T04:00:00Z"),
    );
    expectError(response, "FORBIDDEN");
    expect(JSON.stringify(response)).not.toContain("outside-scope");
  });

  it("keeps the team output guard bound to the approved workspace", async () => {
    const source = readyResult();
    source.rows[0] = {
      ...source.rows[0]!,
      workspaceId: "00000000-0000-4000-8000-000000000999",
    };
    const response = await serviceFor(source).service.execute({}, {
      workspaceId,
      userId,
      role: "optimizer",
      workspaceKind: "team",
      scope: { kind: "team_workspace_readonly" },
    }, "account-team-workspace-guard");
    expectError(response, "FORBIDDEN");
  });

  it("fails closed for invalid row, pagination or source consistency", async () => {
    const invalidStage = readyResult();
    invalidStage.rows[0] = { ...invalidStage.rows[0]!, lifecycleStage: "invented" };
    const partialMetric = readyResult();
    partialMetric.rows[0] = { ...partialMetric.rows[0]!, metricDate: null, cost: 1 };
    const partialBalance = readyResult();
    partialBalance.rows[0] = { ...partialBalance.rows[0]!, balanceSyncedAt: null };
    const badPage = readyResult({ total: 0 });
    for (const result of [invalidStage, partialMetric, partialBalance, badPage]) {
      expectError(await serviceFor(result).service.execute(
        {}, auth, "account-invalid", new Date("2026-08-25T04:00:00Z"),
      ), "UPSTREAM_INVALID_RESPONSE");
    }
  });

  it("maps source and unknown failures without leaking details", async () => {
    const unavailable = await serviceFor(
      new AccountListSourceError("SOURCE_UNAVAILABLE", "connector body", true),
    ).service.execute({}, auth, "account-503");
    const timeout = await serviceFor(
      new AccountListSourceError("UPSTREAM_TIMEOUT", "connector timeout", true),
    ).service.execute({}, auth, "account-504");
    const invalidSource = await serviceFor(
      new AccountListRepositoryContractError("NaN from numeric column"),
    ).service.execute({}, auth, "account-502");
    const unknown = await serviceFor(
      new Error("postgres://user:secret@host select raw"),
    ).service.execute({}, auth, "account-500");
    expectError(unavailable, "SOURCE_UNAVAILABLE");
    expectError(timeout, "UPSTREAM_TIMEOUT");
    expectError(invalidSource, "UPSTREAM_INVALID_RESPONSE");
    expectError(unknown, "INTERNAL_ERROR");
    expect(JSON.stringify(unknown)).not.toContain("secret");
    expect(JSON.stringify(unknown)).not.toContain("select");
  });

  it("does not declare non-empty metrics ready without a source dataAsOf", async () => {
    const source = readyResult({ metricsComplete: false });
    source.rows[0] = { ...source.rows[0]!, dataAsOf: null };
    const response = await serviceFor(source).service.execute(
      {}, auth, "account-missing-freshness", new Date("2026-08-25T04:00:00Z"),
    );
    expect(response).toMatchObject({ ok: true, meta: { dataState: "stale", dataAsOf: null } });

    expectError(await serviceFor({ ...source, metricsComplete: true }).service.execute(
      {}, auth, "account-false-ready", new Date("2026-08-25T04:00:00Z"),
    ), "UPSTREAM_INVALID_RESPONSE");
  });
});
