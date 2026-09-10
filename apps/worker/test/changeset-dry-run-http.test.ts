import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { ChangeSetRecord } from "@ka/db";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { ChangeSetDryRunService } from "../src/changesets/dry-run-service.js";
import type { ChangeSetPreflightPort } from "../src/changesets/dry-run-service.js";
import { approvedSessionAuth, businessHeaders, teamAuth } from "./business-auth-fixtures.js";

// Actual HTTP shell and service; synthetic session/store, never media execution.
const ws = "00000000-0000-4000-8000-000000000024", user = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000301", token = "synthetic-internal-token-longer-than-thirty-two";
const at = new Date("2026-09-08T00:00:00Z"), path = `/api/v1/changesets/${id}/dry-run`;
const auth: ApprovedWorkspaceAuthContext = { workspaceId: ws, userId: user, role: "optimizer", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "a1", accessLevel: "preview" }] } };
const draft: ChangeSetRecord = { id, workspaceId: ws, media: "KUAISHOU", accountId: "a1", workItemId: null,
  title: null, status: "draft", initiator: user, credentialOwnerUserId: user, executorIdentity: null,
  multicaIssueId: null, ttlExpireAt: new Date(at.getTime() + 60_000), reasonCode: "synthetic", simulation: null,
  createdAt: at, executedAt: null, items: [{ id: 1, targetType: "unit", targetId: "u1", field: "bid",
    fromValue: { type: "number", value: 30 }, toValue: { type: "number", value: 29 }, itemStatus: "pending", failReason: null }] };

