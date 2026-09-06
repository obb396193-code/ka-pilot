import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeWindowAssessment } from "@ka/domain";
import { runMigrations } from "../src/migrate.js";
import { WindowAssessmentRepository } from "../src/window-assessment-repository.js";

describe("window effective assessment version / real PG", () => {
  let pool: Pool; let repository: WindowAssessmentRepository;
  const workspaceId = randomUUID(), other = randomUUID();
  const scope = () => ({ workspaceId, dateFrom: "2026-09-01", dateTo: "2026-09-02", filters: { accountScopes: [{ media: "KUAISHOU", accountId: "synthetic-shared-id" }] } });
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl }); repository = new WindowAssessmentRepository(pool);
    for (const ws of [workspaceId, other]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic assessment')", [ws]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'synthetic-task','synthetic task','synthetic biz')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'synthetic-shared-id')", [ws, media]);
        await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,$2,'synthetic-shared-id','synthetic-task','2026-09-01')", [ws, media]);
        await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cash_cost,real_conversion)
          VALUES($1,$2,'synthetic-shared-id','2026-09-01',10,1),($1,$2,'synthetic-shared-id','2026-09-02',150,9)`, [ws, media]);
      }
      await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'synthetic-task',20,'2026-09-01'),($1,'synthetic-task',10,'2026-09-02'),($1,'synthetic-task',999,'2026-09-03')", [ws]);
    }
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, other]]);
    }
    await pool.end();
  });
  it("selects each day's newest effective price and excludes future versions", async () => {
    const rows = await repository.load(scope());
    expect(rows).toHaveLength(2); expect(rows.map((row) => row.price?.value)).toEqual([20, 10]);
    expect(computeWindowAssessment(rows)).toMatchObject({ costSpace: { value: -50 }, assessment: { price: null, priceVersions: 2, onTarget: false } });
  });
  it("never widens a tuple to same-account other media or another workspace; empty grant is empty", async () => {
    expect((await repository.load(scope())).map((row) => row.cashCost.value)).toEqual([10, 150]);
    expect(await repository.load({ ...scope(), filters: { accountScopes: [] } })).toEqual([]);
    const foreign = await repository.load({ ...scope(), workspaceId: other });
    expect(foreign.map((row) => row.cashCost.value)).toEqual([10, 150]);
    expect(foreign[0]?.price?.versionKey).not.toBe((await repository.load(scope()))[0]?.price?.versionKey);
  });
  it("missing account-days and missing assessment versions remain explicit, not silently dropped", async () => {
    const rows = await repository.load({ ...scope(), dateTo: "2026-09-03" });
    expect(rows).toHaveLength(3); expect(rows[2]?.cashCost.availability).toBe("missing");
    expect(computeWindowAssessment(rows).assessment.onTarget).toBeNull();
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-no-task')", [workspaceId]);
    const missing = await repository.load({ ...scope(), filters: { accountScopes: [{ media: "KUAISHOU", accountId: "synthetic-no-task" }] } });
    expect(missing).toHaveLength(2); expect(missing.every((row) => row.price === null)).toBe(true);
  });
  it("present-invalid numeric fails rather than turning into a missing metric", async () => {
    await pool.query("UPDATE account_metrics_daily SET cash_cost='NaN' WHERE workspace_id=$1 AND media='TENCENT'", [workspaceId]);
    await expect(repository.load({ ...scope(), filters: { accountScopes: [{ media: "TENCENT", accountId: "synthetic-shared-id" }] } })).rejects.toThrow();
  });
});
