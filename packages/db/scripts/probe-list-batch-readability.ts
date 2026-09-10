/** Diagnostic only: synthetic rows in one rollback-only local PG transaction. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ACCOUNT_LIST_COUNT_SQL, ACCOUNT_LIST_PAGE_SQL } from "../src/account-list-sql.js";
import { TASK_LIST_PAGE_SQL } from "../src/task-list-sql.js";
import { WORKSPACE_SYNC_READINESS_SQL } from "../src/workspace-sync-readiness.js";
import { etlBatchReadableSql } from "../src/etl-batch-readability.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit local synthetic TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname))
  throw new Error("Probe restricted to local55432 isolated ka_*_test");
const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 3000 });
const ws = randomUUID(), foreignWs = randomUUID(), user = randomUUID(), job = randomUUID();
const ds = "2026-09-09", accounts = JSON.stringify([{ media: "KUAISHOU", account_id: "synthetic-a" }]);
let findings: Record<string, boolean> | undefined;
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query("SET LOCAL statement_timeout='10s'");
    await client.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic batch probe'),($2,'synthetic batch probe')", [ws, foreignWs]);
    await client.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic')", [user, ws]);
    for (const workspace of [ws, foreignWs]) {
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await client.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'synthetic-a')", [workspace, media]);
        await client.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,real_conversion,computed_at)
          VALUES($1,$2,'synthetic-a',$3,10,1,'2026-09-09T01:00:00Z')`, [workspace, media, ds]);
      }
    }
    await client.query(`INSERT INTO tasks(workspace_id,task_id,task_name,status,period_start,period_end)
      VALUES($1,'synthetic-task','synthetic','active',$2,$2)`, [ws, ds]);
    await client.query(`INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from)
      VALUES($1,'synthetic-task','KUAISHOU','synthetic-a',$2)`, [ws, ds]);
    await client.query(`INSERT INTO jobs(id,workspace_id,job_type,payload,credential_owner_user_id,status)
      VALUES($1,$2,'etl_full','{"media":"KUAISHOU","accountIds":["synthetic-a"]}',$3,'done')`, [job, ws, user]);
    await client.query(`INSERT INTO etl_runs(workspace_id,job_id,run_kind,scope,status,rows_ingested)
      VALUES($1,$2,'full',$3,'done',1)`, [ws, job, { batchFailures: [{ code: "BATCH_FAILED", resource: "account_realtime",
      ds, media: "KUAISHOU", accountIds: ["synthetic-a"], fingerprint: "a".repeat(64), failedAt: "2026-09-09T02:00:00Z" }] }]);
    const accountArgs = [ws, ds, "explicit_accounts", accounts, null, "KUAISHOU", null, null, null, null, null, null, null];
    const taskArgs = [ws, ds, "explicit_accounts", accounts, null, null, null, null, null, null, 20, 0];
    const account = (await client.query(ACCOUNT_LIST_PAGE_SQL, [...accountArgs, 20, 0])).rows[0];
    const count = (await client.query(ACCOUNT_LIST_COUNT_SQL, accountArgs)).rows[0];
    const task = (await client.query(TASK_LIST_PAGE_SQL, taskArgs)).rows[0];
    const readiness = (await client.query(WORKSPACE_SYNC_READINESS_SQL, [ws, user, accounts])).rows[0];
    const observed = async (workspace = ws, media = "KUAISHOU") => (await client.query(
      `SELECT ${etlBatchReadableSql("metric")} AS readable FROM account_metrics_daily metric
       WHERE workspace_id=$1 AND media=$2 AND account_id='synthetic-a' AND ds=$3`, [workspace, media, ds])).rows[0]?.readable;
    assert.equal(Number(account.cost), 10, "Expected existing account reader stale-value counterexample");
    assert.equal(count.metrics_complete, true, "Expected existing account metrics-complete counterexample");
    assert.equal(Number(task.spent), 10, "Expected existing task reader stale-value counterexample");
    assert.equal(readiness.initial_full_complete, true, "Expected existing full-readiness counterexample");
    assert.equal(await observed(), false);
    assert.equal(await observed(ws, "TENCENT"), true);
    assert.equal(await observed(foreignWs), true);
    await client.query(`INSERT INTO metrics_raw(workspace_id,media,account_id,ds,resource,source,request_params,payload,fetched_at)
      VALUES($1,'KUAISHOU','synthetic-a',$2,'account_realtime','realtime','{}','{}','2026-09-09T03:00:00Z')`, [ws, ds]);
    assert.equal(await observed(), false, "New Raw must not bless old canonical");
    await client.query(`UPDATE account_metrics_daily SET computed_at='2026-09-09T04:00:00Z'
      WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id='synthetic-a' AND ds=$2`, [ws, ds]);
    assert.equal(await observed(), true);
    findings = { accountOldValueExposed: true, accountMetricsFalselyComplete: true, taskOldValueExposed: true,
      partialFirstFullFalselyReady: true, sharedGuardRejectsFailedTuple: true, otherWorkspaceAndMediaUnaffected: true,
      freshRawAloneStillMissing: true, freshRawPlusRecomputeRecovers: true };
  } finally {
    try { await client.query("ROLLBACK"); } finally { client.release(); }
  }
  const rolledBack = (await pool.query("SELECT NOT EXISTS(SELECT 1 FROM workspaces WHERE id=ANY($1::uuid[])) AS clean", [[ws, foreignWs]])).rows[0]?.clean === true;
  assert.equal(rolledBack, true, "Probe rows must be rolled back");
  console.log(JSON.stringify({ ...findings, rolledBack, productionCodeChanged: false }));
} finally { await pool.end(); }