describe("D6 source-off real HTTP composition", () => {
  const servers: Server[] = [];
  afterEach(async () => { for (const server of servers.splice(0)) { server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); } });
  async function setup(context: ApprovedWorkspaceAuthContext = auth, maxResponseBytes = 16 * 1024 * 1024, preflight?: ChangeSetPreflightPort) {
    const store = { find: vi.fn(async (): Promise<ChangeSetRecord | null> => structuredClone(draft)),
      prepareDryRun: vi.fn(), recordDryRun: vi.fn() };
    store.prepareDryRun.mockResolvedValue({ changeset: structuredClone(draft), hash: "a".repeat(64) });
    store.recordDryRun.mockResolvedValue({ executionRunId: id, status: "success", hash: "a".repeat(64) });
    const dryRunService = new ChangeSetDryRunService({ store, now: () => at, ...(preflight ? { preflight } : {}), timeoutMs: 20 });
    // Unrelated route services throw if used; this test never substitutes auth headers for session resolution.
    const absent = new Proxy({}, { get() { throw new Error("Unexpected unrelated service"); } });
    const options = { service: absent, detailService: absent, taskListService: absent, accountListService: absent,
      workItemListService: absent, dryRunService, internalToken: token, sessionAuthService: approvedSessionAuth(context),
      maxRequestBytes: 128, maxResponseBytes } as unknown as DataApiServerOptions;
    const server = createDataApiServer(options);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); servers.push(server);
    const address = server.address(); if (address === null || typeof address === "string") throw new Error("Missing listener");
    const port = address.port;
    async function call(overrides: { method?: string; path?: string; headers?: Record<string, string>; raw?: string } = {}) {
      const method = overrides.method ?? "POST";
      const response = await fetch(`http://127.0.0.1:${port}${overrides.path ?? path}`, { method,
        headers: overrides.headers ?? { ...businessHeaders(token), "content-type": "application/json", "x-request-id": "d6-request",
          "x-ka-account-scope": "*", "x-ka-workspace-id": "foreign" },
        ...(method === "GET" ? {} : { body: overrides.raw ?? "{}" }) });
      return { response, body: await response.json() };
    }
    return { call, store, dryRunService };
  }
  it("returns the frozen unavailable fixture after valid draft checks without preparing/writing", async () => {
    const c = await setup(), { response, body } = await c.call();
    const fixture = JSON.parse(readFileSync(new URL("../../../packages/contract/fixtures/changesets/dry-run-source-unavailable.json", import.meta.url), "utf8"));
    fixture.error.requestId = "d6-request";
    expect(response.status).toBe(503); expect(body).toEqual(fixture);
    expect(response.headers.get("x-request-id")).toBe("d6-request");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(c.store.find).toHaveBeenCalledWith(ws, id, auth);
    expect(c.store.prepareDryRun).not.toHaveBeenCalled(); expect(c.store.recordDryRun).not.toHaveBeenCalled();
  });
  it.each([{}, { authorization: `Bearer ${token}` }, { cookie: businessHeaders(token).cookie! }])("requires both credentials", async headers => {
    const c = await setup(), r = await c.call({ headers }); expect(r.response.status).toBe(401); expect(c.store.find).not.toHaveBeenCalled();
  });
  it("denies team before store", async () => {
    const c = await setup(teamAuth({ workspaceId: ws, userId: user })), r = await c.call();
    expect(r.response.status).toBe(403); expect(c.store.find).not.toHaveBeenCalled();
  });
  it.each(["GET", "PATCH", "DELETE"])("rejects method %s", async method => {
    const c = await setup(), r = await c.call({ method }); expect(r.response.status).toBe(405);
    expect(r.response.headers.get("allow")).toBe("POST"); expect(c.store.find).not.toHaveBeenCalled();
  });
  it.each([{ raw: "{" }, { raw: '{"scope":"*"}' }, { raw: "[]" }, { path: path + "?workspaceId=foreign" },
    { path: "/api/v1/changesets/not-uuid/dry-run" }, { path: "/api/v1/changesets/%ZZ/dry-run" }])("rejects malformed input", async input => {
    const c = await setup(), r = await c.call(input); expect(r.response.status).toBe(400); expect(c.store.find).not.toHaveBeenCalled();
  });
  it("returns a real 413 without destroying socket", async () => {
    const c = await setup(), r = await c.call({ raw: JSON.stringify({ text: "合成".repeat(100) }) });
    expect(r.response.status).toBe(413); expect(c.store.find).not.toHaveBeenCalled();
  });
  it.each(["missing", "other-media", "other-workspace", "expired", "error"])("maps %s safely before source", async kind => {
    const c = await setup(), data = structuredClone(draft);
    if (kind === "missing") c.store.find.mockResolvedValue(null);
    else if (kind === "error") c.store.find.mockRejectedValue(new Error("secret-sql-upstream"));
    else { if (kind === "other-media") data.media = "TENCENT"; if (kind === "other-workspace") data.workspaceId = id;
      if (kind === "expired") data.ttlExpireAt = at; c.store.find.mockResolvedValue(data); }
    const r = await c.call(); expect(r.response.status).toBe(({ missing: 404, "other-media": 403, "other-workspace": 403, expired: 409, error: 500 })[kind]);
    expect(JSON.stringify(r.body)).not.toContain("secret-sql-upstream"); expect(c.store.recordDryRun).not.toHaveBeenCalled();
  });
  it("never opens confirm/execute/retry/rollback", async () => {
    const c = await setup(); for (const action of ["confirm", "execute", "retry", "rollback"]) {
      expect((await c.call({ path: `/api/v1/changesets/${id}/${action}` })).response.status).toBe(404);
    } expect(c.store.find).not.toHaveBeenCalled();
  });
  it("does not expose an old abbreviated record as a public success", async () => {
    const c = await setup(); vi.spyOn(c.dryRunService, "preview").mockResolvedValue({ executionRunId: id, status: "success", hash: "a".repeat(64) } as never);
    const r = await c.call(); expect(r.response.status).toBe(502); expect(r.body.error.code).toBe("UPSTREAM_INVALID_RESPONSE");
  });
  function presentation() {
    const fixture = JSON.parse(readFileSync(new URL("../../../packages/contract/fixtures/changesets/dry-run-ok.json", import.meta.url), "utf8"));
    delete fixture.meta._note; fixture.meta.requestId = "d6-request";
    return fixture;
  }
  it("exposes the canonical three-value fixture with requestId and real lineage", async () => {
    const c = await setup(), fixture = presentation();
    vi.spyOn(c.dryRunService, "preview").mockResolvedValue({ data: fixture.data, dataAsOf: fixture.meta.dataAsOf });
    const r = await c.call(); expect(r.response.status).toBe(200); expect(r.body).toEqual(fixture);
    expect(r.response.headers.get("cache-control")).toBe("no-store");
    expect(r.response.headers.get("x-request-id")).toBe("d6-request");
    expect(c.dryRunService.preview).toHaveBeenCalledWith(id, auth);
  });
  it("calls observed service, stores evidence, keeps unknown lineage and preview-only confirmation blocked", async () => {
    const check = vi.fn(async (input: Parameters<ChangeSetPreflightPort["check"]>[0]) => ({
      workspaceId: input.workspaceId, media: input.media, accountId: input.accountId,
      credentialOwnerUserId: input.credentialOwnerUserId, draftHash: input.draftHash, dataAsOf: null,
      items: input.items.map(item => ({ itemId: item.id, status: "success", failReason: null, observed: item.fromValue })),
    }));
    const c = await setup(auth, undefined, { check }), r = await c.call();
    expect(r.response.status).toBe(200); expect(r.body.meta.dataAsOf).toBeNull();
    expect(r.body.data.confirmAllowed).toBe(false); expect(r.body.data.items[0].verdict).toBe("ok");
    expect(r.body.data.items[0].observed).toEqual(draft.items[0]!.fromValue);
    expect(check.mock.calls[0]![0].requireObservedValues).toBe(true);
    expect(c.store.recordDryRun.mock.calls[0]![0].observations.items).toEqual(r.body.data.items);
  });
  it.each(["id", "summary", "observed", "lineage", "extra", "date"])("rejects malformed service %s rather than exposing success", async kind => {
    const c = await setup(), fixture = presentation();
    const value = { data: fixture.data, dataAsOf: fixture.meta.dataAsOf };
    if (kind === "id") value.data.changesetId = user;
    if (kind === "summary") value.data.summary.total = 99;
    if (kind === "observed") delete value.data.items[0].observed;
    if (kind === "lineage") value.dataAsOf = "2027-01-01T00:00:00Z";
    if (kind === "extra") Object.assign(value, { token: "synthetic-private" });
    if (kind === "date") value.data.checkedAt = "not-a-date";
    vi.spyOn(c.dryRunService, "preview").mockResolvedValue(value);
    const r = await c.call(); expect(r.response.status).toBe(502); expect(r.body.error.code).toBe("UPSTREAM_INVALID_RESPONSE");
    expect(JSON.stringify(r.body)).not.toContain("synthetic-private");
  });
  it("rejects an exact-limit successful envelope without partially sending it", async () => {
    const fixture = presentation(), c = await setup(auth, Buffer.byteLength(JSON.stringify(fixture)));
    vi.spyOn(c.dryRunService, "preview").mockResolvedValue({ data: fixture.data, dataAsOf: fixture.meta.dataAsOf });
    const r = await c.call(); expect(r.response.status).toBe(502); expect(r.body.error.code).toBe("SOURCE_TRUNCATED");
    expect(r.body).not.toHaveProperty("data");
  });
  it("maps provider timeout to stable 504", async () => {
    const c = await setup(auth, undefined, { check: async () => new Promise(() => undefined) });
    const r = await c.call(); expect(r.response.status).toBe(504); expect(r.body.error.code).toBe("UPSTREAM_TIMEOUT");
    expect(c.store.recordDryRun).not.toHaveBeenCalled();
  });
  it("fails closed when even the response reaches the configured exact limit", async () => {
    const first = await setup(), baseline = await first.call();
    const second = await setup(auth, Buffer.byteLength(JSON.stringify(baseline.body)));
    const r = await second.call(); expect(r.response.status).toBe(502); expect(r.body.error.code).toBe("SOURCE_TRUNCATED");
  });
});
