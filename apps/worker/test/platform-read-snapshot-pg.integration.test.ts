import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runMigrations, SemanticQueryRepository, WindowAssessmentRepository, withSemanticReadSnapshot } from "@ka/db";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { createPlatformWindowQuery, PlatformWindowQuery } from "../src/data/platform-window-query.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";

describe("Platform adapter production snapshot / synthetic real PG", () => {
  let pool: Pool;
  const workspaceId = randomUUID();
  const accountId = "synthetic-platform-snapshot";
  const execution = {
    workspaceId, userId: randomUUID(), scopeKind: "explicit_accounts" as const,
    accounts: [{ media: "KUAISHOU", accountId }],
  };
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl });
    pool = new Pool({ connectionString: databaseUrl, max: 3 });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic platform snapshot')", [workspaceId]);
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,'synthetic-snapshot-task','snapshot')", [workspaceId]);
    await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'synthetic-snapshot-task',20,'2026-09-01')", [workspaceId]);
    for (const media of ["KUAISHOU", "TENCENT"]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,$3)", [workspaceId, media, accountId]);
      await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,$2,$3,'synthetic-snapshot-task','2026-09-01')", [workspaceId, media, accountId]);
      await pool.query("INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,computed_at) VALUES($1,$2,$3,'2026-09-01',10,10,1,'2026-09-01T10:00:00Z')", [workspaceId, media, accountId]);
    }
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=$1`, [workspaceId]);
    }
    await pool.end();
  });
  it("diagnoses the legacy constructor failure before any snapshot query (F-P103-1)", async () => {
    const originalError = globalThis.Error;
    const captured: Error[] = [];
    // Test-only observation of the actual Error before the production safe envelope
    // catches it. Do not expose arbitrary source exceptions in production logs/responses.
    vi.stubGlobal("Error", new Proxy(originalError, {
      construct(target, args) {
        const error = Reflect.construct(target, args) as Error;
        if (error.message === "Window reader unavailable") captured.push(error);
        return error;
      },
    }));
    const legacySnapshot = vi.fn(async () => { throw new originalError("Legacy snapshot must not run"); });
    try {
      const source = new PlatformDataSource(new SemanticQueryRepository(pool), legacySnapshot);
      const resolved = createDataQueryRegistry().resolve("account.summary", { date: "2026-09-01" }, "platform");
      await source.query(resolved, execution);
      expect(captured).toHaveLength(1);
      expect(legacySnapshot).not.toHaveBeenCalled();
      console.info("F-P103-1 synthetic diagnostic:", captured[0]!.stack);
    } finally { vi.unstubAllGlobals(); }
  });
  it("a concurrent refresh after lineage cannot mix old timestamps with new metric values", async () => {
    const fallback = new SemanticQueryRepository(pool);
    let refreshCommitted = false;
    // v3 summary uses its dedicated window reader; keep the concurrent-refresh
    // assertion on that production path rather than exercising retired v2 injection.
    const window = new PlatformWindowQuery((read) => withSemanticReadSnapshot(pool, async (connection) => {
      const repository = new SemanticQueryRepository(connection);
      const assessment = new WindowAssessmentRepository(connection);
      return read({
        querySummary: repository.querySummary.bind(repository),
        loadAssessment: assessment.load.bind(assessment),
        loadAccountCounts: assessment.loadAccountCounts.bind(assessment),
        // 缺数点名（v1.9.33）：本桩不造缺口，恒回空表。
        loadMissingAccountDays: async () => [],
        queryLineage: async (scope) => {
          const result = await repository.queryLineage(scope);
          // Separate connection commits a new version while the request snapshot stays open.
          await pool.query("UPDATE account_metrics_daily SET cost=90,cash_cost=90,computed_at='2026-09-01T11:00:00Z' WHERE workspace_id=$1", [workspaceId]);
          refreshCommitted = true;
          return result;
        },
      });
    }));
    const source = new PlatformDataSource(fallback, undefined, window);
    const resolved = createDataQueryRegistry().resolve("account.summary", { date: "2026-09-01" }, "platform");
    const result = await source.query(resolved, execution);
    expect(refreshCommitted).toBe(true);
    expect(result).toMatchObject({
      status: "ready", lineage: { dataAsOf: "2026-09-01T10:00:00.000Z", coverage: { returnedObjects: 1 } },
      rowSchemaVersion: "account.summary/v3",
      rows: [{ accountCount: 1, metrics: { cashCost: { value: 10, availability: "available" } }, assessment: { onTarget: true, costStatus: "green" } }],
    });
    const next = new PlatformDataSource(fallback, undefined, createPlatformWindowQuery(pool));
    expect(await next.query(resolved, execution)).toMatchObject({
      status: "ready", lineage: { dataAsOf: "2026-09-01T11:00:00.000Z" },
      rows: [{ accountCount: 1, metrics: { cashCost: { value: 90, availability: "available" } }, assessment: { onTarget: false, costStatus: "red" } }],
    });
  });
});
