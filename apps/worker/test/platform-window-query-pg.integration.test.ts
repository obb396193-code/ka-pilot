import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "@ka/db";
import { createPlatformWindowQuery } from "../src/data/platform-window-query.js";

describe("personal summary window composition / synthetic real PG", () => {
  let pool: Pool;
  const workspaceId = randomUUID(), foreignWorkspaceId = randomUUID();
  const input = { workspaceId, accounts: [{ media: "KUAISHOU", accountId: "synthetic-window" }], window: { from: "2026-09-01", to: "2026-09-02" } };
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl, max: 3 });
    for (const ws of [workspaceId, foreignWorkspaceId]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic window')", [ws]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,'synthetic-task','synthetic task')", [ws]);
      await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'synthetic-task',20,'2026-09-01'),($1,'synthetic-task',10,'2026-09-02'),($1,'synthetic-task',999,'2026-09-03')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'synthetic-window')", [ws, media]);
        await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,$2,'synthetic-window','synthetic-task','2026-08-01')", [ws, media]);
        for (const [ds, cash, conv] of [["2026-09-01", 22, 1], ["2026-09-02", 3, 1], ["2026-08-25", 10, 2], ["2026-08-26", 10, 2]] as const) {
          const actualCash = ws === workspaceId && media === "KUAISHOU" ? cash : 900;
          await pool.query("INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,conversion,cost_space,computed_at) VALUES($1,$2,'synthetic-window',$3,40,$4,$5,4,999,'2026-09-02T10:00:00Z')", [ws, media, ds, actualCash, conv]);
        }
      }
    }
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, foreignWorkspaceId]]);
    }
    await pool.end();
  });
  it("returns the real weighted window, not cached costSpace or cross-media/workspace data", async () => {
    const result = await createPlatformWindowQuery(pool).summary({ ...input, compare: "wow" });
    expect(result.row).toMatchObject({ rowCount: 2, accountCount: 1,
      metrics: { cashCost: { value: 25 }, realConversion: { value: 2 }, costSpace: { value: 5 }, ratios: { cashCpa: { value: 12.5 } } },
      assessment: { price: null, priceVersions: 2, costStatus: "yellow", onTarget: true },
      compare: { mode: "wow", deltas: { cashCost: { value: 0.25 }, cashCpa: { value: 7.5 }, realConversion: { value: -0.5 } } },
    });
    expect(result.lineage).toMatchObject({ returnedAccounts: 1, canonicalRows: 2, requestedAccountDays: 2 });
  });
  it("empty explicit scope stays empty; no workspace discovery fallback", async () => {
    const result = await createPlatformWindowQuery(pool).summary({ ...input, accounts: [] });
    expect(result.row).toMatchObject({ accountCount: 0, rowCount: 0, metrics: { cashCost: { value: null, availability: "missing" } }, assessment: { onTarget: null } });
    expect(result.lineage.returnedAccountDays).toBe(0);
  });
  it("missing account-days invalidate the assessment instead of making the remainder look green", async () => {
    const result = await createPlatformWindowQuery(pool).summary({ ...input, window: { from: "2026-09-01", to: "2026-09-03" } });
    expect(result.row.metrics.cashCost).toEqual({ value: null, availability: "missing" });
    expect(result.row.metrics.costSpace).toEqual({ value: null, availability: "missing" });
    expect(result.row.assessment.onTarget).toBeNull();
    expect(result.lineage).toMatchObject({ requestedAccountDays: 3, returnedAccountDays: 2 });
  });
});
