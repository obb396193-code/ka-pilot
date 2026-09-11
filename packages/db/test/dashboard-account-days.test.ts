import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { DashboardAccountDaysRepository } from "../src/dashboard-account-days-repository.js";
import { SemanticQueryRepository } from "../src/semantic-query-repository.js";
import { WindowAssessmentRepository } from "../src/window-assessment-repository.js";
describe("dashboard eligible dates / synthetic PG", () => {
  let pool: Pool; const ws = randomUUID(), other = randomUUID();
  const accounts = [{ media: "KUAISHOU", accountId: "a" }];
  const input = { workspaceId: ws, accounts, dateFrom: "2026-09-01", dateTo: "2026-09-03" };
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
    if (url.hostname !== "127.0.0.1" || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl });
    for (const workspaceId of [ws, other]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic dashboard filters')", [workspaceId]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'one','任务一','业务一'),($1,'two','任务二','业务二')", [workspaceId]);
      await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'one',100,'2026-08-01'),($1,'two',10,'2026-08-01')", [workspaceId]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'a')", [workspaceId, media]);
        await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from,valid_to) VALUES($1,$2,'a','one','2026-09-01','2026-09-01'),($1,$2,'a','two','2026-09-02',NULL)", [workspaceId, media]);
        await pool.query("INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,computed_at) VALUES($1,$2,'a','2026-09-01',1000,1000,1,'2026-09-03T00:00:00Z'),($1,$2,'a','2026-09-02',10,10,1,'2026-09-03T00:00:00Z')", [workspaceId, media]);
      }
    }
  }, 30000);
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) await pool.query(
      `DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[ws, other]]);
    await pool.end();
  });
  it("metadata includes missing metric day but changes task/biz at effective date", async () => {
    const rows = await new DashboardAccountDaysRepository(pool).load(input);
    expect(rows).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"].map((ds, i) => ({ workspaceId: ws,
      ...accounts[0], ds, taskId: i ? "two" : "one", taskName: i ? "任务二" : "任务一", bizName: i ? "业务二" : "业务一" })));
    expect(await new DashboardAccountDaysRepository(pool).load({ ...input, accounts: [] })).toEqual([]);
  });
  it("filters summary/trend/table/assessment/lineage by exact dates rather than widening whole account", async () => {
    const scope = { workspaceId: ws, dateFrom: input.dateFrom, dateTo: input.dateTo,
      filters: { accountScopes: accounts, accountDays: [{ ...accounts[0]!, ds: "2026-09-02" }] } };
    const semantic = new SemanticQueryRepository(pool), assessment = new WindowAssessmentRepository(pool);
    expect(await semantic.querySummary(scope)).toMatchObject({ cost: 10, accountCount: 1, rowCount: 1 });
    expect(await semantic.queryTrend(scope)).toMatchObject([{ ds: "2026-09-02", metrics: { cost: 10 } }]);
    expect((await semantic.queryTable(scope)).rows.map(row => row.ds)).toEqual(["2026-09-02"]);
    expect(await semantic.queryLineage(scope)).toMatchObject({ requestedAccountDays: 1, returnedAccountDays: 1, requestedDates: ["2026-09-02"] });
    expect(await assessment.loadAccountCounts(scope)).toEqual({ total: 1, determinable: 1, onTarget: 1 });
    expect((await assessment.loadByAccount(scope)).map(row => row.input.price?.value)).toEqual([10]);
    scope.filters.accountDays.push({ ...accounts[0]!, ds: "2026-09-03" });
    // v1.9.40：缺账户日给 Σ 有数那部分并在 `partial` 名单里点名该列，不再把整窗抹成 null。
    expect(await semantic.querySummary(scope)).toMatchObject({ rowCount: 1, partial: expect.arrayContaining(["cost"]) });
    expect(await semantic.queryLineage(scope)).toMatchObject({ requestedAccountDays: 2, returnedAccountDays: 1 });
    expect(await assessment.loadAccountCounts(scope)).toEqual({ total: 1, determinable: 0, onTarget: 0 });
    scope.filters.accountDays = [];
    expect(await semantic.queryLineage(scope)).toMatchObject({ requestedAccountDays: 0, returnedAccountDays: 0, requestedDates: [] });
    expect((await semantic.queryTable(scope)).total).toBe(0);
  });
});
