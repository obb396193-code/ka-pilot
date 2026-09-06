import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, SemanticQueryRepository, withSemanticReadSnapshot } from "@ka/db";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
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
    for (const media of ["KUAISHOU", "TENCENT"]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,$3)", [workspaceId, media, accountId]);
      await pool.query("INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,computed_at) VALUES($1,$2,$3,'2026-09-01',10,10,1,'2026-09-01T10:00:00Z')", [workspaceId, media, accountId]);
    }
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "accounts", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=$1`, [workspaceId]);
    }
    await pool.end();
  });
  it("a concurrent refresh after lineage cannot mix old timestamps with new metric values", async () => {
    const fallback = new SemanticQueryRepository(pool);
    const source = new PlatformDataSource(fallback, (read) => withSemanticReadSnapshot(pool, async (connection) => {
      const repository = new SemanticQueryRepository(connection);
      return read({
        querySummary: repository.querySummary.bind(repository),
        queryTrend: repository.queryTrend.bind(repository),
        queryTable: repository.queryTable.bind(repository),
        queryLineage: async (scope) => {
          const result = await repository.queryLineage(scope);
          // Separate connection commits a new version while the request snapshot stays open.
          await pool.query("UPDATE account_metrics_daily SET cost=90,cash_cost=90,computed_at='2026-09-01T11:00:00Z' WHERE workspace_id=$1", [workspaceId]);
          return result;
        },
      });
    }));
    const resolved = createDataQueryRegistry().resolve("account.summary", { date: "2026-09-01" }, "platform");
    const result = await source.query(resolved, execution);
    expect(result).toMatchObject({
      status: "ready", lineage: { dataAsOf: "2026-09-01T10:00:00.000Z", coverage: { returnedObjects: 1 } },
      rows: [{ accountCount: 1, metrics: { cashCost: { value: 10, availability: "available" } } }],
    });
    const next = new PlatformDataSource(fallback, (read) => withSemanticReadSnapshot(pool, (connection) => read(new SemanticQueryRepository(connection))));
    expect(await next.query(resolved, execution)).toMatchObject({
      status: "ready", lineage: { dataAsOf: "2026-09-01T11:00:00.000Z" },
      rows: [{ accountCount: 1, metrics: { cashCost: { value: 90, availability: "available" } } }],
    });
  });
});
