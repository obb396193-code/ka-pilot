// Synthetic source responses only. Window v3 uses team member snapshots;
// daily v2 still serves the separately authorized diagnostic reader.
import { describe, expect, it, vi } from "vitest";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { KaDataClient, KaDataClientError, createKaDataClientFromEnv } from "../src/data/ka-data-client.js";

const workspaceId = "00000000-0000-4000-8000-000000000024";
const userId = "00000000-0000-4000-8000-000000000001";
const team = { workspaceId, userId, scopeKind: "team_workspace_readonly" as const, accounts: [] };
const personal = { workspaceId, userId, scopeKind: "explicit_accounts" as const,
  accounts: [{ media: "KUAISHOU", accountId: "a" }] };
const registry = createDataQueryRegistry();
const env = { KA_DATA_BASE_URL: "https://ka-data.example.internal", KA_DATA_READER_TOKEN: "server-only-token",
  KA_DATA_TEAM_WORKSPACE_ID: workspaceId };
const summary = () => registry.resolve("account.summary", { date: "2026-08-24", media: "KUAISHOU" }, "ka_data");
const table = () => registry.resolve("account.table", { date: "2026-08-24", page: 1, pageSize: 50 }, "ka_data");
const trend = () => registry.resolve("account.trend", { dateFrom: "2026-08-23", dateTo: "2026-08-24", media: "KUAISHOU" }, "ka_data");
function member(ds = "2026-08-24", account_id = "a", observed = true) {
  return { ds, account_id, media: "KUAISHOU", observed: observed ? 1 : 0,
    cost_yuan: observed ? 12 : null, cash_yuan: observed ? 12 : null, show: observed ? 100 : null,
    click: observed ? 10 : null, conv: observed ? 2 : null, cash_assessment: observed ? 10 : null };
}
function daily(accountId = "a", overrides: Record<string, unknown> = {}) {
  return { ds: "20260824", account_id: accountId, media: "KUAISHOU", cost_yuan: 12,
    cash_yuan: 12, show: 100, click: 10, conv: 2, ...overrides };
}
function envelope(rows: unknown[], metadata: Record<string, unknown> = {}) {
  return { backend: "sqlite", rowCount: rows.length, rows, ...metadata };
}
function setup(rows: unknown[] = [member()], metadata: Record<string, unknown> = {}) {
  const fetchFn = vi.fn<typeof fetch>(async () => Response.json(envelope(rows, metadata)));
  const client = new KaDataClient({ baseUrl: env.KA_DATA_BASE_URL, token: "fixture-secret-token",
    teamWorkspaceId: workspaceId, fetchFn });
  return { client, fetchFn };
}

