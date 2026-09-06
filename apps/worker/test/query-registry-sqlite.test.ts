// Synthetic fixtures only; execute the actual registered SQL, no upstream access.
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { canonicalizeQueryRows, canonicalSummaryBaseRow, CanonicalQueryRowError } from "../src/data/canonical-query-rows.js";
import { KaDataClient } from "../src/data/ka-data-client.js";

describe("KA registered SQLite aggregates preserve missing members", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE dwd_account_daily (
      ds INTEGER, media TEXT, account_id TEXT, cost_yuan REAL, show REAL,
      click REAL, conv REAL, cash_yuan REAL, cash_assessment REAL
    )`);
  });
  afterEach(() => db.close());
  const accounts = [{ media: "KUAISHOU", accountId: "same" }];
  function insert(ds: number, cost: number | string | null, media = "KUAISHOU") {
    db.prepare("INSERT INTO dwd_account_daily VALUES (?, ?, 'same', ?, 10, 1, 1, 1, 10)")
      .run(ds, media, cost);
  }
  function run(queryId: "account.summary" | "account.trend" | "reconcile.account_daily", scope = accounts) {
    const registry = createDataQueryRegistry();
    const plan = registry.buildKaDataPlan(registry.resolve(queryId, {
      dateFrom: "2026-08-23", dateTo: "2026-08-24",
    }, queryId === "reconcile.account_daily" ? "reconcile" : "ka_data"), scope);
    return db.prepare(plan.sql).all();
  }

  it.each(["account.summary", "account.trend", "reconcile.account_daily"] as const)(
    "%s actual SQL returns BI real_conversion, never media conversion", (queryId) => {
      insert(20260823, 6); insert(20260824, 6);
      insert(20260823, 900, "TENCENT");
      const rows = run(queryId);
      for (const row of rows) {
        expect(row).not.toHaveProperty("conversion");
        expect(row).not.toHaveProperty("conversions");
        expect(row.real_conversion).toBe(queryId === "account.summary" ? 2 : 1);
      }
      const canonical = queryId === "account.summary" ? rows.map((row) => canonicalSummaryBaseRow(row, "ka_data")) : canonicalizeQueryRows(queryId, "ka_data", rows.map((row) => ({
        ...row, ...(row.ds === undefined ? {} : { ds: String(row.ds) }),
      })), "00000000-0000-4000-8000-000000000024");
      for (const row of canonical) {
        const metrics = row.metrics;
        expect(metrics).toMatchObject({
          conversion: { value: null, availability: "missing" },
          ratios: { realCpa: { value: 6, state: "finite" }, cashCpa: { value: 1, state: "finite" } },
        });
      }
    },
  );
  it.each(["account.summary", "account.trend", "reconcile.account_daily"] as const)(
    "%s maps actual SQLite JSON through the client without rewriting raw fields", async (queryId) => {
      insert(20260823, 6); insert(20260824, 6);
      const client = new KaDataClient({
        baseUrl: "https://synthetic.example.internal", token: "synthetic-token",
        teamWorkspaceId: "00000000-0000-4000-8000-000000000024",
        fetchFn: async (_url, init) => {
          const { sql } = JSON.parse(String(init?.body)) as { sql: string };
          const rows = db.prepare(sql).all();
          return new Response(JSON.stringify({ backend: "sqlite", rowCount: rows.length, rows }));
        },
      });
      const result = await client.query(createDataQueryRegistry().resolve(queryId, {
        dateFrom: "2026-08-23", dateTo: "2026-08-24", media: "KUAISHOU",
      }, queryId === "reconcile.account_daily" ? "reconcile" : "ka_data"), {
        workspaceId: "00000000-0000-4000-8000-000000000024", userId: "00000000-0000-4000-8000-000000000001",
        scopeKind: queryId === "reconcile.account_daily" ? "explicit_accounts" : "team_workspace_readonly", accounts,
      });
      for (const row of result.rows) {
        const metrics = row.metrics;
        expect(metrics).toMatchObject({
          realConversion: { value: queryId === "account.summary" ? 2 : 1, availability: "available" },
          conversion: { value: null, availability: "missing" },
          ratios: { realCpa: { value: 6, state: "finite" } },
        });
      }
    },
  );
  it("does not replace an absent account-day with a partial available sum", () => {
    insert(20260823, 10);
    expect(run("account.summary")).toMatchObject([{ cost: null, row_count: 1, account_count: 1 }]);
    expect(run("account.trend")).toMatchObject([
      { ds: "20260823", cost: 10, row_count: 1 },
      { ds: "20260824", cost: null, row_count: 0 },
    ]);
  });
  it("carries the real SQLite missing-day proof into client lineage and v3 metrics", async () => {
    insert(20260823, 10);
    const client = new KaDataClient({
      baseUrl: "https://synthetic.example.internal", token: "synthetic-token",
      teamWorkspaceId: "00000000-0000-4000-8000-000000000024",
      fetchFn: async (_url, init) => {
        const { sql } = JSON.parse(String(init?.body)) as { sql: string };
        const rows = db.prepare(sql).all();
        return new Response(JSON.stringify({ backend: "sqlite", rowCount: rows.length, rows }), {
          headers: { "content-type": "application/json" },
        });
      },
    });
    for (const queryId of ["account.summary", "account.trend"] as const) {
      const result = await client.query(createDataQueryRegistry().resolve(queryId, {
        dateFrom: "2026-08-23", dateTo: "2026-08-24", media: "KUAISHOU",
      }, "ka_data"), { workspaceId: "00000000-0000-4000-8000-000000000024",
        userId: "00000000-0000-4000-8000-000000000001", scopeKind: "team_workspace_readonly", accounts: [] });
      expect(result.lineage).toMatchObject({ truncated: false, partial: true, coverage: { complete: false } });
      expect(result.rowSchemaVersion).toBe(`${queryId}/v3`);
      if (queryId === "account.summary") expect(result.rows[0]).toMatchObject({
        metrics: { cost: { value: null, availability: "missing" } },
      });
    }
  });
  it("propagates a null member but preserves complete genuine zero", () => {
    insert(20260823, 0); insert(20260824, null);
    expect(run("account.summary")[0]?.cost).toBeNull();
    db.prepare("UPDATE dwd_account_daily SET cost_yuan = 0").run();
    expect(run("account.summary")[0]?.cost).toBe(0);
  });
  it("keeps same-ID media independent and empty authorization genuinely empty", () => {
    insert(20260823, 1); insert(20260824, 2);
    insert(20260823, 100, "TENCENT");
    expect(run("account.summary")[0]?.cost).toBe(3);
    expect(run("account.summary", [...accounts, { media: "TENCENT", accountId: "same" }])[0]?.cost).toBeNull();
    expect(run("account.summary", [])).toMatchObject([{ cost: null, row_count: 0, account_count: 0 }]);
    expect(run("account.trend", [])).toEqual([]);
  });
  it("includes all task members within an account-day and never sums a missing member", () => {
    insert(20260823, 1); insert(20260823, null); insert(20260824, 3);
    expect(run("reconcile.account_daily")[0]?.cost).toBeNull();
    expect(run("account.summary")[0]?.cost).toBeNull();
  });
  it.each(["not-a-number", "NaN", "Infinity"])("rejects SQLite coercion of %s, even next to null", (cost) => {
    insert(20260823, cost); insert(20260824, null);
    for (const queryId of ["account.summary", "account.trend", "reconcile.account_daily"] as const) {
      const rows = run(queryId).map((row) => ({ ...row, ...(row.ds === undefined ? {} : { ds: String(row.ds) }) }));
      if (queryId === "account.summary") expect(() => canonicalSummaryBaseRow(rows[0]!, "ka_data"))
        .toThrow(CanonicalQueryRowError);
      expect(() => canonicalizeQueryRows(queryId, "ka_data", rows, "fixture-workspace"))
        .toThrow(CanonicalQueryRowError);
    }
  });
  it.each([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MAX_VALUE])(
    "surfaces non-finite or overflowing sums instead of JSON null for %s", (cost) => {
      insert(20260823, cost); insert(20260824, cost);
      expect(() => canonicalSummaryBaseRow(run("account.summary")[0]!, "ka_data"))
        .toThrow(CanonicalQueryRowError);
      expect(() => canonicalizeQueryRows("account.summary", "ka_data", run("account.summary"), "fixture-workspace"))
        .toThrow(CanonicalQueryRowError);
      expect(run("account.summary")[0]?.cost).toBe("INVALID_METRIC");
    },
  );
});
