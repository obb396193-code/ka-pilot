import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, SemanticQueryRepository, withSemanticReadSnapshot } from "@ka/db";
import type { ApprovedWorkspaceAuthContext, DataQueryResponse } from "@ka/domain";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { createPlatformWindowQuery } from "../src/data/platform-window-query.js";
import { DisabledKaDataSource } from "../src/data/disabled-ka-data-source.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { DataQueryService, createDataQueryHttpHandler } from "../src/data/query-service.js";

// Real PG + actual public handler, synthetic auth context. Not a login/session E2E test.
describe("task filtered table / real PG and HTTP handler", () => {
  let pool: Pool;
  let handler: ReturnType<typeof createDataQueryHttpHandler>;
  const workspaceId = randomUUID(), foreignWorkspaceId = randomUUID();
  const auth: ApprovedWorkspaceAuthContext = { workspaceId, userId: randomUUID(), workspaceKind: "personal", role: "optimizer",
    scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl });
    pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 3000 });
    for (const ws of [workspaceId, foreignWorkspaceId]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic task query')", [ws]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,'task-a','synthetic A'),($1,'task-b','synthetic B')", [ws]);
      await pool.query(`INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date)
        VALUES($1,'task-a',20,'2026-08-01'),($1,'task-a',30,'2026-08-02'),($1,'task-a',999,'2026-08-04'),($1,'task-b',50,'2026-08-03')`, [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'same')", [ws, media]);
        await pool.query(`INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from,valid_to)
          VALUES($1,$2,'same','task-a','2026-08-01','2026-08-02'),($1,$2,'same','task-b','2026-08-03',NULL)`, [ws, media]);
        const cost = ws === foreignWorkspaceId ? 999 : media === "KUAISHOU" ? 10 : 100;
        await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,computed_at)
          SELECT $1,$2,'same',day,$3,$3,1,'2026-08-04T01:00:00Z'::timestamptz
          FROM generate_series('2026-08-01'::date,'2026-08-03'::date,'1 day') day`, [ws, media, cost]);
      }
    }
    const platform = new PlatformDataSource(new SemanticQueryRepository(pool), (read) =>
      withSemanticReadSnapshot(pool, (connection) => read(new SemanticQueryRepository(connection))), createPlatformWindowQuery(pool));
    handler = createDataQueryHttpHandler(new DataQueryService({ registry: createDataQueryRegistry(), platform, kaData: new DisabledKaDataSource() }));
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, foreignWorkspaceId]]);
    }
    await pool.end();
  });
  const params = { date_from: "2026-08-01", date_to: "2026-08-03", taskId: "task-a", pageSize: 1 };
  function source(body: DataQueryResponse) {
    if (!body.ok || body.data.mode !== "platform") throw new Error("Expected platform result");
    return body.data.source;
  }
  it("filters effective relation before page/count and coverage; same-ID other media/workspace is excluded", async () => {
    for (const page of [1, 2, 3]) {
      const result = await handler({ method: "POST", body: { queryId: "account.table", params: { ...params, page } }, auth, requestId: "task-pg" });
      expect(result.status).toBe(200);
      const value = source(result.body);
      expect(value.wholeResultTotal).toEqual({ value: 2, availability: "available" });
      expect(value.lineage.coverage).toEqual({ complete: true, returnedObjects: 1 });
      expect(value.rows).toHaveLength(page <= 2 ? 1 : 0);
      if (page <= 2) expect(value.rows[0]).toMatchObject({ workspaceId, media: "KUAISHOU", accountId: "same",
        ds: page === 1 ? "2026-08-02" : "2026-08-01", tasks: [{ taskId: "task-a" }], metrics: { cost: { value: 10 } } });
    }
  });
  it("empty grant and a task without effective days are known empty", async () => {
    const cases: [ApprovedWorkspaceAuthContext, string][] = [
      [{ ...auth, scope: { kind: "explicit_accounts", accounts: [] } }, "task-a"], [auth, "missing-task"],
    ];
    for (const [context, taskId] of cases) {
      const result = await handler({ method: "POST", body: { queryId: "account.table", params: { ...params, taskId } }, auth: context });
      expect(result.status).toBe(200); expect(source(result.body).rows).toEqual([]);
      expect(source(result.body).wholeResultTotal).toEqual({ value: 0, availability: "available" });
    }
  });
  it("public task summary/trend exclude dates after transfer and foreign tuples; compare re-evaluates effective dates", async () => {
    for (const queryId of ["account.summary", "account.trend"]) {
      const result = await handler({ method: "POST", auth, requestId: "task-window-pg", body: { queryId,
        params: { date_from: "2026-08-01", date_to: "2026-08-03", taskId: "task-a", ...(queryId === "account.summary" ? { compare: "dod" } : {}) } } });
      expect(result.status).toBe(200); const value = source(result.body);
      expect(value.lineage.coverage).toEqual({ complete: true, returnedObjects: 1 });
      if (queryId === "account.summary") expect(value.rows[0]).toMatchObject({ rowCount: 2, accountCount: 1,
        metrics: { cashCost: { value: 20 }, realConversion: { value: 2 }, costSpace: { value: 30 } },
        assessment: { price: null, priceVersions: 2, priceSource: "history", onTarget: true },
        compare: { mode: "dod", deltas: { cashCost: { value: 0, state: "finite" }, onTargetRate: { value: 0, state: "finite" } } },
      });
      else {
        expect(value.rows.map((row) => row.ds)).toEqual(["2026-08-01", "2026-08-02"]);
        for (const row of value.rows) expect(row).toMatchObject({ metrics: { cashCost: { value: 10 }, realConversion: { value: 1 } } });
      }
    }
  });
  it("summary and trend have zero observed members for empty grants or an unrelated task", async () => {
    for (const queryId of ["account.summary", "account.trend"]) for (const taskId of ["task-a", "missing-task"]) {
      const context: ApprovedWorkspaceAuthContext = taskId === "task-a" ? { ...auth, scope: { kind: "explicit_accounts", accounts: [] } } : auth;
      const result = await handler({ method: "POST", auth: context, body: { queryId,
        params: { date_from: "2026-08-01", date_to: "2026-08-03", taskId } } });
      expect(result.status).toBe(200); const value = source(result.body);
      expect(value.lineage.coverage).toEqual({ complete: true, returnedObjects: 0 });
      if (queryId === "account.summary") expect(value.rows[0]).toMatchObject({ rowCount: 0, accountCount: 0,
        metrics: { cashCost: { value: null, availability: "missing" } }, assessment: { onTarget: null } });
      else expect(value.rows).toEqual([]);
    }
  });
  it("a missing expected metric day is partial, not silently removed from the task denominator", async () => {
    await pool.query("DELETE FROM account_metrics_daily WHERE workspace_id=$1 AND media='KUAISHOU' AND ds='2026-08-02'", [workspaceId]);
    const result = await handler({ method: "POST", body: { queryId: "account.table", params }, auth });
    expect(result.status).toBe(200); expect(source(result.body).lineage).toMatchObject({ partial: true, truncated: false, coverage: { complete: false } });
    expect(source(result.body).wholeResultTotal.availability).toBe("partial");
    for (const queryId of ["account.summary", "account.trend"]) {
      const response = await handler({ method: "POST", auth, body: { queryId,
        params: { date_from: "2026-08-01", date_to: "2026-08-03", taskId: "task-a" } } });
      expect(response.status).toBe(200); const value = source(response.body);
      expect(value.lineage).toMatchObject({ partial: true, truncated: false });
      // v1.9.35：窗口聚合（summary）给带 partial 标的部分合计、判定挂起；
      // 而**逐日行（trend）不受影响**——那一天就是没有数，仍是 missing，绝不是 0 也不是「部分」。
      if (queryId === "account.summary") {
        expect(value.rows[0]).toMatchObject({ metrics: { cashCost: { availability: "partial" } },
          assessment: { onTarget: null, costStatusReason: "partial_data" } });
      } else {
        expect(value.rows[1]).toMatchObject({ ds: "2026-08-02", metrics: { cashCost: { value: null, availability: "missing" } } });
      }
    }
  });
});
