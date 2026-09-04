import { describe, expect, it, vi } from "vitest";

import type {
  ApprovedWorkspaceAuthContext,
  DataQueryId,
  SourceQueryResult,
} from "@ka/domain";

import {
  createDataQueryHttpHandler,
  DataQueryService,
} from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { canonicalRow, readySource } from "./canonical-query-fixtures.js";

function ready(
  source: "ka_data" | "canonical",
  value: number,
  queryId: DataQueryId = "account.summary",
): SourceQueryResult {
  const result = readySource(queryId, source, [canonicalRow(queryId, value)]);
  result.lineage = {
    ...result.lineage,
    datasetVersion: "fixture-dataset",
    dataAsOf: "2026-08-24T08:00:00.000Z",
    timezone: "Asia/Shanghai",
    dayCut: "calendar_day",
    metadataAvailability: "known",
  };
  return result;
}

describe("DataQueryService", () => {
  const auth = {
    workspaceId: "00000000-0000-4000-8000-000000000024",
    userId: "00000000-0000-4000-8000-000000000001",
    role: "admin",
    workspaceKind: "personal",
    scope: {
      kind: "explicit_accounts",
      accounts: [{ media: "KUAISHOU", accountId: "allowed-account", accessLevel: "read" }],
    },
  } satisfies ApprovedWorkspaceAuthContext;

  it("injects workspace/user/account scope from authentication, not request body", async () => {
    const kaData = { query: vi.fn(async () => ready("ka_data", 10)) };
    const platform = { query: vi.fn(async () => ready("canonical", 11)) };
    const service = new DataQueryService({
      registry: createDataQueryRegistry({ today: () => "2026-08-24" }),
      kaData,
      platform,
    });

    const response = await service.execute({
      queryId: "account.summary",
      params: { date: "2026-08-24" },
      dataView: "ka_data",
    }, auth);

    expect(response.ok).toBe(true);
    expect(kaData.query).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      scopeKind: "explicit_accounts",
      accounts: auth.scope.accounts,
    });
    expect(platform.query).not.toHaveBeenCalled();
    if (response.ok && response.data.mode === "ka_data") {
      expect(response.data.source.lineage.authority).toMatchObject({
        useCase: "realtime_delivery",
        role: "comparison_reference",
      });
    }
  });

  it("rejects requested accounts outside the authenticated account scope", async () => {
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => ready("ka_data", 10) },
      platform: { query: async () => ready("canonical", 11) },
    });

    const response = await service.execute({
      queryId: "account.table",
      params: { date: "2026-08-24", accountIds: ["forged-account"] },
      dataView: "platform",
    }, auth, "bff-forbidden-001");

    expect(response).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN", requestId: "bff-forbidden-001" },
    });
  });

  it("uses a workspace-only readonly scope for team platform queries", async () => {
    const team: ApprovedWorkspaceAuthContext = {
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      role: "optimizer",
      workspaceKind: "team",
      scope: { kind: "team_workspace_readonly" },
    };
    const platform = { query: vi.fn(async (resolved: { queryId: DataQueryId }) =>
      ready("canonical", 11, resolved.queryId)) };
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => ready("ka_data", 10) },
      platform,
    });
    const response = await service.execute({
      queryId: "account.table",
      params: { date: "2026-08-24", accountIds: ["allowed-account"] },
      dataView: "platform",
    }, team, "team-platform-query");
    expect(response).toMatchObject({ ok: true, data: { mode: "platform" } });
    expect(platform.query).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      scopeKind: "team_workspace_readonly",
      accounts: [],
    });
  });

  it("rejects a team source row from another workspace", async () => {
    const team: ApprovedWorkspaceAuthContext = {
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      role: "optimizer",
      workspaceKind: "team",
      scope: { kind: "team_workspace_readonly" },
    };
    const malicious = ready("canonical", 11, "account.table");
    malicious.rows = [{
      ...malicious.rows[0],
      workspaceId: "00000000-0000-4000-8000-000000000999",
    }];
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => ready("ka_data", 10) },
      platform: { query: async () => malicious },
    });
    const response = await service.execute({
      queryId: "account.table",
      params: { date: "2026-08-24" },
      dataView: "platform",
    }, team, "team-cross-workspace");
    expect(response).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN", requestId: "team-cross-workspace" },
    });
  });

  it("rejects account rows returned outside the authenticated scope", async () => {
    const malicious = ready("canonical", 11, "account.table");
    malicious.rows = [{ ...malicious.rows[0], accountId: "forged-account" }];
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async (resolved) => ready("ka_data", 10, resolved.queryId) },
      platform: { query: async () => malicious },
      requestId: () => "scope-guard-request",
    });

    const response = await service.execute({
      queryId: "account.table",
      params: { date: "2026-08-24" },
      dataView: "platform",
    }, auth);

    expect(response).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "Data source returned rows outside the authenticated scope",
        retryable: false,
        requestId: "scope-guard-request",
      },
    });
    expect(JSON.stringify(response)).not.toContain("forged-account");
  });

  it("requires account identity fields for account-row queries", async () => {
    const malformed = ready("canonical", 11, "account.detail");
    malformed.rows = [{
      media: "KUAISHOU",
      accountId: "allowed-account",
      cost: 11,
    }];
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async (resolved) => ready("ka_data", 10, resolved.queryId) },
      platform: { query: async () => malformed },
      requestId: () => "missing-scope-request",
    });
    const response = await service.execute({
      queryId: "account.detail",
      params: { date: "2026-08-24", accountId: "allowed-account" },
      dataView: "platform",
    }, auth);
    expect(response).toMatchObject({
      ok: false,
      error: { code: "UPSTREAM_INVALID_RESPONSE" },
    });
  });

  it("rejects an impossible canonical date from a malicious data source", async () => {
    const malformed = ready("canonical", 11, "account.table");
    malformed.rows = [{ ...malformed.rows[0], ds: "2026-02-31" }];
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async (resolved) => ready("ka_data", 10, resolved.queryId) },
      platform: { query: async () => malformed },
      requestId: () => "invalid-calendar-request",
    });
    const response = await service.execute({
      queryId: "account.table",
      params: { date: "2026-08-24" },
      dataView: "platform",
    }, auth);
    expect(response).toEqual({
      ok: false,
      error: {
        code: "UPSTREAM_INVALID_RESPONSE",
        message: "Data source returned an invalid canonical response",
        retryable: false,
        requestId: "invalid-calendar-request",
      },
    });
  });

  it("classifies one-sided empty data as source_missing before partial_source", async () => {
    const emptyPartial = ready("ka_data", 0, "reconcile.account_daily");
    emptyPartial.rows = [];
    emptyPartial.returnedRowCount = 0;
    emptyPartial.wholeResultTotal = {
      value: null,
      availability: "partial",
      reason: "Upstream boundary was hit",
    };
    emptyPartial.lineage = {
      ...emptyPartial.lineage,
      coverage: { complete: false, reason: "Upstream boundary was hit" },
      truncated: true,
      partial: true,
    };
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => emptyPartial },
      platform: { query: async () => ready("canonical", 11, "reconcile.account_daily") },
    });

    const response = await service.execute({
      queryId: "reconcile.account_daily",
      params: { date: "2026-08-24", media: "KUAISHOU" },
      dataView: "reconcile",
    }, auth);

    expect(response.ok).toBe(true);
    if (response.ok && response.data.mode === "reconcile") {
      expect(response.data.comparison.reason).toBe("source_missing");
    }
  });

  it("rejects forged identity fields before adapters run", async () => {
    const kaData = { query: vi.fn(async () => ready("ka_data", 10)) };
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData,
      platform: { query: async () => ready("canonical", 11) },
    });

    const response = await service.execute({
      queryId: "account.summary",
      params: { date: "2026-08-24", workspaceId: "forged" },
      dataView: "ka_data",
    }, auth);

    expect(response).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(kaData.query).not.toHaveBeenCalled();
  });

  it("classifies extra top-level fields as INVALID_REQUEST, not an unknown query", async () => {
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => ready("ka_data", 10, "reconcile.account_daily") },
      platform: { query: async () => ready("canonical", 11, "reconcile.account_daily") },
    });
    const response = await service.execute({
      queryId: "account.summary",
      params: { date: "2026-08-24" },
      dataView: "ka_data",
      sql: "select 1",
    }, auth);
    expect(response).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  });

  it("keeps both source payloads and never creates a unified value in reconcile mode", async () => {
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => ready("ka_data", 10, "reconcile.account_daily") },
      platform: { query: async () => ready("canonical", 11, "reconcile.account_daily") },
    });

    const response = await service.execute({
      queryId: "reconcile.account_daily",
      params: { date: "2026-08-24" },
      dataView: "reconcile",
    }, auth);

    expect(response.ok).toBe(true);
    if (response.ok && response.data.mode === "reconcile") {
      expect(response.data.kaData.rows[0]).toMatchObject({ metrics: { cost: 10 } });
      expect(response.data.platform.rows[0]).toMatchObject({ metrics: { cost: 11 } });
      expect(response.data.comparison).toEqual({
        status: "unavailable",
        reason: "reconciliation_engine_pending",
        rows: [],
      });
      expect(response.data).not.toHaveProperty("value");
    }
  });

  it("distinguishes a source outage from one-sided account absence", async () => {
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => { throw new Error("fixture unavailable"); } },
      platform: { query: async () => ready("canonical", 11, "reconcile.account_daily") },
      requestId: () => "fixture-request",
    });

    const response = await service.execute({
      queryId: "reconcile.account_daily",
      params: { date: "2026-08-24", media: "KUAISHOU" },
      dataView: "reconcile",
    }, auth);

    expect(response.ok).toBe(true);
    if (response.ok && response.data.mode === "reconcile") {
      expect(response.data.kaData.status).toBe("unavailable");
      expect(response.data.kaData.lineage).toMatchObject({
        metadataAvailability: "unknown",
        datasetVersion: null,
        dataAsOf: null,
        timezone: null,
        dayCut: null,
      });
      expect(response.data.platform.status).toBe("ready");
      expect(response.data.comparison.reason).toBe("source_unavailable");
      expect(JSON.stringify(response.data)).not.toMatch(/OBJECT_(?:UNMAPPED|MAPPING)/);
    }
  });

  it("marks a successful one-sided empty result as source_missing", async () => {
    const empty = ready("ka_data", 0, "reconcile.account_daily");
    empty.rows = [];
    empty.returnedRowCount = 0;
    empty.wholeResultTotal = { value: 0, availability: "available" };
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => empty },
      platform: { query: async () => ready("canonical", 11, "reconcile.account_daily") },
    });
    const response = await service.execute({
      queryId: "reconcile.account_daily",
      params: { date: "2026-08-24", media: "KUAISHOU" },
      dataView: "reconcile",
    }, auth);
    expect(response.ok).toBe(true);
    if (response.ok && response.data.mode === "reconcile") {
      expect(response.data.comparison.reason).toBe("source_missing");
    }
  });

  it("classifies a one-row empty aggregate as source_missing from object coverage", async () => {
    const emptyAggregate = ready("ka_data", 0, "account.summary");
    emptyAggregate.rows = [{ ...emptyAggregate.rows[0], accountCount: 0, rowCount: 0 }];
    emptyAggregate.lineage = {
      ...emptyAggregate.lineage,
      coverage: { complete: false, requestedObjects: 1, returnedObjects: 0 },
      partial: true,
    };
    emptyAggregate.wholeResultTotal = {
      value: null,
      availability: "partial",
      reason: "Account scope is missing",
    };
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => emptyAggregate },
      platform: { query: async () => ready("canonical", 11, "account.summary") },
    });
    const response = await service.execute({
      queryId: "account.summary",
      params: { date: "2026-08-24" },
      dataView: "reconcile",
    }, auth);
    expect(response.ok).toBe(true);
    if (response.ok && response.data.mode === "reconcile") {
      expect(response.data.comparison.reason).toBe("source_missing");
    }
  });

  it("exposes POST /api/v1/data/query semantics through a mountable handler", async () => {
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => ready("ka_data", 10) },
      platform: { query: async () => ready("canonical", 11) },
    });
    const handler = createDataQueryHttpHandler(service);

    expect((await handler({ method: "GET", body: {}, auth })).status).toBe(405);
    expect(await handler({
      method: "POST",
      body: { queryId: "account.summary", params: { date: "2026-08-24" }, dataView: "platform" },
      auth,
    })).toMatchObject({ status: 200, body: { ok: true } });
    expect(await handler({ method: "POST", body: {}, auth: null })).toMatchObject({
      status: 401,
      body: { ok: false, error: { code: "UNAUTHORIZED" } },
    });
  });
});
