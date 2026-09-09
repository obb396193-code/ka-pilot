import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { approvedWorkspaceAuthContextSchema, dataQueryResponseSchema, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import { describe, expect, it, vi } from "vitest";
import { createDataQueryRegistry, isResolvedDataQuery } from "../src/data/query-registry.js";
import { DataQueryService, createDataQueryHttpHandler, type DataQueryServiceDependencies } from "../src/data/query-service.js";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { approvedSessionAuth, businessHeaders } from "./business-auth-fixtures.js";
import type { SessionHttpService } from "../src/auth/session-http.js";

const auth: ApprovedWorkspaceAuthContext = { workspaceKind: "personal", workspaceId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002", role: "optimizer", scope: { kind: "explicit_accounts", accounts: [
    { media: "KUAISHOU", accountId: "account-1", accessLevel: "read" }, { media: "TENCENT", accountId: "account-1", accessLevel: "read" }] } };
const request = { queryId: "account.hourly", params: { date: "2026-09-05", media: "KUAISHOU", hhFrom: 0, hhTo: 0 } };
async function proof() {
  const fixture = JSON.parse(await readFile(new URL("../../../packages/contract/fixtures/data-query/hourly.json", import.meta.url), "utf8"));
  // Synthetic coherent envelope around frozen row projection, NOT a claim that
  // the fixture's contradictory partial total/time metadata is production-valid.
  const source = fixture.data.source; source.rows = [source.rows[0]]; source.returnedRowCount = 1;
  source.wholeResultTotal = { value: 1, availability: "available" }; source.warnings = [];
  source.lineage = { ...source.lineage, window: { from: "2026-09-05", to: "2026-09-05", preset: "custom" },
    partial: false, coverage: { complete: true, requestedObjects: 1, returnedObjects: 1 },
    dataAsOf: source.rows[0].lastSyncAt };
  return { workspaceId: auth.workspaceId, source };
}
function setup(hourly?: (resolved: unknown, approved: ApprovedWorkspaceAuthContext) => Promise<unknown>) {
  const query = vi.fn(async () => { throw new Error("No daily fallback allowed"); });
  const dependencies = { registry: createDataQueryRegistry(), platform: { query }, kaData: { query },
    ...(hourly === undefined ? {} : { hourly: { query: hourly } }), requestId: () => "hourly-test" };
  return { query, service: new DataQueryService(dependencies as DataQueryServiceDependencies) };
}
describe("hourly query Registry, scope and source boundary", () => {
  it("registers hourly using frozen syntax without creating a KA SQL path", () => {
    const registry = createDataQueryRegistry(), resolved = registry.resolve(request.queryId, request.params, "platform");
    expect(resolved).toMatchObject({ queryId: "account.hourly", rowSchemaVersion: "account.hourly/v1", maxRows: 10000,
      params: { dateFrom: "2026-09-05", dateTo: "2026-09-05", media: "KUAISHOU", hhFrom: 0, hhTo: 0 } });
    expect(registry.list().some(q => q.queryId === "account.hourly")).toBe(true);
    expect(() => registry.buildTeamKaDataPlan(resolved)).toThrow();
    expect(() => registry.resolve(request.queryId, { ...request.params, hhTo: 25 }, "platform")).toThrow();
  });
  it("absent hourly source returns503 after scope checking, never daily fallback", async () => {
    const { service, query } = setup();
    expect(await createDataQueryHttpHandler(service)({ method: "POST", body: request, auth, requestId: "hourly-off" }))
      .toMatchObject({ status: 503, body: { ok: false, error: { code: "SOURCE_UNAVAILABLE", requestId: "hourly-off" } } });
    expect(await createDataQueryHttpHandler(service)({ method: "POST", body: { ...request, params: { ...request.params, accountIds: ["not-granted"] } }, auth }))
      .toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
  it("narrows full approved tuple, protects it from provider mutation, emits source-correlated metadata", async () => {
    const read = vi.fn(async (_resolved, approved) => {
      expect(isResolvedDataQuery(_resolved)).toBe(true);
      _resolved.params.hhTo = 24;
      expect(approvedWorkspaceAuthContextSchema.safeParse(approved).success).toBe(true);
      expect(approved.scope.accounts).toHaveLength(1);
      approved.scope.accounts.push({ media: "OTHER", accountId: "escape", accessLevel: "read" });
      return proof();
    });
    const { service, query } = setup(read);
    const result = await createDataQueryHttpHandler(service)({ method: "POST", body: request, auth, requestId: "hourly-public" });
    expect(result).toMatchObject({ status: 200, body: { ok: true, data: { source: { queryId: "account.hourly", rows: [{ hh: 0 }] } },
      meta: { requestId: "hourly-public", businessDate: "2026-09-05", workspaceKind: "personal", selectedSource: "platform", dataAsOf: "2026-09-05T09:13:11.000+08:00" } } });
    expect(auth.scope.accounts).toHaveLength(2); expect(query).not.toHaveBeenCalled();
  });
  it.each(["workspace", "media", "account", "hour", "window", "duplicate", "coverage", "rowCount", "total", "time", "type"])("rejects dishonest %s evidence", async fault => {
    const raw = await proof();
    if (fault === "workspace") raw.workspaceId = auth.userId;
    if (fault === "media") raw.source.rows[0].media = "TENCENT";
    if (fault === "account") raw.source.rows[0].accountId = "other";
    if (fault === "hour") raw.source.rows[0].hh = 1;
    if (fault === "window") raw.source.lineage.window.from = "2026-09-04";
    if (fault === "duplicate") { raw.source.rows.push(raw.source.rows[0]); raw.source.returnedRowCount = 2; }
    if (fault === "coverage") raw.source.lineage.coverage.returnedObjects = 2;
    if (fault === "rowCount") raw.source.returnedRowCount = 2;
    if (fault === "total") raw.source.wholeResultTotal.value = 2;
    if (fault === "time") raw.source.rows[0].lastSyncAt = "2026-02-31";
    if (fault === "type") raw.source.rows[0].cumulative.cost.value = "not-a-number";
    const result = await createDataQueryHttpHandler(setup(async () => raw).service)({ method: "POST", body: request, auth });
    const escaped = ["workspace", "media", "account"].includes(fault);
    expect(result).toMatchObject({ status: escaped ? 403 : 502, body: { ok: false, error: {
      code: escaped ? "FORBIDDEN" : "UPSTREAM_INVALID_RESPONSE" } } });
  });
  it("unproven10k/truncation cannot silently pass as partial success", async () => {
    const raw = await proof(); raw.source.lineage.truncated = true; raw.source.lineage.partial = true;
    raw.source.lineage.coverage.complete = false; raw.source.wholeResultTotal = { value: null, availability: "partial" };
    expect(await createDataQueryHttpHandler(setup(async () => raw).service)({ method: "POST", body: request, auth }))
      .toMatchObject({ status: 502, body: { ok: false, error: { code: "SOURCE_TRUNCATED" } } });
  });
  it("unknown source clocks stay null, not response time", async () => {
    const raw = await proof(); raw.source.rows[0].lastSyncAt = null;
    Object.assign(raw.source.lineage, { datasetVersion: null, dataAsOf: null, timezone: null, dayCut: null, metadataAvailability: "unknown" });
    const result = await setup(async () => raw).service.execute(request, auth);
    expect(result).toMatchObject({ ok: true, meta: { dataAsOf: null } });
  });
  it("empty approved scope cannot receive data and a throwing source cannot leak raw details", async () => {
    const empty: ApprovedWorkspaceAuthContext = { ...auth, scope: { kind: "explicit_accounts", accounts: [] } };
    expect(await createDataQueryHttpHandler(setup(async () => proof()).service)({ method: "POST", body: request, auth: empty }))
      .toMatchObject({ status: 502 });
    const failure = await setup(async () => { throw new Error("private-token-sql"); }).service.execute(request, auth);
    expect(failure).toMatchObject({ ok: false, error: { code: "SOURCE_UNAVAILABLE" } });
    expect(JSON.stringify(failure)).not.toContain("private-token");
  });
  it("team cannot fall through to a personal hourly port even if KA is enabled", async () => {
    const read = vi.fn(async () => proof()), query = vi.fn(async () => { throw new Error("No source expected"); });
    const service = new DataQueryService({ registry: createDataQueryRegistry(), platform: { query }, kaData: { query }, hourly: { query: read },
      sourcePolicy: { kaDataEnabled: true, diagnosticEnabled: false, entitlements: [] } });
    expect(await service.execute(request, { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }))
      .toMatchObject({ ok: false, error: { code: "VIEW_UNSUPPORTED" } });
    expect(read).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
  });
  it("trusted exact10k can be complete; same boundary without a total is truncated", async () => {
    const raw = await proof(), accounts = Array.from({ length: 400 }, (_, i) => ({ media: "KUAISHOU", accountId: `a${i}`, accessLevel: "read" as const }));
    const row = raw.source.rows[0];
    raw.source.rows = accounts.flatMap(a => Array.from({ length: 25 }, (_, hh) => ({ ...row, accountId: a.accountId, hh })));
    raw.source.returnedRowCount = 10000; raw.source.wholeResultTotal = { value: 10000, availability: "available" };
    raw.source.lineage.coverage = { complete: true, requestedObjects: 400, returnedObjects: 400 };
    const approved: ApprovedWorkspaceAuthContext = { ...auth, scope: { kind: "explicit_accounts", accounts } };
    const fullRequest = { ...request, params: { ...request.params, hhTo: 24 } };
    expect((await createDataQueryHttpHandler(setup(async () => raw).service)({ method: "POST", body: fullRequest, auth: approved })).status).toBe(200);
    raw.source.wholeResultTotal = { value: null, availability: "partial" }; raw.source.lineage.partial = true; raw.source.lineage.coverage.complete = false;
    expect(await createDataQueryHttpHandler(setup(async () => raw).service)({ method: "POST", body: fullRequest, auth: approved }))
      .toMatchObject({ status: 502, body: { error: { code: "SOURCE_TRUNCATED" } } });
  }, 30000);
  it("permanent Domain/Web full-envelope parity rejects missing metadata, duplicates and invalid types", async () => {
    const good = await setup(async () => proof()).service.execute(request, auth, "hourly-parity");
    if (!good.ok || good.data.mode === "reconcile") throw new Error("Expected hourly test result");
    const baseline = { ...good, data: good.data };
    const variants: unknown[] = [good, { ...good, meta: undefined }, { ...good, meta: { ...good.meta, dataAsOf: null } }];
    for (const field of ["rowSchemaVersion", "lineage", "returnedRowCount"]) {
      const changed = structuredClone(baseline); delete (changed.data.source as Record<string, unknown>)[field]; variants.push(changed);
    }
    for (const [field, value] of [["hh", 25], ["lastSyncAt", "invalid"], ["media", "bad/media"], ["delta", null], ["budgetUsage", { value: 0, state: "undefined" }]] as const) {
      const changed = structuredClone(baseline); changed.data.source.rows[0]![field] = value; variants.push(changed);
    }
    const duplicate = structuredClone(baseline); duplicate.data.source.rows.push(duplicate.data.source.rows[0]!); duplicate.data.source.returnedRowCount = 2; variants.push(duplicate);
    const expected = variants.map(v => dataQueryResponseSchema.safeParse(v).success);
    expect(expected).toEqual([true, ...Array(variants.length - 1).fill(false)]);
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e",
      "const m=await import(process.argv[1]);process.stdout.write(JSON.stringify(JSON.parse(process.argv[2]).map(v=>m.dataQueryResponseSchema.safeParse(v).success)))",
      new URL("../../web/lib/data/contracts.ts", import.meta.url).href, JSON.stringify(variants)], { timeout: 10000 });
    expect(JSON.parse(stdout)).toEqual(expected);
  });
  it("BFF to actual HTTP/Session/Registry consumes hourly and rejects forged scopes", async () => {
    const token = "synthetic-hourly-service-token-long-enough", workspace = { id: auth.workspaceId, name: "synthetic", kind: "personal", role: "optimizer", readOnly: false };
    const sessionHttpService = { current: async (_token: string, requestId: string) => ({ status: 200,
      body: { ok: true, data: { identity: { displayName: "synthetic" }, activeWorkspace: workspace, workspaces: [workspace] }, meta: { requestId } } }) } as unknown as SessionHttpService;
    const absent = new Proxy({}, { get() { throw new Error("Unrelated service invoked"); } });
    const server = createDataApiServer({ service: setup(async () => proof()).service, internalToken: token, sessionHttpService,
      sessionAuthService: approvedSessionAuth(auth), detailService: absent, taskListService: absent, accountListService: absent, workItemListService: absent } as unknown as DataApiServerOptions);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const script = `const {handleSemanticQueryRequest}=await import(process.argv[1]);const p=JSON.parse(process.argv[2]);const results=[];
        for(const extra of [{},{params:{...p.body.params,hhTo:25}},{params:{...p.body.params,accountIds:['unapproved']}},{dataView:'ka_data'}]){
          results.push(await handleSemanticQueryRequest(new Request('http://localhost/api/internal/query',{method:'POST',headers:{...p.headers,'x-ka-account-scope':'*'},body:JSON.stringify({...p.body,...extra})}),
          {environment:{KA_DATA_BACKEND_ORIGIN:p.base,KA_DATA_SERVICE_TOKEN:p.token},requestId:()=> 'hourly-bff'}));}
        process.stdout.write(JSON.stringify(results));`;
      const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script,
        new URL("../../web/lib/data/bff.ts", import.meta.url).href, JSON.stringify({ body: request, headers: businessHeaders(token), token,
          base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })], { timeout: 15000 });
      const results = JSON.parse(stdout); expect(results.map((r: { status: number }) => r.status)).toEqual([200, 400, 403, 400]);
      expect(results[0]).toMatchObject({ body: { ok: true, meta: { requestId: "hourly-bff" } } });
    } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
  });
});
