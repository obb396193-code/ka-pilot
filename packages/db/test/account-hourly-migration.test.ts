// Synthetic fixture only. TEST_DATABASE_URL is explicit; never falls back to a shared /ka.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { ensureMetricPartitions } from "../src/partition-maintenance.js";
import { downThrough, upThrough, windowSize } from "./migration-window.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const pgSuite = databaseUrl ? describe : describe.skip;
pgSuite("025 account hourly actual PostgreSQL migration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const a = randomUUID(), b = randomUUID(), account = `hourly-${randomUUID()}`;
  const workspaces = [a, b];
  const insert = (workspace = a, media = "KUAISHOU", id = account, hh = 0) => pool.query(
    `INSERT INTO account_metrics_hourly
       (workspace_id,media,account_id,ds,hh,last_sync_time,sampled_at,complete)
     VALUES ($1,$2,$3,CURRENT_DATE,$4,'2026-09-10T05:01:00Z','2026-09-10T05:05:00Z',false)`,
    [workspace, media, id, hh],
  );
  beforeAll(async () => {
    await runMigrations({ databaseUrl: databaseUrl! });
    await pool.query("INSERT INTO workspaces (id,name) VALUES ($1,'hourly-fixture-a'),($2,'hourly-fixture-b')", workspaces);
    await pool.query(`INSERT INTO accounts(workspace_id,media,account_id)
      VALUES ($1,'KUAISHOU',$3),($1,'TENCENT',$3),($2,'KUAISHOU',$3)`, [a, b, account]);
  }, 30_000);
  afterEach(async () => {
    await pool.query("DELETE FROM account_metrics_hourly WHERE workspace_id=ANY($1::uuid[])", [workspaces]);
  });
  afterAll(async () => {
    try {
      await pool.query("DELETE FROM accounts WHERE workspace_id=ANY($1::uuid[])", [workspaces]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [workspaces]);
    } finally { await pool.end(); }
  });

  it("keeps same-number accounts distinct by workspace/media and nullable metrics unknown", async () => {
    await insert(); await insert(a, "TENCENT"); await insert(b);
    const result = await pool.query(`SELECT workspace_id,media,cost,exposure,click,conversion,
      real_conversion,budget,last_sync_time,sampled_at,complete,source_run_id
      FROM account_metrics_hourly WHERE workspace_id=ANY($1::uuid[])`, [workspaces]);
    expect(result.rows).toHaveLength(3);
    expect(new Set(result.rows.map((row) => `${row.workspace_id}:${row.media}`)).size).toBe(3);
    for (const row of result.rows) expect(row).toMatchObject({ cost: null, exposure: null,
      click: null, conversion: null, real_conversion: null, budget: null, complete: false,
      source_run_id: null, last_sync_time: new Date("2026-09-10T05:01:00Z"),
      sampled_at: new Date("2026-09-10T05:05:00Z") });
  });

  it("enforces the entire account FK on writes and prevents deleting referenced accounts", async () => {
    await expect(insert(a, "BAIDU")).rejects.toMatchObject({ code: "23503" });
    await expect(insert(randomUUID())).rejects.toMatchObject({ code: "23503" });
    await expect(insert(a, "KUAISHOU", "no-such-account")).rejects.toMatchObject({ code: "23503" });
    await insert();
    await expect(pool.query("DELETE FROM accounts WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id=$2", [a, account]))
      .rejects.toMatchObject({ code: "23503" });
  });

  it("accepts only stored hours 0..23 and rejects duplicate five-key rows", async () => {
    await insert(); await insert(a, "KUAISHOU", account, 23);
    await expect(insert(a, "KUAISHOU", account, -1)).rejects.toMatchObject({ code: "23514" });
    await expect(insert(a, "KUAISHOU", account, 24)).rejects.toMatchObject({ code: "23514" });
    await expect(insert()).rejects.toMatchObject({ code: "23505" });
    await expect(pool.query(`INSERT INTO account_metrics_hourly
      (workspace_id,media,account_id,ds,hh,sampled_at,complete)
      VALUES ($1,'KUAISHOU',$2,CURRENT_DATE,1,now(),false)`, [a, account]))
      .rejects.toMatchObject({ code: "23502" });
  });

  it("refuses a nonempty downgrade atomically without losing data or migration state", async () => {
    await insert();
    await expect(downThrough(databaseUrl!, "025")).rejects.toThrow("cannot downgrade losslessly");
    expect((await pool.query("SELECT count(*)::int n FROM account_metrics_hourly WHERE workspace_id=$1", [a])).rows[0]?.n).toBe(1);
    expect((await pool.query("SELECT count(*)::int n FROM pgmigrations WHERE name LIKE '025_%'")).rows[0]?.n).toBe(1);
  }, 30_000);

  it("replays up/down/up and maintains all four parents, restoring three on down", async () => {
    const oldParents = await pool.query("SELECT 'metrics_raw'::regclass::oid raw, 'account_metrics_daily'::regclass::oid daily, 'ad_metrics_hourly'::regclass::oid ad");
    expect(await downThrough(databaseUrl!, "025")).toBe(windowSize("025"));
    expect((await pool.query("SELECT to_regclass('account_metrics_hourly') hourly,to_regclass('etl_runs_workspace_started_id_idx') idx")).rows[0])
      .toEqual({ hourly: null, idx: null });
    // Actual shared maintenance call, not an assertion on generated SQL.
    await ensureMetricPartitions(pool, { asOf: new Date("2032-01-01T00:00:00Z"), monthsAhead: 1 });
    expect(await upThrough(databaseUrl!, "025")).toBe(windowSize("025"));
    await ensureMetricPartitions(pool, { asOf: new Date("2032-01-01T00:00:00Z"), monthsAhead: 1 });
    for (const parent of ["metrics_raw", "account_metrics_daily", "ad_metrics_hourly", "account_metrics_hourly"]) {
      const found = await pool.query(`SELECT count(*)::int n FROM pg_inherits
        WHERE inhparent=to_regclass($1) AND inhrelid=to_regclass($2)`, [parent, `${parent}_2032_02`]);
      expect(found.rows[0]?.n).toBe(1);
    }
    expect((await pool.query("SELECT 'metrics_raw'::regclass::oid raw, 'account_metrics_daily'::regclass::oid daily, 'ad_metrics_hourly'::regclass::oid ad")).rows)
      .toEqual(oldParents.rows);
    const index = await pool.query("SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema() AND indexname='etl_runs_workspace_started_id_idx'");
    expect(index.rows[0]?.indexdef).toContain("(workspace_id, started_at DESC, id DESC)");
    await pool.query(`INSERT INTO account_metrics_hourly
      (workspace_id,media,account_id,ds,hh,cost,last_sync_time,sampled_at,complete)
      VALUES ($1,'KUAISHOU',$2,'2032-02-29',23,0,'2032-03-01T00:00:00Z','2032-03-01T00:05:00Z',true)`, [a, account]);
    expect((await pool.query("SELECT cost::text FROM account_metrics_hourly WHERE workspace_id=$1", [a])).rows[0]?.cost).toBe("0");
  }, 30_000);
});
