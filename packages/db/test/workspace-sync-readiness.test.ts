import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { loadWorkspaceSyncReadiness, loadWorkspaceSyncReadinessBatch } from "../src/workspace-sync-readiness.js";

// Synthetic tuple/date/failed-batch facts; no upstream credential or real business data.
describe("canonical tuple-day readiness / real PG", () => {
  let pool: Pool, workspaceId: string, otherWorkspace: string, requestingUserId: string;
  const dates = { dateFrom: "2026-09-09", dateTo: "2026-09-10" };
  const input = () => ({ workspaceId, requestingUserId, ...dates,
    allowedAccounts: [{ media: "KUAISHOU", accountId: "synthetic-a" }] });
  const ready = () => loadWorkspaceSyncReadiness(pool, input());
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl, max: 4 });
  });
  beforeEach(async () => {
    workspaceId = randomUUID(); otherWorkspace = randomUUID(); requestingUserId = randomUUID();
    for (const ws of [workspaceId, otherWorkspace]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic readiness')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) for (const id of ["synthetic-a", "synthetic-b"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,$3)", [ws, media, id]);
      }
    }
    await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic reader')", [requestingUserId, workspaceId]);
  });
  afterEach(async () => {
    for (const table of ["metrics_raw", "account_metrics_daily", "etl_runs", "jobs", "accounts", "users", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, otherWorkspace]]);
    }
  });
  afterAll(async () => { await pool?.end(); });
  async function seed(ws = workspaceId, media = "KUAISHOU", ds = "2026-09-10", computed = "2026-09-10T01:00:00Z") {
    await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,computed_at)
      VALUES($1,$2,'synthetic-a',$3,$4) ON CONFLICT(workspace_id,media,account_id,ds)
      DO UPDATE SET computed_at=EXCLUDED.computed_at`, [ws, media, ds, computed]);
  }
  it("empty scope and a done full run without canonical rows are not ready", async () => {
    await pool.query(`INSERT INTO etl_runs(workspace_id,run_kind,status) VALUES($1,'full','done')`, [workspaceId]);
    expect(await ready()).toBe(false);
    expect(await loadWorkspaceSyncReadiness(pool, { ...input(), allowedAccounts: [] })).toBe(false);
  });
  it("requires every authorized tuple-day but no full/incr job marker", async () => {
    await seed(); expect(await ready()).toBe(false);
    expect(await loadWorkspaceSyncReadiness(pool, { ...input(), dateFrom: dates.dateTo })).toBe(true);
    await seed(workspaceId, "KUAISHOU", "2026-09-09"); expect(await ready()).toBe(true);
    expect(await loadWorkspaceSyncReadiness(pool, { ...input(), allowedAccounts: [...input().allowedAccounts, { media: "KUAISHOU", accountId: "synthetic-b" }] })).toBe(false);
    await pool.query("UPDATE account_metrics_daily SET computed_at=NULL WHERE workspace_id=$1 AND ds=$2", [workspaceId, dates.dateTo]);
    expect(await ready()).toBe(false);
  });
  it("does not borrow same-ID rows from another media/workspace or another date", async () => {
    for (const ds of [dates.dateFrom, dates.dateTo]) { await seed(otherWorkspace, "KUAISHOU", ds); await seed(workspaceId, "TENCENT", ds); }
    await seed(workspaceId, "KUAISHOU", "2026-09-08"); expect(await ready()).toBe(false);
    expect(await loadWorkspaceSyncReadinessBatch(pool, [input(), { ...input(), workspaceId: otherWorkspace },
      { ...input(), allowedAccounts: [{ media: "TENCENT", accountId: "synthetic-a" }] }])).toEqual([false, true, true]);
  });
  it("keeps a failed tuple masked until matching Raw recovery AND canonical recomputation", async () => {
    for (const ds of [dates.dateFrom, dates.dateTo]) await seed(workspaceId, "KUAISHOU", ds);
    expect(await ready()).toBe(true);
    await pool.query("INSERT INTO etl_runs(workspace_id,run_kind,status,scope) VALUES($1,'incr','done',$2)", [workspaceId, {
      batchFailures: [{ media: "KUAISHOU", accountIds: ["synthetic-a"], ds: dates.dateTo,
        resource: "account_realtime", failedAt: "2026-09-10T02:00:00Z" }],
    }]);
    expect(await ready()).toBe(false);
    await pool.query(`INSERT INTO metrics_raw(workspace_id,media,account_id,ds,source,resource,payload,request_params,fetched_at)
      VALUES($1,'KUAISHOU','synthetic-a',$2,'realtime','account_realtime','{}','{}','2026-09-10T03:00:00Z')`, [workspaceId, dates.dateTo]);
    expect(await ready()).toBe(false);
    await seed(workspaceId, "KUAISHOU", dates.dateTo, "2026-09-10T04:00:00Z"); expect(await ready()).toBe(true);
  });
  it("stays within the caller's RR snapshot during concurrent canonical publication", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      expect(await loadWorkspaceSyncReadiness(client, input())).toBe(false);
      for (const ds of [dates.dateFrom, dates.dateTo]) await seed(workspaceId, "KUAISHOU", ds);
      expect(await loadWorkspaceSyncReadiness(client, input())).toBe(false);
      await client.query("COMMIT"); expect(await ready()).toBe(true);
    } finally { await client.query("ROLLBACK"); client.release(); }
  });
});
