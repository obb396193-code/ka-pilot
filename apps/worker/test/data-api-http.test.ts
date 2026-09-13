import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SessionHttpService } from "../src/auth/session-http.js";

import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangeSetAuthorizationError } from "@ka/db";

import type {
  ApprovedWorkspaceAuthContext,
  DataQueryId,
  SourceQueryResult,
} from "@ka/domain";

import {
  createDataApiServer,
  type DataQueryAccessPolicy,
} from "../src/data/http-server.js";
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

const teamAuth: ApprovedWorkspaceAuthContext = {
  workspaceId: auth.workspaceId, userId: auth.userId, role: "optimizer",
  workspaceKind: "team", scope: { kind: "team_workspace_readonly" },
};

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
    workItems: { findForRead: async () => null },
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
    auth?: ApprovedWorkspaceAuthContext;
    dataQueryAccess?: DataQueryAccessPolicy;
    sessionHttpService?: SessionHttpService;
  } = {}) {
    const activeAuth = options.auth ?? auth;
    const service = new DataQueryService({
      registry: createDataQueryRegistry(),
      kaData: options.kaData ?? { query: async (resolved) => ready(
        resolved.queryId,
        "ka_data",
        [canonicalRow(resolved.queryId, 10, activeAuth.workspaceId, "account-1")],
      ) },
      platform: options.platform ?? { query: async (resolved) => ready(
        resolved.queryId,
        "canonical",
        [canonicalRow(resolved.queryId, 11, activeAuth.workspaceId, "account-1")],
      ) },
      requestId: () => "http-smoke-request",
      ...(options.dataQueryAccess === undefined ? {} : { sourcePolicy: options.dataQueryAccess }),
    });
    const server = createDataApiServer({
      service,
      detailService: options.detailService ?? emptyDetailService(),
      taskListService: emptyTaskListService(),
      accountListService: emptyAccountListService(),
      workItemListService: emptyWorkItemListService(),
      sessionAuthService: approvedSessionAuth(activeAuth),
      internalToken,
      ...(options.sessionHttpService === undefined ? {} : { sessionHttpService: options.sessionHttpService }),
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

  it("runs the actual Web BFF through loopback Session and query HTTP composition", async () => {
    const platform = { query: vi.fn<DataSourceQueryPort["query"]>(async (resolved) => {
      const row = canonicalRow(resolved.queryId, 11, auth.workspaceId, "account-1");
      if (resolved.queryId === "account.dimension" && resolved.params.dimensionType !== "account") {
        const source = ready(resolved.queryId, "canonical", [{ key: "synthetic-group", label: "Synthetic",
          metrics: row.metrics, assessment: row.assessment, anomaly: row.anomaly }]);
        source.dimension = resolved.params.dimensionType; return source;
      }
      return ready(resolved.queryId, "canonical", [row]);
    }) };
    // Synthetic auth/data ports; the BFF, fetch transport, HTTP handler, Registry,
    // query service and each package's response decoder are real, not a PG test.
    const sessionHttpService = { current: async (_token: string, requestId: string) => {
      const workspace = { id: auth.workspaceId, name: "Synthetic", kind: "personal", role: "admin", readOnly: false, isDemo: false };
      return { status: 200, body: { ok: true, data: { identity: { id: "00000000-0000-4000-8000-0000000000d2", provider: "internal_test", displayName: "Synthetic", mustChangePassword: false }, activeWorkspace: workspace,
        workspaces: [workspace] }, meta: { requestId } } };
    } } as unknown as SessionHttpService;
    const baseUrl = await start({ platform, sessionHttpService });
    const moduleUrl = new URL("../../web/lib/data/bff.ts", import.meta.url).href;
    const script = `
      const {handleSemanticQueryRequest} = await import(process.argv[1]).then(m => m.default ?? m);
      const results=[];
      for (const [query_type, dimension_type] of [['summary'],['trend'],['table'],['dimension','account'],['dimension','task'],['dimension','biz']]) {
        const request=new Request('http://localhost/api/internal/query', {method:'POST',headers:{cookie:'ka_session=synthetic-session-token-at-least-32-characters'},
          body:JSON.stringify({query_type,...(dimension_type?{dimension_type}:{}),date:'2026-08-24',filters:{media:'KUAISHOU',account_id:'account-1'}})});
        results.push(await handleSemanticQueryRequest(request,{environment:{KA_DATA_BACKEND_ORIGIN:process.argv[2],KA_DATA_SERVICE_TOKEN:process.argv[3]},requestId:()=> 'bff-real-http'}));
      }
      process.stdout.write(JSON.stringify(results));
    `;
    const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script, moduleUrl, baseUrl, internalToken],
      { timeout: 15000, maxBuffer: 1024 * 1024 });
    const results = JSON.parse(stdout) as { status: number; requestId: string; body: { ok: boolean; data?: { source: { queryId: string } } } }[];
    expect(results.map((item) => item.status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(results.map((item) => item.body.data?.source.queryId)).toEqual(["account.summary", "account.trend", "account.table", "account.dimension", "account.dimension", "account.dimension"]);
    expect(results.every((item) => item.requestId === "bff-real-http")).toBe(true);
    expect(platform.query).toHaveBeenCalledTimes(6);
  });

  it.each(["tuple", "dimension", "cash", "duplicate", "bytes"])("account dimension rejects malicious source %s", async (change) => {
    const source = ready("account.dimension", "canonical", [canonicalRow("account.dimension", 10, auth.workspaceId, "account-1")]);
    if (change === "tuple") { source.rows[0]!.media = "TENCENT"; source.rows[0]!.key = "TENCENT:account-1"; }
    if (change === "dimension") source.dimension = "task";
    if (change === "cash") (source.rows[0]!.metrics as Record<string, unknown>).cashCost = { value: "bad", availability: "available" };
    if (change === "duplicate") { source.rows.push(structuredClone(source.rows[0]!)); source.returnedRowCount++; }
    const platform = { query: vi.fn<DataSourceQueryPort["query"]>(async () => source) };
    const baseUrl = await start({ platform, ...(change === "bytes" ? { maxResponseBytes: 100 } : {}) });
    const response = await fetch(`${baseUrl}/api/v1/query`, { method: "POST", headers: { ...authHeaders(), "x-request-id": "dimension-invalid" },
      body: JSON.stringify({ queryId: "account.dimension", params: { date: "2026-08-24", dimensionType: "account" } }) });
    expect(response.status).toBe(change === "tuple" ? 403 : 502);
    expect(await response.json()).toMatchObject({ ok: false, error: { requestId: "dimension-invalid" } });
  });
  it("account dimension fails closed at the exact response byte limit", async () => {
    const platform = { query: vi.fn<DataSourceQueryPort["query"]>(async () => ready("account.dimension", "canonical", [canonicalRow("account.dimension", 10, auth.workspaceId, "account-1")])) };
    const send = (base: string) => fetch(`${base}/api/v1/query`, { method: "POST", headers: { ...authHeaders(), "x-request-id": "dimension-exact" },
      body: JSON.stringify({ queryId: "account.dimension", params: { date: "2026-08-24", dimensionType: "account" } }) });
    const reference = await send(await start({ platform })); expect(reference.status).toBe(200);
    const bytes = Buffer.byteLength(await reference.text());
    const blocked = await send(await start({ platform, maxResponseBytes: bytes }));
    expect(blocked.status).toBe(502); expect(await blocked.json()).toMatchObject({ ok: false, error: { code: "SOURCE_TRUNCATED", requestId: "dimension-exact" } });
  });

  it.each(["summary", "trend", "table"] as const)("public semantic alias reuses canonical %s and strict Session source selection", async (kind) => {
    const platform = { query: vi.fn<DataSourceQueryPort["query"]>(async (resolved) => ready(resolved.queryId, "canonical",
      [canonicalRow(resolved.queryId, 11, auth.workspaceId, "account-1")])) };
    const baseUrl = await start({ platform });
    const queryId = `account.${kind}`;
    const bodies = [
      { queryId, params: { date: "2026-08-24", media: "KUAISHOU", accountIds: ["account-1"] } },
      { query_type: kind, date: "2026-08-24", filters: { media: "KUAISHOU", account_id: "account-1" } },
    ];
    for (const body of bodies) {
      const response = await fetch(`${baseUrl}/api/v1/query`, { method: "POST", headers: {
        ...authHeaders(), "x-request-id": "semantic-alias", "x-ka-workspace-id": "forged", "x-ka-scope-kind": "team_workspace_readonly",
      }, body: JSON.stringify(body) });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe("semantic-alias");
      expect(await response.json()).toMatchObject({ ok: true, data: { mode: "platform", source: {
        queryId, rowSchemaVersion: `${queryId}/${kind === "table" ? "v2" : "v3"}`,
        lineage: { workspaceKind: "personal" },
      } } });
    }
    expect(platform.query).toHaveBeenCalledTimes(2);
    for (const [resolved, scope] of platform.query.mock.calls) {
      expect(resolved.params).toMatchObject({ dateFrom: "2026-08-24", dateTo: "2026-08-24", media: "KUAISHOU", accountIds: ["account-1"] });
      expect(scope).toMatchObject({ workspaceId: auth.workspaceId, scopeKind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "account-1" }] });
    }
  });

  it.each([
    { query_type: "summary", date: "2026-08-24", sql: "SELECT * FROM secret" },
    { query_type: "summary", date: "2026-08-24", workspaceId: "forged" },
    { query_type: "summary", date: "2026-08-24", dataView: "ka_data" },
    { query_type: "summary", queryId: "account.summary", params: {} },
    { query_type: "summary", date: "2026-08-24", filters: { media: "KUAISHOU", account_id: "not-granted" } },
    { query_type: "summary", date: "2026-08-24", filters: { owner: "unsupported-yet" } },
    { query_type: "summary", date: "2026-02-31" },
    { queryId: "reconcile.account_daily", params: { date: "2026-08-24" } },
  ])("semantic alias never drops unimplemented/unsafe filters or opens diagnostics: %j", async (body) => {
    const platform = { query: vi.fn() }, kaData = { query: vi.fn() };
    const baseUrl = await start({ platform, kaData });
    const response = await fetch(`${baseUrl}/api/v1/query`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
    expect([400, 403, 404]).toContain(response.status);
    expect(await response.json()).toMatchObject({ ok: false, error: { requestId: expect.any(String) } });
    expect(platform.query).not.toHaveBeenCalled(); expect(kaData.query).not.toHaveBeenCalled();
  });

  it.each(["summary", "trend"] as const)("semantic %s task filter reaches only the personal adapter", async (kind) => {
    const platform = { query: vi.fn<DataSourceQueryPort["query"]>(async (resolved) => ready(resolved.queryId, "canonical",
      [canonicalRow(resolved.queryId, 11, auth.workspaceId, "account-1")])) }, kaData = { query: vi.fn() };
    const baseUrl = await start({ platform, kaData });
    const response = await fetch(`${baseUrl}/api/v1/query`, { method: "POST", headers: { ...authHeaders(), "x-request-id": "task-alias" },
      body: JSON.stringify({ query_type: kind, date: "2026-08-24", filters: { task_id: "task-a" } }) });
    expect(response.status).toBe(200); expect(response.headers.get("x-request-id")).toBe("task-alias");
    expect(platform.query.mock.calls[0]?.[0].params.taskId).toBe("task-a");
    expect(platform.query.mock.calls[0]?.[1]).toMatchObject({ workspaceId: auth.workspaceId, scopeKind: "explicit_accounts" });
    expect(kaData.query).not.toHaveBeenCalled();
  });

  it("semantic alias keeps authentication, method and exact byte boundaries", async () => {
    const body = JSON.stringify({ query_type: "summary", date: "2026-08-24" });
    const headers = { ...authHeaders(), "x-request-id": "alias-limit" };
    const probe = await start();
    const original = await fetch(`${probe}/api/v1/query`, { method: "POST", headers, body });
    expect(original.status).toBe(200);
    const byteLimit = Buffer.byteLength(await original.text());
    const baseUrl = await start({ maxResponseBytes: byteLimit });
    const missing = await fetch(`${baseUrl}/api/v1/query`, { method: "POST", body });
    expect(missing.status).toBe(401);
    const method = await fetch(`${baseUrl}/api/v1/query`, { headers: authHeaders() });
    expect(method.status).toBe(405);
    const bounded = await fetch(`${baseUrl}/api/v1/query`, { method: "POST", headers, body });
    expect(bounded.status).toBe(502);
    expect(await bounded.json()).toMatchObject({ ok: false, error: { code: "SOURCE_TRUNCATED", requestId: "alias-limit" } });
  });

  it("semantic alias reads the approved team source and cannot switch it by forged headers", async () => {
    const platform = { query: vi.fn() };
    const kaData = { query: vi.fn<DataSourceQueryPort["query"]>(async (resolved) => ready(resolved.queryId, "ka_data",
      [canonicalRow(resolved.queryId, 10, teamAuth.workspaceId, "account-1")])) };
    const baseUrl = await start({ auth: teamAuth, platform, kaData,
      dataQueryAccess: { kaDataEnabled: true, diagnosticEnabled: false, entitlements: [] } });
    const response = await fetch(`${baseUrl}/api/v1/query`, { method: "POST", headers: {
      ...authHeaders(), "x-ka-workspace-kind": "personal", "x-ka-account-scope": "forged",
    }, body: JSON.stringify({ query_type: "summary", date: "2026-08-24" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { mode: "ka_data", source: {
      rowSchemaVersion: "account.summary/v3", lineage: { workspaceKind: "team" }, rows: [{ assessment: { priceSource: "ka_daily" } }],
    } } });
    expect(platform.query).not.toHaveBeenCalled();
    expect(kaData.query.mock.calls[0]?.[1]).toMatchObject({ scopeKind: "team_workspace_readonly", workspaceId: teamAuth.workspaceId });
  });

  it.each(["ka_data", "platform", "reconcile"] as const)(
    "serves %s through its server-selected HTTP route",
    async (dataView) => {
      const baseUrl = await start({
        auth: dataView === "ka_data" ? teamAuth : auth,
        dataQueryAccess: {
          diagnosticEnabled: true,
          kaDataEnabled: true,
          entitlements: [{ workspaceId: auth.workspaceId, userId: auth.userId }],
        },
      });
      const path = dataView === "reconcile" ? "/api/v1/admin/data/reconcile" : "/api/v1/data/query";
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { ...authHeaders(), "x-request-id": `bff-${dataView}-001` },
        body: JSON.stringify({
          queryId: dataView === "reconcile" ? "reconcile.account_daily" : "account.summary",
          params: { date: "2026-08-24" },
        }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("x-request-id")).toBe(`bff-${dataView}-001`);
      const payload = await response.json();
      expect(payload).toMatchObject({ ok: true, data: { mode: dataView } });
      if (dataView === "reconcile") {
        expect(payload.data.kaData.lineage.workspaceKind).toBe("personal");
        expect(payload.data.platform.lineage.workspaceKind).toBe("personal");
      } else {
        expect(payload.data.source.lineage.workspaceKind).toBe(dataView === "ka_data" ? "team" : "personal");
      }
    },
  );

  it.each(["optimizer", "operator", "lead", "admin"] as const)(
    "rejects browser source selection for ordinary %s sessions",
    async (role) => {
      const kaData = { query: vi.fn(async () => { throw new Error("KA must not run"); }) };
      const platform = { query: vi.fn(async (resolved) => ready(
        resolved.queryId,
        "canonical",
        [canonicalRow(resolved.queryId, 11, auth.workspaceId, "account-1")],
      )) };
      const baseUrl = await start({ auth: { ...auth, role }, kaData, platform });
      const response = await fetch(`${baseUrl}/api/v1/data/query`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          queryId: "account.summary",
          params: { date: "2026-08-24" },
          dataView: "ka_data",
        }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
      expect(kaData.query).not.toHaveBeenCalled();
      expect(platform.query).not.toHaveBeenCalled();
    },
  );

  it("does not grant diagnostics when the server flag is off even if an entitlement is configured", async () => {
    const kaData = { query: vi.fn(async () => { throw new Error("KA must not run"); }) };
    const platform = { query: vi.fn(async (resolved) => ready(
      resolved.queryId,
      "canonical",
      [canonicalRow(resolved.queryId, 11, auth.workspaceId, "account-1")],
    )) };
    const baseUrl = await start({
      kaData,
      platform,
      dataQueryAccess: {
        diagnosticEnabled: false,
        kaDataEnabled: true,
        entitlements: [{ workspaceId: auth.workspaceId, userId: auth.userId }],
      },
    });
    const response = await fetch(`${baseUrl}/api/v1/admin/data/reconcile`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        queryId: "reconcile.account_daily",
        params: { date: "2026-08-24" },
      }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(platform.query).not.toHaveBeenCalled();
    expect(kaData.query).not.toHaveBeenCalled();
  });

  it("rejects KA views when the entitled diagnostic path is enabled but KA Data is off", async () => {
    const kaData = { query: vi.fn(async () => { throw new Error("KA must not run"); }) };
    const platform = { query: vi.fn(async () => { throw new Error("platform must not run"); }) };
    const baseUrl = await start({
      kaData,
      platform,
      dataQueryAccess: {
        diagnosticEnabled: true,
        kaDataEnabled: false,
        entitlements: [{ workspaceId: auth.workspaceId, userId: auth.userId }],
      },
    });
    const response = await fetch(`${baseUrl}/api/v1/admin/data/reconcile`, {
      method: "POST",
      headers: { ...authHeaders(), "x-request-id": "diagnostic-ka-off" },
      body: JSON.stringify({
        queryId: "reconcile.account_daily",
        params: { date: "2026-08-24" },
      }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "VIEW_UNSUPPORTED",
        message: "KA Data diagnostic views are disabled by server configuration",
        retryable: false,
        requestId: "diagnostic-ka-off",
      },
    });
    expect(kaData.query).not.toHaveBeenCalled();
    expect(platform.query).not.toHaveBeenCalled();
  });

  it("cannot receive a diagnostic entitlement from the browser body", async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        queryId: "account.summary",
        params: { date: "2026-08-24" },
        dataView: "ka_data",
        diagnosticEntitlement: true,
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
  });

  it.each(["optimizer", "operator", "lead", "admin"] as const)(
    "denies the dedicated diagnostic route to %s without an exact entitlement",
    async (role) => {
      const kaData = { query: vi.fn() };
      const platform = { query: vi.fn() };
      const baseUrl = await start({
        auth: { ...auth, role }, kaData, platform,
        dataQueryAccess: { kaDataEnabled: true, diagnosticEnabled: true, entitlements: [] },
      });
      const response = await fetch(`${baseUrl}/api/v1/admin/data/reconcile`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ queryId: "reconcile.account_daily", params: { date: "2026-08-24" } }),
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(kaData.query).not.toHaveBeenCalled();
      expect(platform.query).not.toHaveBeenCalled();
    },
  );

  it("keeps team source failure separate from personal reads and never falls back", async () => {
    const kaData = { query: vi.fn() };
    const platform = { query: vi.fn() };
    const baseUrl = await start({ auth: teamAuth, kaData, platform });
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ queryId: "account.summary", params: { date: "2026-08-24" } }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "SOURCE_UNAVAILABLE" } });
    expect(kaData.query).not.toHaveBeenCalled();
    expect(platform.query).not.toHaveBeenCalled();
  });

  it.each(["dataView", "data_view"])("rejects %s even from an entitled diagnostic caller", async (key) => {
    const kaData = { query: vi.fn() };
    const platform = { query: vi.fn() };
    const baseUrl = await start({
      kaData, platform,
      dataQueryAccess: { diagnosticEnabled: true, kaDataEnabled: true, entitlements: [auth] },
    });
    const response = await fetch(`${baseUrl}/api/v1/admin/data/reconcile`, {
      method: "POST", headers: authHeaders(),
      body: JSON.stringify({ queryId: "reconcile.account_daily", params: {}, [key]: "reconcile" }),
    });
    expect(response.status).toBe(400);
    expect(kaData.query).not.toHaveBeenCalled();
    expect(platform.query).not.toHaveBeenCalled();
  });

  it("applies authentication and method boundaries to the dedicated diagnostic route", async () => {
    const baseUrl = await start();
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const result = await fetch(`${baseUrl}/api/v1/admin/data/reconcile`, { method, headers: authHeaders() });
      expect(result.status).toBe(405);
    }
    const result = await fetch(`${baseUrl}/api/v1/admin/data/reconcile`, {
      method: "POST", headers: { "x-request-id": "admin-auth-1" }, body: "{}",
    });
    expect(result.status).toBe(401);
    expect(await result.json()).toMatchObject({ ok: false, error: { requestId: "admin-auth-1" } });
  });

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
      auth: teamAuth,
      kaData: {
        query: async () => {
          throw new KaDataClientError("UPSTREAM_TIMEOUT", "KA Data request timed out", true);
        },
      },
      dataQueryAccess: {
        diagnosticEnabled: true,
        kaDataEnabled: true,
        entitlements: [{ workspaceId: auth.workspaceId, userId: auth.userId }],
      },
    });
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: { ...authHeaders(), "x-request-id": "bff-timeout-001" },
      body: JSON.stringify({
        queryId: "account.summary",
        params: { date: "2026-08-24" },
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
        // v1.9.40：部分合计的列名单；本桩不造缺口。
        partial: [],
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
    } as never, undefined, { summary: async () => ({
      row: { ...canonicalRow("account.summary", 1), metrics: { cost: "not-a-number" } },
      window: { from: "2026-08-24", to: "2026-08-24", preset: "custom" }, warnings: [],
    }) } as never);
    const baseUrl = await start({ platform });
    const response = await fetch(`${baseUrl}/api/v1/data/query`, {
      method: "POST",
      headers: { ...authHeaders(), "x-request-id": "platform-contract-001" },
      body: JSON.stringify({
        queryId: "account.summary",
        params: { date: "2026-08-24" },
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

  it("keeps repository scope denial as HTTP403 with the same requestId and approved session", async () => {
    const id = "00000000-0000-4000-8000-000000000202";
    const find = vi.fn().mockRejectedValue(new ChangeSetAuthorizationError());
    const baseUrl = await start({ detailService: new ReadDetailService({
      workItems: { findForRead: async () => null }, changeSets: { find },
    }) });
    const response = await fetch(`${baseUrl}/api/v1/changesets/${id}`, {
      headers: { ...authHeaders(), "x-request-id": "changeset-repo-denial", "x-ka-account-scope": "forged" },
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: { code: "FORBIDDEN",
      message: "Changeset is outside the approved account scope", retryable: false, requestId: "changeset-repo-denial" } });
    expect(find).toHaveBeenCalledWith(auth.workspaceId, id, auth);
  });

  it("serves both read-only detail routes with the same auth and requestId boundary", async () => {
    const workItemId = "00000000-0000-4000-8000-000000000201";
    const changesetId = "00000000-0000-4000-8000-000000000202";
    const userId = "00000000-0000-4000-8000-000000000203";
    const detailService = new ReadDetailService({
      workItems: {
        findForRead: async () => ({ record: {
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
        }, taskScopeAccount: null }),
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
            fromValue: { type: "number" as const, value: 30 },
            toValue: { type: "number" as const, value: 27 },
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
        findForRead: async () => ({ record: {
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
        }, taskScopeAccount: null }),
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
        findForRead: async () => ({ record: {
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
        }, taskScopeAccount: null }),
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
        findForRead: async () => ({ record: {
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
        }, taskScopeAccount: null }),
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
      workItems: { findForRead: async () => null },
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
            fromValue: { type: "number" as const, value: 30 },
            toValue: { type: "number" as const, value: 27 },
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

  it("fails closed at the exact serialized boundary on the administrator endpoint too", async () => {
    const options = {
      dataQueryAccess: {
        diagnosticEnabled: true, kaDataEnabled: true,
        entitlements: [{ workspaceId: auth.workspaceId, userId: auth.userId }],
      },
    };
    const payload = { queryId: "reconcile.account_daily", params: { date: "2026-08-24" } };
    const first = await start(options);
    const probe = await fetch(`${first}/api/v1/admin/data/reconcile`, {
      method: "POST", headers: { ...authHeaders(), "x-request-id": "admin-size-probe" },
      body: JSON.stringify(payload),
    });
    expect(probe.status).toBe(200);
    const exactBytes = Buffer.byteLength(await probe.text());
    const limited = await start({ ...options, maxResponseBytes: exactBytes });
    const response = await fetch(`${limited}/api/v1/admin/data/reconcile`, {
      method: "POST", headers: { ...authHeaders(), "x-request-id": "admin-size-probe" },
      body: JSON.stringify(payload),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false, error: { code: "SOURCE_TRUNCATED", requestId: "admin-size-probe" },
    });
  });
});
