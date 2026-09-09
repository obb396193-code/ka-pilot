import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EtlRunListError } from "@ka/db";
import { etlRunListResponseSchema } from "@ka/domain";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { EtlRunListService } from "../src/admin/etl-run-list-service.js";
import { approvedSessionAuth, businessHeaders, personalAuth } from "./business-auth-fixtures.js";

const token = "synthetic-etl-internal-token-long-enough", requestId = "synthetic-etl-http";
const auth = personalAuth({ workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", accounts: [] });
const row = { runId: "9007199254740993", jobId: "33333333-3333-4333-8333-333333333333", attempt: null,
  jobType: "etl_incr", status: "done", businessDate: "2026-09-08", startedAt: "2026-09-08T01:00:00Z", finishedAt: "2026-09-08T01:01:00Z",
  rows: { raw: 1, canonical: null }, warnings: [{ code: "LEGACY_NO_ATTEMPT" }] };
const data = { items: [row], page: 1, pageSize: 50, total: 1 };
describe("ETL runs production HTTP composition", () => {
  const servers: Server[] = [];
  afterEach(async () => { for (const server of servers.splice(0)) { if (!server.listening) continue; server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); } });
  async function start(options: { result?: unknown; failure?: unknown; max?: number; missing?: boolean; context?: typeof auth; serviceResult?: unknown } = {}) {
    const list = vi.fn(async () => { if (options.failure) throw options.failure;
      return options.result ?? { workspaceId: auth.workspaceId, data, dataAsOf: "2026-09-08T01:01:00Z" }; });
    const unused = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    const server = createDataApiServer({ service: unused, detailService: unused, taskListService: unused, accountListService: unused, workItemListService: unused,
      internalToken: token, sessionAuthService: approvedSessionAuth(options.context ?? auth), maxResponseBytes: options.max,
      etlRunListService: options.missing ? undefined : options.serviceResult ? { list: async () => options.serviceResult } : new EtlRunListService({ list }, () => new Date("2026-09-08T01:00:00Z")),
    } as unknown as DataApiServerOptions);
    servers.push(server); await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing test address");
    return { list, call: async (method = "GET", search = "", headers: Record<string, string> = businessHeaders(token)) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/system/etl-runs${search}`, { method,
        headers: { ...headers, "x-request-id": requestId, "x-ka-workspace-id": "forged", "x-ka-role": "admin" } });
      return { status: response.status, headers: response.headers, body: await response.json() };
    } };
  }
  it("returns strict canonical pagination with only trusted session context and observed time", async () => {
    const state = await start(), result = await state.call();
    expect(result).toMatchObject({ status: 200, body: { ok: true, data, meta: { requestId, dataAsOf: "2026-09-08T01:01:00Z", _note: "运行观测时间，非 canonical 数据新鲜度" } } });
    expect(etlRunListResponseSchema.safeParse(result.body).success).toBe(true);
    expect(result.headers.get("cache-control")).toBe("no-store"); expect(result.headers.get("x-request-id")).toBe(requestId);
    expect(state.list).toHaveBeenCalledWith(auth, { page: 1, pageSize: 50 });
  });
  it("accepts explicit pagination and legitimate empty past-end pages", async () => {
    const snapshot = { workspaceId: auth.workspaceId, data: { items: [], page: 3, pageSize: 10, total: 1 }, dataAsOf: null };
    const state = await start({ result: snapshot }), result = await state.call("GET", "?page=3&pageSize=10");
    expect(result.status).toBe(200); expect(result.body.meta.dataAsOf).toBeNull();
    expect(state.list).toHaveBeenCalledWith(auth, { page: 3, pageSize: 10 });
  });
  it("permits admin team readonly scope", async () => {
    const context = { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } } as typeof auth;
    const state = await start({ context }); expect((await state.call()).status).toBe(200);
    expect(state.list).toHaveBeenCalledWith(context, { page: 1, pageSize: 50 });
  });
  it.each(["optimizer", "operator", "lead"] as const)("rejects %s before DB", async role => {
    const state = await start({ context: { ...auth, role } }); expect((await state.call()).status).toBe(403); expect(state.list).not.toHaveBeenCalled();
  });
  it("requires internal bearer and session before repository", async () => {
    const state = await start();
    for (const headers of [{}, { authorization: `Bearer ${token}` }, { cookie: "ka_session=synthetic-cookie-long-enough-for-test" }]) expect((await state.call("GET", "", headers)).status).toBe(401);
    expect((await state.call("GET", "", { ...businessHeaders(token), authorization: "Bearer wrong" })).status).toBe(403);
    expect(state.list).not.toHaveBeenCalled();
  });
  it.each(["POST", "PATCH", "DELETE", "OPTIONS", "PUT"])("rejects %s without invoking source", async method => {
    const state = await start(), result = await state.call(method);
    expect(result.status).toBe(405); expect(result.headers.get("allow")).toBe("GET"); expect(state.list).not.toHaveBeenCalled();
  });
  it.each(["?page=0", "?page=01", "?page=1.2", "?page=1e2", "?page=", "?pageSize=201", "?pageSize=0", "?pageSize=-1",
    "?page=1&page=2", "?pageSize=10&pageSize=10", "?page=9007199254740991", "?workspaceId=foreign", "?scope=all", "?dataView=ka_data"])("rejects malformed query %s", async search => {
    const state = await start(); expect((await state.call("GET", search)).status).toBe(400); expect(state.list).not.toHaveBeenCalled();
  });
  it.each(["FORBIDDEN", "INVALID_REQUEST", "SOURCE_UNAVAILABLE", "UPSTREAM_INVALID_RESPONSE", "SOURCE_TRUNCATED", "UPSTREAM_TIMEOUT"] as const)("maps typed %s safely", async code => {
    const status = { FORBIDDEN: 403, INVALID_REQUEST: 400, SOURCE_UNAVAILABLE: 503, UPSTREAM_INVALID_RESPONSE: 502, SOURCE_TRUNCATED: 502, UPSTREAM_TIMEOUT: 504 }[code];
    const result = await (await start({ failure: new EtlRunListError(code) })).call();
    expect(result).toMatchObject({ status, body: { ok: false, error: { code, requestId } } });
    expect(etlRunListResponseSchema.safeParse(result.body).success).toBe(true);
  });
  it("rejects corrupt snapshots, cross-workspace output and pagination drift", async () => {
    for (const snapshot of [{ workspaceId: "foreign", data, dataAsOf: null }, { workspaceId: auth.workspaceId, data: { ...data, pageSize: 2 }, dataAsOf: null },
      { workspaceId: auth.workspaceId, data, dataAsOf: "2026-02-31T00:00:00Z" }, { workspaceId: auth.workspaceId, data, dataAsOf: null, secret: "private" }]) {
      const result = await (await start({ result: snapshot })).call(); expect(result.status).toBe(502); expect(JSON.stringify(result.body)).not.toContain("private");
    }
  });
  it("missing service is unavailable, generic faults do not leak, counterfeit service meta rejected", async () => {
    expect((await (await start({ missing: true })).call()).status).toBe(503);
    const result = await (await start({ failure: new Error("SQL/token/private") })).call(); expect(result.status).toBe(500); expect(JSON.stringify(result.body)).not.toContain("private");
    expect((await (await start({ serviceResult: { ok: true, data, meta: { requestId: "wrong" } } })).call()).status).toBe(502);
  });
  it("rejects exact serialized envelope cap, accepts one byte below", async () => {
    const baseline = await (await start()).call(), bytes = Buffer.byteLength(JSON.stringify(baseline.body));
    expect(baseline.status).toBe(200);
    expect((await (await start({ max: bytes + 1 })).call()).status).toBe(200);
    expect(await (await start({ max: bytes })).call()).toMatchObject({ status: 502, body: { error: { code: "SOURCE_TRUNCATED", requestId } } });
  });
  it("enforces the real default 16MiB cap on valid large public warnings", async () => {
    const accountIds = Array.from({ length: 1000 }, (_, index) => `${index}-${"x".repeat(200)}`);
    const warnings = Array.from({ length: 90 }, (_, index) => ({ code: "BATCH_FAILED", resource: "account_realtime", ds: "2026-09-08",
      accountIds, fingerprint: index.toString(16).padStart(64, "0") }));
    const large = { ...data, items: [{ ...row, attempt: 1, warnings }] };
    expect(Buffer.byteLength(JSON.stringify(large))).toBeGreaterThan(16 * 1024 * 1024);
    const result = await (await start({ result: { workspaceId: auth.workspaceId, data: large, dataAsOf: null } })).call();
    expect(result).toMatchObject({ status: 502, body: { error: { code: "SOURCE_TRUNCATED", requestId } } });
    expect(result.body).not.toHaveProperty("data");
  }, 15_000);
});
