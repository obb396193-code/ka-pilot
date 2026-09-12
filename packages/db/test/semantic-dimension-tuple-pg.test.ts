import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { SemanticQueryRepository } from "../src/semantic-query-repository.js";

// Synthetic objects only; opt in with an explicit isolated TEST_DATABASE_URL.
describe("dimension tuple SQL / real PostgreSQL", () => {
  let pool: Pool;
  let repository: SemanticQueryRepository;
  const workspaceId = randomUUID(), foreignWorkspaceId = randomUUID();
  const scope = { workspaceId, dateFrom: "2026-08-01", dateTo: "2026-08-02", dimension: "account" as const };
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl });
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
    repository = new SemanticQueryRepository(pool);
    for (const ws of [workspaceId, foreignWorkspaceId]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic dimension')", [ws]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'task','synthetic task','synthetic biz')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,$2,'same','same name')", [ws, media]);
        await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,$2,'same','task','2026-08-01')", [ws, media]);
        const cost = ws === foreignWorkspaceId ? 999 : media === "KUAISHOU" ? 10 : 20;
        await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion)
          SELECT $1,$2,'same',day,$3,$3,1 FROM generate_series('2026-08-01'::date,'2026-08-02'::date,'1 day') day`, [ws, media, cost]);
      }
    }
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "task_accounts", "accounts", "tasks", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, foreignWorkspaceId]]);
    }
    await pool.end();
  });
  it("does not merge same name and ID across media or read another workspace", async () => {
    const rows = await repository.queryDimension(scope);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.accountIdentity, r.metrics.cost])).toEqual([
      [{ workspaceId, media: "TENCENT", accountId: "same" }, 40],
      [{ workspaceId, media: "KUAISHOU", accountId: "same" }, 20],
    ]);
    const foreign = await repository.queryDimension({ ...scope, workspaceId: foreignWorkspaceId });
    expect(foreign.map((r) => r.accountIdentity?.media)).toEqual(["KUAISHOU", "TENCENT"]);
    expect(foreign.every((r) => r.metrics.cost === 1998 && r.accountIdentity?.workspaceId === foreignWorkspaceId)).toBe(true);
  });
  it("one explicit grant gives one media and empty scope gives no groups", async () => {
    const rows = await repository.queryDimension({ ...scope, filters: { accountScopes: [{ media: "KUAISHOU", accountId: "same" }] } });
    expect(rows).toHaveLength(1); expect(rows[0]?.metrics.cost).toBe(20);
    expect(await repository.queryDimension({ ...scope, filters: { accountScopes: [] } })).toEqual([]);
  });
  it("task and biz rollups retain authorized tuple filters", async () => {
    for (const dimension of ["task", "biz"] as const) {
      const rows = await repository.queryDimension({ ...scope, dimension, filters: { accountScopes: [{ media: "TENCENT", accountId: "same" }] } });
      expect(rows).toHaveLength(1); expect(rows[0]?.metrics.cost).toBe(40);
      expect(rows[0]).not.toHaveProperty("accountIdentity");
      expect(await repository.queryDimension({ ...scope, dimension, filters: { accountScopes: [] } })).toEqual([]);
    }
  });
  it("keeps expected missing days explicit and never replaces missing costs with zero", async () => {
    const rows = await repository.queryDimension({ ...scope, dateTo: "2026-08-03" });
    // v1.9.40：缺账户日给部分合计（每行都有数），「绝不当 0」这层意图由 partial 名单保证——
    // 值不是 0、也不是凭空造的，而是「已观测那部分的和」，并明说它不完整。
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.metrics.rowCount === 2 && r.metrics.cost !== 0
      && r.metrics.partial.includes("cost"))).toBe(true);
  });
});
