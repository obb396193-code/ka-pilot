import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ACCOUNT_LIST_COUNT_SQL, ACCOUNT_LIST_PAGE_SQL } from "../../src/account-list-sql.js";
import { TASK_LIST_PAGE_SQL } from "../../src/task-list-sql.js";
import { runMigrations } from "../../src/migrate.js";

// Synthetic data only. Execute on the explicitly selected isolated test database.
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be_be2check_test";

/**
 * Q-037：某批次 ETL 失败后，那一格的 canonical 行还是**上一次成功**留下的旧值。
 * 接共享守卫之前，列表会把这份旧 cost 照常显示、还把覆盖度报成完整——
 * 页面上看不出「这个数是过期的」。Codex 的探针
 * `scripts/probe-list-batch-readability.ts` 把这几个反例列全了，这里按它建同一份数据，
 * 断言反过来：失败批次的旧值不进 PAGE / COUNT / spent，而账户本身照常在列表里、那一格显缺失。
 */
describe("Q-037 failed ETL batches stop feeding the lists (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  const ds = "2026-09-09";
  const accounts = JSON.stringify([{ media: "KUAISHOU", account_id: "q037-a" }]);
  let workspaceId = "";
  let userId = "";
  let jobId = "";

  const accountArgs = (): unknown[] =>
    [workspaceId, ds, "explicit_accounts", accounts, null, "KUAISHOU", null, null, null, null, null, null, null];
  const taskArgs = (): unknown[] =>
    [workspaceId, ds, "explicit_accounts", accounts, null, null, null, null, null, null, 20, 0];

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = randomUUID();
    userId = randomUUID();
    jobId = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'q037 synthetic')", [workspaceId]);
    await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic')", [userId, workspaceId]);
    for (const media of ["KUAISHOU", "TENCENT"]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'q037-a')",
        [workspaceId, media]);
      await pool.query(
        `INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,real_conversion,computed_at)
         VALUES($1,$2,'q037-a',$3,10,1,'2026-09-09T01:00:00Z')`, [workspaceId, media, ds]);
    }
    await pool.query(
      `INSERT INTO tasks(workspace_id,task_id,task_name,status,period_start,period_end)
       VALUES($1,'q037-task','synthetic','active',$2,$2)`, [workspaceId, ds]);
    await pool.query(
      `INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from)
       VALUES($1,'q037-task','KUAISHOU','q037-a',$2)`, [workspaceId, ds]);
    await pool.query(
      `INSERT INTO jobs(id,workspace_id,job_type,payload,credential_owner_user_id,status)
       VALUES($1,$2,'etl_full','{"media":"KUAISHOU","accountIds":["q037-a"]}',$3,'done')`,
      [jobId, workspaceId, userId]);
    await pool.query(
      `INSERT INTO etl_runs(workspace_id,job_id,run_kind,scope,status,rows_ingested)
       VALUES($1,$2,'full',$3,'done',1)`,
      [workspaceId, jobId, {
        batchFailures: [{
          code: "BATCH_FAILED", resource: "account_realtime", ds, media: "KUAISHOU",
          accountIds: ["q037-a"], fingerprint: "a".repeat(64), failedAt: "2026-09-09T02:00:00Z",
        }],
      }]);
  });

  afterAll(async () => {
    for (const table of ["etl_runs", "jobs", "task_accounts", "tasks", "metrics_raw",
      "account_metrics_daily", "accounts", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.end();
  });

  it("keeps the stale cost out of the account list but still lists the account", async () => {
    const row = (await pool.query(ACCOUNT_LIST_PAGE_SQL, [...accountArgs(), 20, 0])).rows[0];
    // 账户本身照常出现——要的是「这一格显缺失」，不是把整行账户藏起来。
    expect(row, "账户不该因为批次失败就从列表里消失").toBeDefined();
    // 失败批次留下的 10 元是上一次成功的旧值，不能当今天的花费显示。
    expect(row.cost).toBeNull();
  });

  it("stops reporting metrics coverage as complete", async () => {
    const count = (await pool.query(ACCOUNT_LIST_COUNT_SQL, accountArgs())).rows[0];
    // 报成完整 = 页面不显缺数横幅，用户看不出这个数是过期的。
    expect(count.metrics_complete).toBe(false);
  });

  it("keeps the stale cost out of the task list spend", async () => {
    const row = (await pool.query(TASK_LIST_PAGE_SQL, taskArgs())).rows[0];
    expect(row).toBeDefined();
    // 旧 cost 进 spent，任务看着「花了钱」而实际那天的数根本没取回来。
    expect(row.spent === null || Number(row.spent) === 0).toBe(true);
  });

  it("leaves other media and workspaces untouched", async () => {
    const other = (await pool.query(ACCOUNT_LIST_PAGE_SQL,
      [workspaceId, ds, "explicit_accounts", JSON.stringify([{ media: "TENCENT", account_id: "q037-a" }]),
        null, "TENCENT", null, null, null, null, null, null, null, 20, 0])).rows[0];
    // 守卫只挡失败的那一格：同一天同一账户的另一个媒体照常有数。
    expect(Number(other.cost)).toBe(10);
  });

  it("recovers once a fresh fetch is recomputed into canonical", async () => {
    await pool.query(
      `INSERT INTO metrics_raw(workspace_id,media,account_id,ds,resource,source,request_params,payload,fetched_at)
       VALUES($1,'KUAISHOU','q037-a',$2,'account_realtime','realtime','{}','{}','2026-09-09T03:00:00Z')`,
      [workspaceId, ds]);
    // 只有新 raw 还不够——canonical 没重算，页面上那一格仍是旧值，仍该缺失。
    expect((await pool.query(ACCOUNT_LIST_PAGE_SQL, [...accountArgs(), 20, 0])).rows[0].cost).toBeNull();

    await pool.query(
      `UPDATE account_metrics_daily SET computed_at='2026-09-09T04:00:00Z'
       WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id='q037-a' AND ds=$2`, [workspaceId, ds]);
    expect(Number((await pool.query(ACCOUNT_LIST_PAGE_SQL, [...accountArgs(), 20, 0])).rows[0].cost)).toBe(10);
  });
});
