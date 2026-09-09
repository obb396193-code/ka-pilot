import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SemanticQueryRepository } from "../src/semantic-query-repository.js";
import { WindowAssessmentRepository } from "../src/window-assessment-repository.js";
import { accountScopeClause } from "../src/r014/workspace-authority.js";
import { buildMetricFilter } from "../src/semantic-query-support.js";

describe("shared semantic authority / synthetic PG", () => {
  let pool: Pool;
  const workspaceId = randomUUID(), foreign = randomUUID(), ds = "2026-09-09";
  const scope = { workspaceId, dateFrom: ds, dateTo: ds, filters: { accountScopes: [{ media: "KUAISHOU", accountId: "same-id" }] } };
  beforeAll(async () => {
    const value = process.env.TEST_DATABASE_URL ?? "", url = new URL(value);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
    pool = new Pool({ connectionString: value });
    for (const ws of [workspaceId, foreign]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic authority')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id,status) VALUES($1,$2,'same-id','active')", [ws, media]);
        const cost = ws === foreign ? 700 : media === "KUAISHOU" ? 7 : 70;
        await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion)
          VALUES($1,$2,'same-id',$3,$4,$4,1)`, [ws, media, ds, cost]);
      }
    }
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "accounts", "workspaces"]) await pool.query(
      `DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, foreign]]);
    await pool.end();
  });
  it("uses the frozen shared clause rather than another hand-copied tuple predicate", () => {
    expect(buildMetricFilter(scope).whereSql).toContain(accountScopeClause("'explicit_accounts'", "$4", "metric.media", "metric.account_id"));
  });
  it("summary/trend/table/dimension/window/health isolate the pair; removing the predicate proves the negative control", async () => {
    let removals = 0;
    const unguarded = { query: async (sql: string, values: unknown[]) => {
      for (const alias of ["metric", "account"]) {
        const clause = accountScopeClause("'explicit_accounts'", "$4", `${alias}.media`, `${alias}.account_id`);
        if (sql.includes(clause)) { removals++; sql = sql.replaceAll(clause, "($4::jsonb IS NOT NULL)"); }
      }
      return pool.query(sql, values);
    } } as unknown as Pick<Pool, "query">;
    for (const [executor, expectedCost, expectedRows] of [[pool, 7, 1], [unguarded, 77, 2]] as const) {
      const repo = new SemanticQueryRepository(executor);
      expect((await repo.querySummary(scope)).cost).toBe(expectedCost);
      expect((await repo.queryTrend(scope))[0]?.metrics.cost).toBe(expectedCost);
      expect((await repo.queryTable(scope)).total).toBe(expectedRows);
      if (executor === pool) expect((await repo.queryDimension({ ...scope, dimension: "account" })).length).toBe(1);
      else await expect(repo.queryDimension({ ...scope, dimension: "account" })).rejects.toThrow("Invalid dimension result");
      expect((await repo.queryHealth(scope)).coverage).toMatchObject({ canonicalRows: expectedRows, accountsInScope: expectedRows });
      const window = new WindowAssessmentRepository(executor);
      expect((await window.load(scope))[0]?.cashCost.value).toBe(expectedCost);
    }
    expect(removals).toBeGreaterThanOrEqual(6);
  });
  it("next-request scope revocation becomes empty rather than workspace-wide, foreign workspace stays separate", async () => {
    const repo = new SemanticQueryRepository(pool), empty = { ...scope, filters: { accountScopes: [] } };
    expect((await repo.querySummary(empty)).cost).toBeNull();
    expect(await repo.queryTrend(empty)).toEqual([]);
    expect((await repo.queryTable(empty)).total).toBe(0);
    expect((await repo.queryHealth(empty)).coverage).toMatchObject({ canonicalRows: 0, accountsInScope: 0 });
    expect(await new WindowAssessmentRepository(pool).load(empty)).toEqual([]);
    expect((await repo.querySummary({ ...scope, workspaceId: foreign })).cost).toBe(700);
  });
});
