import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import type { DataQueryId, SourceQueryResult } from "@ka/domain";

import { createDataApiServer } from "../src/data/http-server.js";
import { AccountListService } from "../src/accounts/account-list-service.js";
import { KaDataClientError } from "../src/data/ka-data-client.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { ReadDetailService } from "../src/data/read-detail-service.js";
import { DataQueryService, type DataSourceQueryPort } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { TaskListService } from "../src/tasks/task-list-service.js";
import { WorkItemListService } from "../src/work-items/work-item-list-service.js";
import { canonicalRow, readySource } from "./canonical-query-fixtures.js";
import {
  approvedSessionAuth,
  businessHeaders,
  personalAuth,
} from "./business-auth-fixtures.js";

const internalToken = "fixture-internal-token-that-is-long-enough";
const auth = personalAuth({
  workspaceId: "00000000-0000-4000-8000-000000000024",
  userId: "00000000-0000-4000-8000-000000000001",
  accounts: [{ media: "KUAISHOU", accountId: "account-1" }],
});

function ready(
  queryId: DataQueryId,
  source: "ka_data" | "canonical",
  rows: Record<string, unknown>[],
): SourceQueryResult {
  return readySource(queryId, source, rows);
}

function authHeaders(token = internalToken): Record<string, string> {
  return {
    ...businessHeaders(token),
    "content-type": "application/json",
  };
}

function emptyDetailService(): ReadDetailService {
  return new ReadDetailService({
    workItems: { find: async () => null },
    changeSets: { find: async () => null },
  });
}

function emptyTaskListService(): TaskListService {
  return new TaskListService({
    repository: {
      list: async (query) => ({
        rows: [],
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        total: 0,
        coverageComplete: true,
        initialFullComplete: true,
      }),
    },
  });
}

function emptyAccountListService(): AccountListService {
  return new AccountListService({
    repository: {
      list: async (query) => ({
        rows: [],
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        total: 0,
        coverageComplete: false,
        metricsComplete: true,
        initialFullComplete: false,
      }),
    },
  });
}

function emptyWorkItemListService(): WorkItemListService {
  return new WorkItemListService({
    repository: {
      list: async (query) => ({
        rows: [],
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        total: 0,
        accountItemCount: 0,
        dataAsOf: null,
        coverageComplete: true,
        initialFullComplete: false,
      }),
    },
  });
}