describe("KaDataClient", () => {
  it("derives workspace kind from execution scope, not upstream metadata", async () => {
    const result = await setup([daily()], { workspaceKind: "team" }).client.query(table(), personal);
    expect(result.lineage).toMatchObject({ workspaceKind: "personal", metadataAvailability: "unknown" });
    const window = await setup([member()], { workspaceKind: "personal" }).client.query(summary(), team);
    expect(window.lineage.workspaceKind).toBe("team");
    expect(window.rows[0]).toMatchObject({ assessment: { priceSource: "ka_daily" } });
  });
  it.each([-1, 3, "2", 1.5])("rejects obsolete unproven aggregate account-day counts %s", async (account_day_count) => {
    await expect(setup([{ row_count: 1, account_count: 1, cost: 12, account_day_count }]).client.query(summary(), team))
      .rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it.each([
    ["2026-08-23"], ["2026-08-23", "2026-08-23"], ["2026-08-22", "2026-08-23"],
  ])("rejects incomplete, duplicate or out-of-window member dates %j", async (...dates) => {
    await expect(setup(dates.map((ds) => member(ds))).client.query(trend(), team))
      .rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("uses a fixed HTTPS origin/path and never serializes its token", async () => {
    const { client, fetchFn } = setup();
    const response = await client.query(summary(), team);
    const [input, init] = fetchFn.mock.calls[0]!;
    expect(String(input)).toBe("https://ka-data.example.internal/api/query");
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-secret-token");
    expect(JSON.stringify({ client, response })).not.toContain("fixture-secret-token");
  });
  it("creates the production reader only from server-side environment secrets", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json(envelope([])));
    const client = createKaDataClientFromEnv({ ...env, KA_DATA_DATASET_VERSION: "deployment-not-lineage" }, { fetchFn });
    const result = await client.query(summary(), team);
    expect(new Headers(fetchFn.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer server-only-token");
    expect(JSON.stringify({ client, result })).not.toContain("server-only-token");
    expect(result.lineage.datasetVersion).toBeNull();
  });
  it("does not invent dataset freshness metadata absent from the upstream response", async () => {
    expect((await setup().client.query(summary(), team)).lineage).toMatchObject({
      datasetVersion: null, dataAsOf: null, timezone: null, dayCut: null, metadataAvailability: "unknown",
    });
  });
  it("does not call an empty source complete when an explicitly selected account is missing", async () => {
    const result = await setup([]).client.query(registry.resolve("account.summary", {
      date: "2026-08-24", media: "KUAISHOU", accountIds: ["missing-account"],
    }, "ka_data"), team);
    expect(result.rows[0]).toMatchObject({ accountCount: 0, rowCount: 0 });
    expect(result.lineage).toMatchObject({ coverage: { complete: false, returnedObjects: 0 }, partial: true, truncated: false });
    expect(result.lineage.coverage.requestedObjects).toBeUndefined();
    expect(result.wholeResultTotal).toMatchObject({ value: null, availability: "partial" });
  });
  it("counts the proven cross-day union rather than the maximum daily count", async () => {
    const rows = [member("2026-08-23", "a"), member("2026-08-24", "a", false),
      member("2026-08-23", "b", false), member("2026-08-24", "b")];
    const result = await setup(rows).client.query(trend(), team);
    expect(result.lineage.coverage).toMatchObject({ complete: false, returnedObjects: 2 });
    expect(result.lineage.coverage.requestedObjects).toBeUndefined();
    expect(result.lineage).toMatchObject({ partial: true, truncated: false });
  });
  it("retains a missing expected account-day instead of presenting its partial sum as available", async () => {
    const result = await setup([member("2026-08-23"), member("2026-08-24", "a", false)]).client.query(trend(), team);
    expect(result.rows).toMatchObject([
      { ds: "2026-08-23", metrics: { cost: { value: 12, availability: "available" } } },
      { ds: "2026-08-24", metrics: { cost: { value: null, availability: "missing" } } },
    ]);
    expect(result.lineage).toMatchObject({ partial: true, truncated: false, coverage: { complete: false } });
    expect(result.wholeResultTotal.availability).toBe("partial");
  });
  it("refuses public KA window queries from a personal context before source access", async () => {
    const { client, fetchFn } = setup();
    await expect(client.query(summary(), personal)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("fails closed when daily output claims more objects than the approved diagnostic scope", async () => {
    await expect(setup([daily("a"), daily("b")]).client.query(table(), personal))
      .rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("does not use deployment timezone or day-cut fallbacks as source lineage", async () => {
    const client = createKaDataClientFromEnv({ ...env, KA_DATA_TIMEZONE: "Asia/Shanghai", KA_DATA_DAY_CUT: "calendar_day" }, {
      fetchFn: async () => Response.json(envelope([member()])),
    });
    expect((await client.query(summary(), team)).lineage).toMatchObject({ timezone: null, dayCut: null });
  });
  it("rejects access modes other than the frozen shared reader mode", () => {
    expect(() => createKaDataClientFromEnv({ ...env, KA_DATA_ACCESS_MODE: "editor" })).toThrow(/access_mode/i);
  });
  it.each(["http://ka-data.example.internal", "https://user:pass@ka-data.example.internal", "https://ka-data.example.internal/not-the-origin"])(
    "rejects an unsafe base URL: %s", (baseUrl) => {
      expect(() => new KaDataClient({ baseUrl, token: "fixture-token" })).toThrow(/base URL/i);
    },
  );
  it("rejects redirects without following them", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 302, headers: { location: "https://attacker.example/query" } }));
    const client = createKaDataClientFromEnv(env, { fetchFn });
    await expect(client.query(summary(), team)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(fetchFn.mock.calls[0]?.[1]?.redirect).toBe("manual");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it.each([2_000, 10_000])("rejects an exact %i-row window boundary before assessment", async (rowCount) => {
    const rows = Array.from({ length: rowCount }, (_, index) => member("2026-08-24", `a-${index}`));
    await expect(setup(rows).client.query(summary(), team)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
  it.each([2_000, 10_000])("keeps the daily %i-row truncation masking guard", async (rowCount) => {
    const result = await setup(Array.from({ length: rowCount }, () => daily())).client.query(table(), personal);
    expect(result.lineage).toMatchObject({ partial: true, truncated: true });
    expect(result.rows[0]).toMatchObject({ metrics: { cost: { value: null, availability: "error" }, ratios: { ctr: { value: null, state: "undefined" } } } });
    expect(result.wholeResultTotal).toMatchObject({ value: null, availability: "partial" });
  });
  it("rejects exact window response bytes and preserves exact daily byte masking", async () => {
    for (const window of [true, false]) {
      const body = JSON.stringify(envelope([window ? member() : daily()]));
      const client = new KaDataClient({ baseUrl: env.KA_DATA_BASE_URL, token: "synthetic", teamWorkspaceId: workspaceId,
        maxResponseBytes: Buffer.byteLength(body), fetchFn: async () => new Response(body) });
      if (window) await expect(client.query(summary(), team)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
      else {
        const result = await client.query(table(), personal);
        expect(result.lineage.truncated).toBe(true);
        expect(result.warnings.join(" ")).toMatch(/byte/i);
        expect(result.rows[0]).toMatchObject({ metrics: { cost: { value: null, availability: "error" } } });
      }
    }
  });
  it.each([[200, "UPSTREAM_INVALID_RESPONSE"], [500, "SOURCE_UNAVAILABLE"]] as const)(
    "sanitizes non-JSON/upstream error HTTP %i", async (status, code) => {
      const secretBody = "upstream leaked internal details";
      const client = createKaDataClientFromEnv(env, { fetchFn: async () => new Response(secretBody, { status }) });
      let thrown: unknown;
      try { await client.query(summary(), team); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(KaDataClientError);
      expect(thrown).toMatchObject({ code });
      expect(String(thrown)).not.toContain(secretBody);
    },
  );
  it("does not claim a whole total for paginated account.table responses", async () => {
    const result = await setup([daily()]).client.query(table(), personal);
    expect(result.wholeResultTotal).toMatchObject({ value: null, availability: "missing" });
    expect(result.lineage.coverage.returnedObjects).toBe(1);
  });
  it("injects the authenticated workspace into account rows and overwrites upstream claims", async () => {
    const result = await setup([daily("a", { workspace_id: "upstream-forged-workspace" })]).client.query(table(), personal);
    expect(result.rows[0]).toMatchObject({ workspaceId, media: "KUAISHOU", accountId: "a" });
    expect(result.rows[0]).not.toHaveProperty("workspace_id");
    expect(JSON.stringify(result)).not.toContain("upstream-forged-workspace");
  });
  it("times out with a stable retryable error", async () => {
    const client = new KaDataClient({ baseUrl: env.KA_DATA_BASE_URL, token: "synthetic", teamWorkspaceId: workspaceId, timeoutMs: 5,
      fetchFn: async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }) });
    await expect(client.query(summary(), team)).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT", retryable: true });
  });
});
