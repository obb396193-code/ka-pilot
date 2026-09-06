import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { SemanticQueryRepository } from "../src/semantic-query-repository.js";
import { WindowAssessmentRepository } from "../src/window-assessment-repository.js";
import { withSemanticReadSnapshot } from "../src/semantic-read-snapshot.js";

describe("semantic query/price/lineage shared snapshot / real PG", () => {
  let pool: Pool;
  const workspaceId = randomUUID();
  const scope = { workspaceId, dateFrom: "2026-09-01", dateTo: "2026-09-01", filters: { accountScopes: [{ media: "KUAISHOU", accountId: "synthetic-snapshot" }] } };
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl, max: 4 });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic snapshot')", [workspaceId]);
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,'synthetic-task','synthetic task')", [workspaceId]);
    await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'synthetic-task',20,'2026-09-01')", [workspaceId]);
    for (const media of ["KUAISHOU", "TENCENT"]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'synthetic-snapshot')", [workspaceId, media]);
      await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,$2,'synthetic-snapshot','synthetic-task','2026-09-01')", [workspaceId, media]);
      await pool.query("INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,computed_at) VALUES($1,$2,'synthetic-snapshot','2026-09-01',10,10,1,'2026-09-01T10:00:00Z')", [workspaceId, media]);
    }
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=$1`, [workspaceId]);
    await pool.end();
  });
  it("concurrent committed refresh cannot split summary, price, trend and lineage versions", async () => {
    await withSemanticReadSnapshot(pool, async (connection) => {
      const semantic = new SemanticQueryRepository(connection), assessment = new WindowAssessmentRepository(connection);
      expect((await semantic.querySummary(scope)).cashCost).toBe(10);
      await pool.query("UPDATE account_metrics_daily SET cost=90,cash_cost=90,computed_at='2026-09-01T11:00:00Z' WHERE workspace_id=$1", [workspaceId]);
      await pool.query("UPDATE assessment_price_history SET price=30 WHERE workspace_id=$1", [workspaceId]);
      expect((await semantic.querySummary(scope)).cashCost).toBe(10);
      expect((await semantic.queryTrend(scope))[0]?.metrics.cashCost).toBe(10);
      expect((await assessment.load(scope))[0]?.price?.value).toBe(20);
      expect((await semantic.queryLineage(scope)).dataAsOf).toBe("2026-09-01T10:00:00.000Z");
      expect((await semantic.queryTable(scope)).total).toBe(1);
    });
    expect((await new SemanticQueryRepository(pool).querySummary(scope)).cashCost).toBe(90);
    expect((await new WindowAssessmentRepository(pool).load(scope))[0]?.price?.value).toBe(30);
  });
  it("the database refuses writes in this read transaction and releases the connection", async () => {
    await expect(withSemanticReadSnapshot(pool, async (connection) => {
      await connection.query("UPDATE workspaces SET name='must-not-write' WHERE id=$1", [workspaceId]);
    })).rejects.toMatchObject({ code: "25006" });
    expect((await pool.query("SELECT name FROM workspaces WHERE id=$1", [workspaceId])).rows[0]?.name).toBe("synthetic snapshot");
  });
});