describe("data API HTTP composition", () => {
  const servers: ReturnType<typeof createDataApiServer>[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
    }));
  });

  async function start(options: {
    maxResponseBytes?: number;
    kaData?: DataSourceQueryPort;
    platform?: DataSourceQueryPort;
    detailService?: ReadDetailService;
  } = {}) {
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: options.kaData ?? { query: async (resolved) => ready(
        resolved.queryId,
        "ka_data",
        [canonicalRow(resolved.queryId, 10, auth.workspaceId, "account-1")],
      ) },
      platform: options.platform ?? { query: async (resolved) => ready(
        resolved.queryId,
        "canonical",
        [canonicalRow(resolved.queryId, 11, auth.workspaceId, "account-1")],
      ) },
      requestId: () => "http-smoke-request",
    });
    const server = createDataApiServer({
      service,
      detailService: options.detailService ?? emptyDetailService(),
      taskListService: emptyTaskListService(),
      accountListService: emptyAccountListService(),
      workItemListService: emptyWorkItemListService(),
      sessionAuthService: approvedSessionAuth(auth),
      internalToken,
      ...(options.maxResponseBytes === undefined
        ? {}
        : { maxResponseBytes: options.maxResponseBytes }),
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
  }

  it.each(["ka_data", "platform", "reconcile"] as const)(
    "serves %s through the real POST /api/v1/data/query route",
    async (dataView) => {
      const baseUrl = await start();
      const response = await fetch(`${baseUrl}/api/v1/data/query`, {
        method: "POST",
        headers: { ...authHeaders(), "x-request-id": `bff-${dataView}-001` },
        body: JSON.stringify({
          queryId: dataView === "reconcile" ? "reconcile.account_daily" : "account.summary",
          params: { date: "2026-08-24" },
          dataView,
        }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe(`bff-${dataView}-001`);
      const payload = await response.json();
      expect(payload).toMatchObject({ ok: true, data: { mode: dataView } });
    },
  );

  it("returns stable 401/403 envelopes before executing a query", async () => {
    const baseUrl = await start();
    const missing = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "bff-unauthorized-001",
      },
      body: "{}",
    });
    expect(missing.status).toBe(401);
    expect(missing.headers.get("x-request-id")).toBe("bff-unauthorized-001");
    expect(await missing.json()).toEqual({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required",
        retryable: false,
        requestId: "bff-unauthorized-001",
      },
    });

    const forged = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: authHeaders("wrong-internal-token-that-is-long-enough"),
      body: "{}",
    });
    expect(forged.status).toBe(403);
    expect(await forged.json()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("serves health, rejects unknown routes, and enforces POST on the query route", async () => {
    const baseUrl = await start();
    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ ok: true });

    const missing = await fetch(`${baseUrl}/not-a-route`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });

    const wrongMethod = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "GET",
      headers: authHeaders(),
    });
    expect(wrongMethod.status).toBe(405);
  });

  it("ignores forged legacy scope headers and rejects invalid JSON and oversized request bodies", async () => {
    const baseUrl = await start();
    const forgedLegacyScope = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "x-ka-account-scope": "not-json",
        "x-ka-workspace-id": "00000000-0000-4000-8000-000000000999",
        "x-ka-user-id": "00000000-0000-4000-8000-000000000998",
      },
      body: JSON.stringify({
        queryId: "account.summary",
        params: { date: "2026-08-24" },
        dataView: "platform",
      }),
    });
    expect(forgedLegacyScope.status).toBe(200);
    expect(await forgedLegacyScope.json()).toMatchObject({ ok: true });

    const invalidJson = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: authHeaders(),
      body: "{",
    });
    expect(invalidJson.status).toBe(400);

    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => ready("account.summary", "ka_data", []) },
      platform: { query: async () => ready("account.summary", "canonical", []) },
    });
    const limitedServer = createDataApiServer({
      service,
      detailService: emptyDetailService(),
      taskListService: emptyTaskListService(),
      accountListService: emptyAccountListService(),
      workItemListService: emptyWorkItemListService(),
      sessionAuthService: approvedSessionAuth(auth),
      internalToken,
      maxRequestBytes: 8,
    });
    servers.push(limitedServer);
    limitedServer.listen(0, "127.0.0.1");
    await once(limitedServer, "listening");
    const limitedAddress = limitedServer.address() as AddressInfo;
    const oversized = await fetch(`http://127.0.0.1:${limitedAddress.port}/api/v1/data/query`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ too: "large" }),
    });
    expect(oversized.status).toBe(413);
  });

  it("requires both the internal bearer and a valid server session", async () => {
    const baseUrl = await start();
    const missingSession = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${internalToken}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(missingSession.status).toBe(401);
    expect(await missingSession.json()).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("rejects weak tokens and invalid byte limits at composition time", () => {
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: { query: async () => ready("account.summary", "ka_data", []) },
      platform: { query: async () => ready("account.summary", "canonical", []) },
    });
    expect(() => createDataApiServer({
      service,
      detailService: emptyDetailService(),
      taskListService: emptyTaskListService(),
      accountListService: emptyAccountListService(),
      workItemListService: emptyWorkItemListService(),
      sessionAuthService: approvedSessionAuth(auth),
      internalToken: "short",
    })).toThrow(/32/);
    expect(() => createDataApiServer({
      service,
      detailService: emptyDetailService(),
      taskListService: emptyTaskListService(),
      accountListService: emptyAccountListService(),
      workItemListService: emptyWorkItemListService(),
      sessionAuthService: approvedSessionAuth(auth),
      internalToken,
      maxRequestBytes: 0,
    })).toThrow(/positive integer/);
  });

  it("returns a redacted timeout envelope over HTTP", async () => {
    const baseUrl = await start({
      kaData: {
        query: async () => {
          throw new KaDataClientError("UPSTREAM_TIMEOUT", "KA Data request timed out", true);
        },
      },
    });
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: { ...authHeaders(), "x-request-id": "bff-timeout-001" },
      body: JSON.stringify({
        queryId: "account.summary",
        params: { date: "2026-08-24" },
        dataView: "ka_data",
      }),
    });
    expect(response.headers.get("x-request-id")).toBe("bff-timeout-001");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "UPSTREAM_TIMEOUT",
        message: "KA Data request timed out",
        retryable: true,
        requestId: "bff-timeout-001",
      },
    });
  });

  it("safely regenerates an overlong correlation ID and never reflects it", async () => {
    const baseUrl = await start();
    const unsafe = "x".repeat(129);
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": unsafe,
      },
      body: "{}",
    });
    const body = await response.json();
    const responseRequestId = response.headers.get("x-request-id");
    expect(response.status).toBe(401);
    expect(responseRequestId).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
    expect(responseRequestId).not.toBe(unsafe);
    expect(body).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED", requestId: responseRequestId },
    });
    expect(JSON.stringify(body)).not.toContain(unsafe);
  });

  it("blocks malicious adapter output at the HTTP boundary", async () => {
    const baseUrl = await start({
      platform: {
        query: async () => {
          const source = readySource("account.table", "canonical", []);
          source.rows = [canonicalRow(
            "account.table",
            11,
            auth.workspaceId,
            "unauthorized-account",
          )];
          source.returnedRowCount = 1;
          return source;
        },
      },
    });
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        queryId: "account.table",
        params: { date: "2026-08-24" },
        dataView: "platform",
      }),
    });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(JSON.stringify(body)).not.toContain("unauthorized-account");
  });

  it("returns top-level 502 when the platform source violates the canonical row contract", async () => {
    const platform = new PlatformDataSource({
      querySummary: async () => ({
        rowCount: 1,
        accountCount: 1,
        anomalyRows: 0,
        cost: "not-a-number",
      }),
      queryTrend: async () => [],
      queryTable: async () => ({ rows: [], total: 0, page: 1, pageSize: 50 }),
      queryLineage: async () => ({
        dataAsOf: null,
        canonicalRows: 0,
        returnedAccounts: 0,
        requestedAccountDays: 1,
        returnedAccountDays: 0,
      }),
    } as never);
    const baseUrl = await start({ platform });
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: { ...authHeaders(), "x-request-id": "platform-contract-001" },
      body: JSON.stringify({
        queryId: "account.summary",
        params: { date: "2026-08-24" },
        dataView: "platform",
      }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "UPSTREAM_INVALID_RESPONSE",
        message: "Platform source returned rows outside the canonical query contract",
        retryable: false,
        requestId: "platform-contract-001",
      },
    });
  });

  it("serves both read-only detail routes with the same auth and requestId boundary", async () => {
    const workItemId = "00000000-0000-4000-8000-000000000201";
    const changesetId = "00000000-0000-4000-8000-000000000202";
    const userId = "00000000-0000-4000-8000-000000000203";
    const detailService = new ReadDetailService({
      workItems: {
        find: async () => ({
          id: workItemId,
          workspaceId: auth.workspaceId,
          type: "diagnosis",
          media: "KUAISHOU",
          accountId: "account-1",
          taskId: null,
          ruleId: "1",
          severity: "P1",
          title: "fixture work item",
          evidenceSnapshot: { cost: 12 },
          diagnosis: { reason: "fixture" },
          status: "open",
          ignoreReason: null,
          mutedUntil: null,
          assignee: null,
          creator: userId,
          acceptanceCriteria: null,
          slaDue: null,
          rejectReason: null,
          t1Result: { checked: true },
          createdAt: new Date("2026-08-25T01:00:00Z"),
          resolvedAt: null,
        }),
      },
      changeSets: {
        find: async () => ({
          id: changesetId,
          workspaceId: auth.workspaceId,
          media: "KUAISHOU",
          accountId: "account-1",
          workItemId,
          title: "fixture changeset",
          status: "draft",
          initiator: userId,
          credentialOwnerUserId: userId,
          executorIdentity: null,
          multicaIssueId: null,
          ttlExpireAt: new Date("2026-08-25T01:30:00Z"),
          reasonCode: "cost_control",
          simulation: { dryRun: { passed: true } },
          createdAt: new Date("2026-08-25T01:00:00Z"),
          executedAt: null,
          items: [{
            id: 1,
            targetType: "unit",
            targetId: "unit-1",
            field: "bid",
            fromValue: "30",
            toValue: "27",
            itemStatus: "pending",
            failReason: null,
          }],
        }),
      },
    });
    const baseUrl = await start({ detailService });
    const workItem = await fetch(`${baseUrl}/api/v1/work-items/${workItemId}`, {
      headers: { ...authHeaders(), "x-request-id": "work-item-http-001" },
    });
    expect(workItem.status).toBe(200);
    expect(workItem.headers.get("x-request-id")).toBe("work-item-http-001");
    expect(await workItem.json()).toMatchObject({
      ok: true,
      data: { kind: "work_item", workItem: { t1Result: { checked: true } } },
    });

    const changeset = await fetch(`${baseUrl}/api/v1/changesets/${changesetId}`, {
      headers: { ...authHeaders(), "x-request-id": "changeset-http-001" },
    });
    expect(changeset.status).toBe(200);
    expect(await changeset.json()).toMatchObject({
      ok: true,
      data: { kind: "changeset", changeset: { simulation: { dryRun: { passed: true } } } },
    });
  });

  it("serves an unscoped personal work item only through the authenticated actor", async () => {
    const workItemId = "00000000-0000-4000-8000-000000000208";
    const detailService = new ReadDetailService({
      workItems: {
        find: async () => ({
          id: workItemId,
          workspaceId: auth.workspaceId,
          type: "self",
          media: null,
          accountId: null,
          taskId: null,
          ruleId: null,
          severity: null,
          title: "personal fixture",
          evidenceSnapshot: { private: true },
          diagnosis: null,
          status: "open",
          ignoreReason: null,
          mutedUntil: null,
          assignee: null,
          creator: auth.userId,
          acceptanceCriteria: null,
          slaDue: null,
          rejectReason: null,
          t1Result: null,
          createdAt: new Date("2026-08-28T01:00:00Z"),
          resolvedAt: null,
        }),
      },
      changeSets: { find: async () => null },
    });
    const baseUrl = await start({ detailService });
    const response = await fetch(`${baseUrl}/api/v1/work-items/${workItemId}`, {
      headers: { ...authHeaders(), "x-request-id": "personal-detail-http-001" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("personal-detail-http-001");
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        kind: "work_item",
        workItem: {
          media: null,
          accountId: null,
          assignee: null,
          creator: auth.userId,
        },
      },
    });
  });

  it("keeps detail writes closed and returns stable 401/403/404 envelopes", async () => {
    const id = "00000000-0000-4000-8000-000000000204";
    const forbidden = new ReadDetailService({
      workItems: {
        find: async () => ({
          id,
          workspaceId: auth.workspaceId,
          type: "diagnosis",
          media: "TENCENT",
          accountId: "account-1",
          taskId: null,
          ruleId: null,
          severity: null,
          title: "forbidden",
          evidenceSnapshot: null,
          diagnosis: null,
          status: "open",
          ignoreReason: null,
          mutedUntil: null,
          assignee: null,
          creator: null,
          acceptanceCriteria: null,
          slaDue: null,
          rejectReason: null,
          t1Result: null,
          createdAt: new Date("2026-08-25T01:00:00Z"),
          resolvedAt: null,
        }),
      },
      changeSets: { find: async () => null },
    });
    const baseUrl = await start({ detailService: forbidden });

    const unauthenticated = await fetch(`${baseUrl}/api/v1/work-items/${id}`);
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.json()).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });

    const outOfScope = await fetch(`${baseUrl}/api/v1/work-items/${id}`, {
      headers: authHeaders(),
    });
    expect(outOfScope.status).toBe(403);

    const missing = await fetch(`${baseUrl}/api/v1/changesets/${id}`, {
      headers: authHeaders(),
    });
    expect(missing.status).toBe(404);

    const write = await fetch(`${baseUrl}/api/v1/work-items/${id}`, {
      method: "POST",
      headers: authHeaders(),
    });
    expect(write.status).toBe(405);
  });

  it("fails closed when a work-item detail exactly reaches the response limit", async () => {
    const id = "00000000-0000-4000-8000-000000000205";
    const detailService = new ReadDetailService({
      workItems: {
        find: async () => ({
          id,
          workspaceId: auth.workspaceId,
          type: "diagnosis",
          media: "KUAISHOU",
          accountId: "account-1",
          taskId: null,
          ruleId: null,
          severity: "P1",
          title: "oversized evidence",
          evidenceSnapshot: { payload: "x".repeat(2048) },
          diagnosis: null,
          status: "open",
          ignoreReason: null,
          mutedUntil: null,
          assignee: null,
          creator: null,
          acceptanceCriteria: null,
          slaDue: null,
          rejectReason: null,
          t1Result: null,
          createdAt: new Date("2026-08-25T01:00:00Z"),
          resolvedAt: null,
        }),
      },
      changeSets: { find: async () => null },
    });
    const canonical = await detailService.getWorkItem(id, auth, "size-probe");
    const exactBytes = Buffer.byteLength(JSON.stringify(canonical));
    const baseUrl = await start({ detailService, maxResponseBytes: exactBytes });

    const response = await fetch(`${baseUrl}/api/v1/work-items/${id}`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "SOURCE_TRUNCATED" },
    });
  });

  it("fails closed when a changeset detail exactly reaches the response limit", async () => {
    const id = "00000000-0000-4000-8000-000000000206";
    const detailService = new ReadDetailService({
      workItems: { find: async () => null },
      changeSets: {
        find: async () => ({
          id,
          workspaceId: auth.workspaceId,
          media: "KUAISHOU",
          accountId: "account-1",
          workItemId: null,
          title: "oversized changeset",
          status: "draft",
          initiator: "00000000-0000-4000-8000-000000000207",
          credentialOwnerUserId: "00000000-0000-4000-8000-000000000207",
          executorIdentity: null,
          multicaIssueId: null,
          ttlExpireAt: null,
          reasonCode: null,
          simulation: { payload: "x".repeat(2048) },
          createdAt: new Date("2026-08-25T01:00:00Z"),
          executedAt: null,
          items: [{
            id: 1,
            targetType: "unit",
            targetId: "unit-1",
            field: "bid",
            fromValue: "30",
            toValue: "27",
            itemStatus: "pending",
            failReason: null,
          }],
        }),
      },
    });
    const canonical = await detailService.getChangeSet(id, auth, "size-probe");
    const exactBytes = Buffer.byteLength(JSON.stringify(canonical));
    const baseUrl = await start({ detailService, maxResponseBytes: exactBytes });

    const response = await fetch(`${baseUrl}/api/v1/changesets/${id}`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "SOURCE_TRUNCATED" },
    });
  });

  it("fails closed with a stable truncated envelope when serialized output exceeds 16MB policy", async () => {
    const baseUrl = await start({ maxResponseBytes: 256 });
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        queryId: "account.summary",
        params: { date: "2026-08-24" },
        dataView: "ka_data",
      }),
    });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: false,
      error: { code: "SOURCE_TRUNCATED", requestId: expect.any(String) },
    });
    expect(JSON.stringify(body)).not.toContain("fixture-internal-token");
  });
});
