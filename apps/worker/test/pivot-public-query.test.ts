import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { SessionHttpService } from "../src/auth/session-http.js";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { approvedSessionAuth, businessHeaders } from "./business-auth-fixtures.js";
import { dataQueryResponseSchema } from "@ka/domain";
import { describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { DataQueryService, createDataQueryHttpHandler } from "../src/data/query-service.js";
import { PlatformDataSource, type PlatformQueryRepository } from "../src/data/platform-data-source.js";
import { PlatformPivotQuery } from "../src/data/platform-pivot-query.js";

const auth: ApprovedWorkspaceAuthContext = { workspaceKind: "personal", workspaceId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002", role: "optimizer", scope: { kind: "explicit_accounts",
    accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }, { media: "TENCENT", accountId: "same", accessLevel: "execute" }] } };
const window = { from: "2026-09-01", to: "2026-09-01", preset: "custom" };
const request = { queryId: "account.pivot2", params: { dimA: "account", dimB: "task", window_from: window.from, window_to: window.to, media: "KUAISHOU" } };
const dummy = { querySummary: vi.fn(), queryTrend: vi.fn(), queryTable: vi.fn(), queryLineage: vi.fn() } as PlatformQueryRepository;
const ka = { query: vi.fn() };
async function snapshot() {
  const fixture = JSON.parse(await readFile(new URL("../../../packages/contract/fixtures/data-query/pivot2.json", import.meta.url), "utf8"));
  const metrics = fixture.data.source.rows[0].metrics;
  return { window, members: [{ workspaceId: auth.workspaceId, media: "KUAISHOU", accountId: "same", observed: true,
    accountName: "synthetic", taskId: "task", taskName: "synthetic task", bizName: "synthetic biz",
    computedAt: "2026-09-01T02:00:00.000Z", metrics, assessment: { ds: window.from, cashCost: metrics.cashCost,
      realConversion: metrics.realConversion, price: { value: 38, versionKey: "1", effectiveDate: "2026-09-01" } } }],
    observation: { expectedAccountDays: 1, observedAccountDays: 1, observedAccounts: 1, missingComputedAt: 0,
      earliestComputedAt: "2026-09-01T02:00:00.000Z", latestComputedAt: "2026-09-01T02:00:00.000Z" } };
}
function service(reader: { read: (auth: unknown, window: unknown) => Promise<unknown> }) {
  const platform = new PlatformDataSource(dummy, undefined, undefined, undefined, new PlatformPivotQuery(reader));
  return new DataQueryService({ registry: createDataQueryRegistry(), platform, kaData: ka, requestId: () => "pivot-test" });
}
describe("pivot public query and approved source chain", () => {
  it("uses actual account-day query, narrows media while preserving role/grants, returns strict meta", async () => {
    const read = vi.fn(async () => snapshot());
    const response = await createDataQueryHttpHandler(service({ read }))({ method: "POST", body: request, auth, requestId: "pivot-real" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, data: { mode: "platform", source: { queryId: "account.pivot2", dimA: "account", dimB: "task",
      rows: [{ a: { key: "KUAISHOU:same" }, b: { key: "task" }, assessment: { priceSource: "history" } }],
      lineage: { dataAsOf: "2026-09-01T02:00:00.000Z", metadataAvailability: "partial", datasetVersion: null,
        timezone: null, dayCut: null, partial: false, truncated: false, coverage: { requestedObjects: 1, returnedObjects: 1 } } } },
      meta: { cellCoverage: { cells: 1, withData: 1, undeterminable: 0 } } });
    expect(read.mock.calls[0]).toEqual([{ ...auth, scope: { kind: "explicit_accounts", accounts: [auth.scope.accounts[0]] } }, window]);
    expect(ka.query).not.toHaveBeenCalled();
  });
  it("unknown clock remains unknown/partial instead of current time", async () => {
    const raw = await snapshot(); raw.members[0]!.computedAt = null as unknown as string;
    const result = await service({ read: async () => ({ ...raw, observation: { ...raw.observation, missingComputedAt: 1,
      earliestComputedAt: null, latestComputedAt: null } }) }).execute(request, auth);
    expect(result).toMatchObject({ ok: true, data: { source: { lineage: { dataAsOf: null, metadataAvailability: "unknown", partial: true, truncated: false },
      wholeResultTotal: { value: null, availability: "partial" } } } });
  });
  it.each(["media", "workspaceId", "accountId"])("rejects malicious source %s before success", async key => {
    const raw = await snapshot(); Object.assign(raw.members[0]!, { [key]: key === "workspaceId" ? auth.userId : "OTHER" });
    const result = await createDataQueryHttpHandler(service({ read: async () => raw }))({ method: "POST", body: request, auth });
    expect(result).toMatchObject({ status: 502, body: { ok: false, error: { code: "UPSTREAM_INVALID_RESPONSE" } } });
  });
  it("checks account axes again after a dishonest source port and protects original authority", async () => {
    const correct = await service({ read: async () => snapshot() }).execute(request, auth);
    if (!correct.ok || correct.data.mode === "reconcile") throw new Error("Expected fixture");
    const source = structuredClone(correct.data.source); (source.rows[0]!.a as { key: string }).key = "TENCENT:same";
    const malicious = new DataQueryService({ registry: createDataQueryRegistry(), kaData: ka, platform: { query: vi.fn(),
      pivot: async (_resolved, context) => { if (context.workspaceKind === "personal") context.scope.accounts.push({ media: "TENCENT", accountId: "same", accessLevel: "read" });
        return { source, cellCoverage: { cells: 1, withData: 1, undeterminable: 0 } }; } } });
    expect(await malicious.execute(request, auth)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
  it("empty personal scope remains empty without querying a team fallback", async () => {
    const empty = { ...auth, scope: { kind: "explicit_accounts", accounts: [] } };
    const result = await service({ read: async () => ({ window, members: [], observation: { expectedAccountDays: 0, observedAccountDays: 0,
      observedAccounts: 0, missingComputedAt: 0, earliestComputedAt: null, latestComputedAt: null } }) }).execute(request, empty);
    expect(result).toMatchObject({ ok: true, data: { source: { rows: [], wholeResultTotal: { value: 0, availability: "available" } } },
      meta: { cellCoverage: { cells: 0, withData: 0, undeterminable: 0 } } });
  });
  it.each(["coverage", "returnedObjects", "missingObjects", "truncated"])("bad %s at source boundary is top-level 502, not generic 500", async fault => {
    const good = await service({ read: async () => snapshot() }).execute(request, auth);
    if (!good.ok || good.data.mode === "reconcile") throw new Error("Expected source");
    const source = structuredClone(good.data.source), coverage = { cells: 1, withData: 1, undeterminable: 0 };
    if (fault === "coverage") coverage.withData = 2;
    if (fault === "returnedObjects") source.lineage.coverage.returnedObjects = 2;
    if (fault === "missingObjects") source.lineage.coverage.returnedObjects = 0;
    if (fault === "truncated") { source.lineage.truncated = true; source.lineage.partial = true; source.lineage.coverage.complete = false;
      source.wholeResultTotal = { value: null, availability: "partial" }; }
    const bad = new DataQueryService({ registry: createDataQueryRegistry(), kaData: ka,
      platform: { query: vi.fn(), pivot: async () => ({ source, cellCoverage: coverage }) } });
    expect(await createDataQueryHttpHandler(bad)({ method: "POST", body: request, auth })).toMatchObject({ status: 502,
      body: { ok: false, error: { code: "UPSTREAM_INVALID_RESPONSE" } } });
  });
  it("absent factory and transport failures are stable unavailable, not synthetic cells", async () => {
    for (const platform of [new PlatformDataSource(dummy), new PlatformDataSource(dummy, undefined, undefined, undefined,
      new PlatformPivotQuery({ read: async () => { throw new Error("private-sql-token"); } }))]) {
      const result = await new DataQueryService({ registry: createDataQueryRegistry(), platform, kaData: ka }).execute(request, auth);
      expect(result).toMatchObject({ ok: false, error: { code: "SOURCE_UNAVAILABLE" } });
      expect(JSON.stringify(result)).not.toContain("private");
    }
  });
  it("runs actual BFF/session/HTTP/query ports end to end (synthetic reader, not PostgreSQL)", async () => {
    const token = "synthetic-pivot-internal-token-000000000000";
    const workspace = { id: auth.workspaceId, name: "synthetic", kind: "personal", role: "optimizer", readOnly: false };
    const sessionHttpService = { current: async (_token: string, requestId: string) => ({ status: 200,
      body: { ok: true, data: { identity: { displayName: "synthetic" }, activeWorkspace: workspace, workspaces: [workspace] }, meta: { requestId } } }) } as unknown as SessionHttpService;
    // Non-pivot routes must never be invoked in this isolated HTTP test.
    const unrelated = new Proxy({}, { get: () => () => { throw new Error("Unrelated route invoked"); } });
    const server = createDataApiServer({ service: service({ read: async () => snapshot() }), internalToken: token,
      detailService: unrelated as DataApiServerOptions["detailService"], taskListService: unrelated as DataApiServerOptions["taskListService"],
      accountListService: unrelated as DataApiServerOptions["accountListService"], workItemListService: unrelated as DataApiServerOptions["workItemListService"],
      sessionAuthService: approvedSessionAuth(auth), sessionHttpService });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const script = `const {handleSemanticQueryRequest}=await import(process.argv[1]);
        const headers=JSON.parse(process.argv[4]); const body=JSON.parse(process.argv[5]); const result=[];
        for(const extra of [{},{params:{...body.params,dimA:'ubp'}},{dataView:'ka_data'}]) {
          const req=new Request('http://localhost/api/internal/query',{method:'POST',headers:{...headers,'x-ka-workspace-id':'forged'},body:JSON.stringify({...body,...extra})});
          result.push(await handleSemanticQueryRequest(req,{environment:{KA_DATA_BACKEND_ORIGIN:process.argv[2],KA_DATA_SERVICE_TOKEN:process.argv[3]},requestId:()=> 'pivot-http'}));
        } process.stdout.write(JSON.stringify(result));`;
      const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script,
        new URL("../../web/lib/data/bff.ts", import.meta.url).href, url, token, JSON.stringify(businessHeaders(token)), JSON.stringify(request)],
      { timeout: 15000, maxBuffer: 1024 * 1024 });
      const results = JSON.parse(stdout);
      expect(results.map((r: { status: number }) => r.status)).toEqual([200, 422, 400]);
      expect(results[0]).toMatchObject({ requestId: "pivot-http", body: { ok: true, meta: { cellCoverage: { cells: 1, withData: 1, undeterminable: 0 } } } });
      expect(dataQueryResponseSchema.safeParse(results[0].body).success).toBe(true);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
  it("locks real Web and Domain envelope parity including malicious mutations", async () => {
    const base = await service({ read: async () => snapshot() }).execute(request, auth);
    if (!base.ok || base.data.mode === "reconcile") throw new Error("Expected source");
    const variants: unknown[] = [base, { ...base, meta: undefined }];
    for (const field of ["dimA", "dimB", "rowSchemaVersion", "rows"]) {
      const changed = structuredClone(base); delete (changed.data as { source: Record<string, unknown> }).source[field]; variants.push(changed);
    }
    variants.push({ ...base, meta: { cellCoverage: { cells: 1, withData: 2, undeterminable: 0 } } });
    for (const key of ["same", "TENCENT:same", "KUAISHOU:same"]) {
      const changed = structuredClone(base);
      if (changed.data.mode === "reconcile") throw new Error("Unexpected reconcile fixture");
      (changed.data.source.rows[0]!.a as { key: string }).key = key; variants.push(changed);
    }
    const expected = variants.map(value => dataQueryResponseSchema.safeParse(value).success);
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e",
      "const m=await import(process.argv[1]);process.stdout.write(JSON.stringify(JSON.parse(process.argv[2]).map(v=>m.dataQueryResponseSchema.safeParse(v).success)))",
      new URL("../../web/lib/data/contracts.ts", import.meta.url).href, JSON.stringify(variants)], { timeout: 10000 });
    expect(JSON.parse(stdout)).toEqual(expected);
  });
});
