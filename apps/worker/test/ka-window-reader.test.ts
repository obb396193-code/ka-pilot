// Only synthetic fixtures and in-memory HTTP responses; no production source.
import { describe, expect, it, vi } from "vitest";
import { KaDataClient } from "../src/data/ka-data-client.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";

const workspaceId = "00000000-0000-4000-8000-000000000071";
const scope = { workspaceId, userId: "00000000-0000-4000-8000-000000000072", scopeKind: "team_workspace_readonly" as const, accounts: [] };
const window = { from: "2026-09-01", to: "2026-09-02" };
const registry = createDataQueryRegistry();
const resolved = registry.resolve("account.summary", { date_from: window.from, date_to: window.to, media: "KUAISHOU", accountIds: ["a"] }, "ka_data");
const member = (ds = "2026-09-01") => ({ ds, media: "KUAISHOU", account_id: "a", observed: 1,
  cost_yuan: 20, cash_yuan: 10, show: 100, click: 10, conv: 1, cash_assessment: 20 });
const complete = () => [member(), member("2026-09-02")];
function setup(rows: unknown[] = complete(), metadata: Record<string, unknown> = {}, maxResponseBytes?: number) {
  const body = { backend: "sqlite", rowCount: rows.length, rows, ...metadata };
  const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body)));
  const client = new KaDataClient({ baseUrl: "https://ka.test.invalid", token: "synthetic-reader", teamWorkspaceId: workspaceId, fetchFn,
    ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }) });
  return { client, fetchFn, body };
}
describe("registered bounded team window reader", () => {
  it("injects trusted workspace and does not claim inventory or source timestamps", async () => {
    const { client, fetchFn } = setup();
    const result = await client.queryTeamWindowMembers(resolved, scope, window);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.members).toHaveLength(2);
    expect(result.members[0]).toMatchObject({ workspaceId, media: "KUAISHOU", accountId: "a", ds: "2026-09-01" });
    expect(result.lineage).toMatchObject({ source: "ka_data", workspaceKind: "team", metadataAvailability: "unknown", dataAsOf: null,
      partial: true, truncated: false, coverage: { complete: false, returnedObjects: 1 } });
    expect(JSON.stringify(result)).not.toContain("synthetic-reader");
  });
  it.each([{}, { ...scope, workspaceId: "00000000-0000-4000-8000-000000000073" }, { ...scope, scopeKind: "explicit_accounts" }])("rejects unbound/personal contexts before fetch", async (auth) => {
    const { client, fetchFn } = setup();
    await expect(client.queryTeamWindowMembers(resolved, auth as never, window)).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN|SOURCE_UNAVAILABLE/) });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([
    [member()], [member(), member()],
    [{ ...member(), workspaceId: "untrusted" }, member("2026-09-02")],
    [{ ...member(), media: "TENCENT" }, member("2026-09-02")],
    [{ ...member(), account_id: "other" }, member("2026-09-02")],
    [{ ...member(), ds: "2026-02-31" }, member("2026-09-02")],
    [{ ...member(), cash_yuan: "invalid" }, member("2026-09-02")],
    [{ ...member(), cash_assessment: "invalid" }, member("2026-09-02")],
    [{ ...member(), observed: 0 }, member("2026-09-02")],
  ])("rejects corrupted or incomplete member grids %j", async (...rows) => {
    const { client } = setup(rows);
    await expect(client.queryTeamWindowMembers(resolved, scope, window)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it.each([{ truncated: true }, { limit_clamped: true }, { rowCount: 2000 }, { rowCount: 10000 }, { rowCount: 3 }])("fails closed on source truncation %j", async (metadata) => {
    const { client } = setup(complete(), metadata);
    await expect(client.queryTeamWindowMembers(resolved, scope, window)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
  it("rejects exact byte limit, not just one byte over", async () => {
    const { body } = setup();
    const { client } = setup(complete(), {}, Buffer.byteLength(JSON.stringify(body)));
    await expect(client.queryTeamWindowMembers(resolved, scope, window)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
  it("retains an explicit missing day and real metadata; empty source stays empty", async () => {
    const missing = { ...member("2026-09-02"), observed: 0, cost_yuan: null, cash_yuan: null, show: null, click: null, conv: null, cash_assessment: null };
    const { client } = setup([member(), missing], { dataAsOf: "2026-09-03T00:00:00Z", datasetVersion: "fixture", timezone: "Asia/Shanghai", dayCut: "03:00" });
    const result = await client.queryTeamWindowMembers(resolved, scope, window);
    expect(result.members[1]).toMatchObject({ observed: false, cashCost: { value: null, availability: "missing" } });
    expect(result.lineage.metadataAvailability).toBe("known");
    const empty = await setup([]).client.queryTeamWindowMembers(resolved, scope, window);
    expect(empty.members).toEqual([]); expect(empty.lineage.coverage.returnedObjects).toBe(0);
  });
  it("checks row length caps even when rowCount agrees", async () => {
    const { client } = setup(Array.from({ length: 10001 }, () => member()));
    await expect(client.queryTeamWindowMembers(resolved, scope, window)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
  it("rejects missing binding and invalid user before any network request", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const unbound = new KaDataClient({ baseUrl: "https://ka.test.invalid", token: "synthetic", fetchFn });
    await expect(unbound.queryTeamWindowMembers(resolved, scope, window)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    await expect(unbound.queryTeamWindowMembers(resolved, { ...scope, userId: "not-a-user" }, window)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("requires every member in both comparison windows and counts current objects only", async () => {
    const rows = [member("2026-08-31"), ...complete()];
    const { client, fetchFn } = setup(rows);
    const result = await client.queryTeamWindowMembers(resolved, scope, window, "dod");
    expect(result.members).toHaveLength(3);
    expect(result.previousWindow).toEqual({ from: "2026-08-31", to: "2026-09-01", preset: "custom" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await expect(setup().client.queryTeamWindowMembers(resolved, scope, window, "dod")).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it.each([
    ["redirect", 302, "SOURCE_UNAVAILABLE"], ["forbidden", 403, "FORBIDDEN"], ["server failure", 500, "SOURCE_UNAVAILABLE"],
  ])("sanitizes %s without exposing the upstream body", async (_label, status, code) => {
    const client = new KaDataClient({ baseUrl: "https://ka.test.invalid", token: "synthetic-reader", teamWorkspaceId: workspaceId,
      fetchFn: async () => new Response("sensitive-source-body", { status }) });
    await expect(client.queryTeamWindowMembers(resolved, scope, window)).rejects.toMatchObject({ code });
    await expect(client.queryTeamWindowMembers(resolved, scope, window)).rejects.not.toThrow("sensitive-source-body");
  });
  it("times out through the shared transport and rejects invalid metadata", async () => {
    const client = new KaDataClient({ baseUrl: "https://ka.test.invalid", token: "synthetic-reader", teamWorkspaceId: workspaceId, timeoutMs: 5,
      fetchFn: (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })) });
    await expect(client.queryTeamWindowMembers(resolved, scope, window)).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT" });
    await expect(setup(complete(), { dataAsOf: "invalid-date" }).client.queryTeamWindowMembers(resolved, scope, window)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
});
