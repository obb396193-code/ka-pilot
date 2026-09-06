import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createKaDataClientFromEnv } from "../src/data/ka-data-client.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { createDataQueryHttpHandler, DataQueryService } from "../src/data/query-service.js";

const workspaceId = "00000000-0000-4000-8000-000000000024";
const scope = { workspaceId, userId: "00000000-0000-4000-8000-000000000001", scopeKind: "team_workspace_readonly" as const, accounts: [] };
const registry = createDataQueryRegistry();
const env = { KA_DATA_BASE_URL: "https://synthetic.example", KA_DATA_READER_TOKEN: "synthetic-token", KA_DATA_TEAM_WORKSPACE_ID: workspaceId };
const params = { dateFrom: "2026-08-23", dateTo: "2026-08-24", media: "KUAISHOU" };

describe("server-bound team reader", () => {
  it.each([undefined, "not-a-uuid", "00000000-0000-4000-8000-000000000099"])("rejects binding %s without network", async (binding) => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = createKaDataClientFromEnv({ ...env, KA_DATA_TEAM_WORKSPACE_ID: binding }, { fetchFn });
    await expect(client.query(registry.resolve("account.summary", params, "ka_data"), scope))
      .rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("executes fixed team SQL without grants, preserving missing days and media isolation", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE dwd_account_daily (ds INTEGER, media TEXT, account_id TEXT, account_name TEXT,
      task_id TEXT, biz_name TEXT, sub_biz TEXT, cost_yuan REAL, cash_yuan REAL,
      assessment REAL, cash_assessment REAL, conv REAL, show REAL, click REAL);
      INSERT INTO dwd_account_daily VALUES
      (20260823,'KUAISHOU','same','Synthetic',NULL,NULL,NULL,3,2,1,1,1,10,2),
      (20260824,'KUAISHOU','same','Synthetic',NULL,NULL,NULL,4,3,1,1,1,10,2),
      (20260823,'TENCENT','same','Other media',NULL,NULL,NULL,1000,1000,1,1,1,10,2),
      (20260823,'KUAISHOU','missing-day','Synthetic',NULL,NULL,NULL,5,4,1,1,1,10,2)`);
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      const input = JSON.parse(String(init?.body));
      expect(input.backend).toBe("sqlite");
      expect(input.sql).not.toContain("malicious-grant");
      const rows = db.prepare(input.sql).all();
      return Response.json({ backend: "sqlite", rows, rowCount: rows.length });
    });
    try {
      const client = createKaDataClientFromEnv(env, { fetchFn });
      const hostileGrants = { ...scope, accounts: [{ media: "INVALID'", accountId: "malicious-grant" }] };
      const summary = await client.query(registry.resolve("account.summary", params, "ka_data"), hostileGrants);
      expect(summary.rows[0]).toMatchObject({ accountCount: 2, metrics: { cost: { value: null, availability: "missing" } } });
      expect(summary.lineage).toMatchObject({ workspaceKind: "team", metadataAvailability: "unknown", partial: true, truncated: false, coverage: { complete: false, returnedObjects: 2 } });
      expect(summary.lineage.coverage.requestedObjects).toBeUndefined();
      expect(summary.rowSchemaVersion).toBe("account.summary/v3");
      expect(summary.lineage.queryTemplateVersion).toBe("account-summary-window-members-v1");
      const filtered = { ...params, accountIds: ["same"] };
      const one = await client.query(registry.resolve("account.summary", filtered, "ka_data"), scope);
      expect(one.rows[0]).toMatchObject({ accountCount: 1, metrics: { cost: { value: 7, availability: "available" } } });
      const table = await client.query(registry.resolve("account.table", filtered, "ka_data"), scope);
      expect(table.rows).toHaveLength(2);
      expect(table.rows.every((row) => row.workspaceId === workspaceId && row.media === "KUAISHOU" && row.accountId === "same")).toBe(true);
      const detail = await client.query(registry.resolve("account.detail", { ...params, accountId: "same" }, "ka_data"), scope);
      expect(detail.rows).toHaveLength(2);
      const trend = await client.query(registry.resolve("account.trend", params, "ka_data"), scope);
      expect(trend.rows).toHaveLength(2);
      // The v3 reader sees account-day identities, so it can prove this union.
      expect(trend.lineage.coverage.returnedObjects).toBe(2);
      expect(trend.lineage.coverage.complete).toBe(false);
      expect(JSON.stringify(client)).not.toContain(env.KA_DATA_READER_TOKEN);
    } finally { db.close(); }
  });

  it("does not send browser SQL or unvalidated account selectors", () => {
    for (const input of [{ ...params, accountIds: ["x' OR 1=1"] }, { ...params, sql: "SELECT 1" }, { ...params, workspaceId }]) {
      expect(() => registry.resolve("account.summary", input, "ka_data")).toThrow();
    }
  });

  it("team window transport truncation fails before calculating any partial assessment", async () => {
    const client = createKaDataClientFromEnv(env, { fetchFn: async () => Response.json({ backend: "sqlite", rowCount: 1,
      rows: [{ row_count: 1, account_count: 1, cost: 7 }], truncated: true }) });
    await expect(client.query(registry.resolve("account.summary", params, "ka_data"), scope))
      .rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });

  it.each([
    { media: "TENCENT", account_id: "same", ds: "20260824" },
    { media: "KUAISHOU", account_id: "other", ds: "20260824" },
    { media: "KUAISHOU", account_id: "same", ds: "20260825" },
  ])("rejects source rows outside requested business filters: %j", async (row) => {
    const client = createKaDataClientFromEnv(env, { fetchFn: async () => Response.json({ backend: "sqlite", rowCount: 1, rows: [row] }) });
    await expect(client.query(registry.resolve("account.table", { ...params, accountIds: ["same"] }, "ka_data"), scope))
      .rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });

  it("rejects duplicate team trend dates rather than claiming two days", async () => {
    const row = { ds: "2026-08-24", media: "KUAISHOU", account_id: "same", observed: 1,
      cost_yuan: 1, cash_yuan: 1, conv: 1, show: 10, click: 1, cash_assessment: 1 };
    const client = createKaDataClientFromEnv(env, { fetchFn: async () => Response.json({ backend: "sqlite", rowCount: 2, rows: [row, row] }) });
    await expect(client.query(registry.resolve("account.trend", params, "ka_data"), scope)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });

  it("keeps unknown team inventory incomplete even when source rows are empty", async () => {
    const client = createKaDataClientFromEnv(env, { fetchFn: async () => Response.json({ backend: "sqlite", rowCount: 0, rows: [] }) });
    const result = await client.query(registry.resolve("account.table", params, "ka_data"), scope);
    expect(result.lineage.coverage).toMatchObject({ complete: false, returnedObjects: 0 });
    expect(result.lineage.coverage.requestedObjects).toBeUndefined();
    expect(result.wholeResultTotal.value).toBeNull();
  });

  it("rejects an unexpected query backend instead of pretending it used SQLite", async () => {
    const client = createKaDataClientFromEnv(env, { fetchFn: async () => Response.json({ backend: "holo", rowCount: 0, rows: [] }) });
    await expect(client.query(registry.resolve("account.summary", params, "ka_data"), scope)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });

  it("real client + service + HTTP handler bind the approved team and never fall back", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ backend: "sqlite", rowCount: 2,
      rows: ["2026-08-23", "2026-08-24"].map((ds) => ({ ds, media: "KUAISHOU", account_id: "same",
        observed: 1, cost_yuan: 9, cash_yuan: 9, conv: 1, show: 10, click: 1, cash_assessment: 10 })) }));
    const platform = { query: vi.fn() };
    const handler = createDataQueryHttpHandler(new DataQueryService({
      registry, kaData: createKaDataClientFromEnv(env, { fetchFn }), platform,
      sourcePolicy: { kaDataEnabled: true, diagnosticEnabled: false, entitlements: [] },
    }));
    const auth = { workspaceId, userId: "00000000-0000-4000-8000-000000000001", role: "operator" as const,
      workspaceKind: "team" as const, scope: { kind: "team_workspace_readonly" as const } };
    const input = { method: "POST", body: { queryId: "account.summary", params }, auth, requestId: "team-bound-http" };
    const approved = await handler(input);
    expect(approved.status).toBe(200);
    expect(approved.body).toMatchObject({ ok: true, data: { mode: "ka_data", source: { lineage: { workspaceKind: "team" } } } });
    const denied = await handler({ ...input, auth: { ...auth, workspaceId: "00000000-0000-4000-8000-000000000099" } });
    expect(denied.status).toBe(503);
    expect(denied.body).toMatchObject({ ok: false, error: { code: "SOURCE_UNAVAILABLE", requestId: "team-bound-http" } });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(platform.query).not.toHaveBeenCalled();
  });
});
