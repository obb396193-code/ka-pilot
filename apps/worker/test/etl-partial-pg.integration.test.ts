import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EtlRunRepository, RawMetricsRepository, MetricsRepository, EtlBatchFailureRepository, runMigrations, type JobRecord, type NewJob } from "@ka/db";
import { etlBatchReadableSql } from "../../../packages/db/src/etl-batch-readability.js";
import { createFullEtlHandler } from "../src/etl/full-handler.js";
import { createIncrementalEtlHandler } from "../src/etl/incr-handler.js";
import { createCanonicalHandler } from "../src/etl/canonical-handler.js";
import { QihangClient } from "../src/qihang/client.js";
const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated local synthetic DB required");
describe("P176 fake-fetch → full/incr → fenced PG ledger → raw → canonical", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 }), ws = randomUUID(), foreign = randomUUID();
  const accounts = Array.from({ length: 51 }, (_, i) => `synthetic-${i}`), day = "2026-09-10";
  const runs = new EtlRunRepository(pool), raw = new RawMetricsRepository(pool), metrics = new MetricsRepository(pool);
  const store = { startRun: runs.startRun.bind(runs), appendRaw: raw.appendRaw.bind(raw),
    syncAccountMetadataAndRaw: raw.syncAccountMetadataAndRaw.bind(raw), recordObservation: (id: string, o: object) => runs.recordObservation(id, { ...o }),
    finishRun: runs.finishRun.bind(runs), failRun: runs.failRun.bind(runs) };
  const queued: NewJob[] = [], jobs = { enqueue: async (j: NewJob) => { queued.push(j); return j.id ?? randomUUID(); } };
  let fail = true, failedRequests = 0;
  const qihang = new QihangClient({ sleep: async () => {}, fetchFn: async input => {
    const p = new URL(String(input)).searchParams, resource = p.get("resource"), ids = (p.get("accountIds") ?? "").split(",");
    if (resource === "account_realtime" && ids[0] === accounts[0] && fail) { failedRequests++; return new Response("temporary invalid JSON", { status: 200 }); }
    const data = resource === "account" ? { rows: accounts.slice((Number(p.get("pageNum")) - 1) * 50, Number(p.get("pageNum")) * 50).map(account_id => ({ account_id, account_name: "synthetic" })), totalNum: 51 }
      : resource === "account_offline" ? [] : ids.map(account_id => ({ account_id, ds: "20260910", account_cost: 10, account_real_conversion: 1, last_sync_time: "2026-09-10 12:00:00" }));
    return new Response(JSON.stringify({ successful: true, data }), { status: 200 });
  } });
  async function claimed(jobType: string, payload: Record<string, unknown>): Promise<JobRecord> {
    const id = randomUUID(), leaseToken = randomUUID();
    await pool.query(`INSERT INTO jobs(id,workspace_id,job_type,payload,status,lease_token,lease_until,attempts)
      VALUES($1,$2,$3,$4,'leased',$5,now()+interval '10 minutes',1)`, [id, ws, jobType, payload, leaseToken]);
    return { id, workspaceId: ws, jobType, payload, status: "leased", leaseToken, leaseUntil: new Date("2099-01-01"), attempts: 1, maxAttempts: 3, priority: 1, credentialOwnerUserId: null, runAfter: new Date() };
  }
  async function merge() {
    const enqueue = queued.filter(j => j.jobType === "canonical_merge").at(-1); if (!enqueue) throw new Error("No canonical job");
    await createCanonicalHandler({ runs, jobs, store: { loadMergeInputs: raw.loadMergeInputs.bind(raw),
      loadEffectiveSettingsBatch: metrics.loadEffectiveSettingsBatch.bind(metrics), loadHistoricalSpendBatch: metrics.loadHistoricalSpendBatch.bind(metrics),
      upsertCanonicalBatch: metrics.upsertCanonicalBatch.bind(metrics) } })(await claimed("canonical_merge", enqueue.payload));
  }
  const readable = async (workspace = ws) => (await pool.query(`SELECT account_id,${etlBatchReadableSql("m")} AS readable,cost
    FROM account_metrics_daily m WHERE workspace_id=$1 AND ds=$2 ORDER BY account_id COLLATE "C"`, [workspace, day])).rows;
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic'),($2,'synthetic foreign')", [ws, foreign]);
    for (const workspace of [ws, foreign]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2)", [workspace, accounts[0]]);
      await pool.query("INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,computed_at) VALUES($1,'KUAISHOU',$2,$3,999,'2026-09-01')", [workspace, accounts[0], day]);
    }
  });
  afterAll(async () => {
    for (const table of ["account_metrics_daily", "metrics_raw", "etl_runs", "jobs", "accounts"]) await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [[ws, foreign]]);
    await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [[ws, foreign]]); await pool.end();
  });
  it("only failed50 are masked; later incr+actual canonical restores them without deleting failure history", async () => {
    await createFullEtlHandler({ qihang, store, jobs, failures: new EtlBatchFailureRepository(pool) })(await claimed("etl_full", {
      workspaceId: ws, userId: "synthetic-only", media: "KUAISHOU", accountIds: accounts, asOfDate: day, realtimeDays: 1 }));
    expect(failedRequests).toBe(4);
    const full = (await pool.query("SELECT scope,status FROM etl_runs WHERE workspace_id=$1 AND run_kind='full'", [ws])).rows[0];
    expect(full.status).toBe("done"); expect(full.scope.batchFailures).toHaveLength(1); expect(full.scope.batchFailures[0].accountIds).toHaveLength(50);
    await merge();
    expect(await readable()).toEqual([expect.objectContaining({ account_id: accounts[0], readable: false }), expect.objectContaining({ account_id: accounts[50], readable: true, cost: "10" })]);
    expect(await readable(foreign)).toEqual([expect.objectContaining({ readable: true, cost: "999" })]);
    fail = false;
    await createIncrementalEtlHandler({ qihang, store, jobs, failures: new EtlBatchFailureRepository(pool), hourly: { upsertHourly: async () => {} } })(await claimed("etl_incr", {
      workspaceId: ws, userId: "synthetic-only", media: "KUAISHOU", accountIds: accounts, ds: day, offlineReconcileDays: 0 }));
    expect((await readable()).find(r => r.account_id === accounts[0])?.readable).toBe(false);
    await merge();
    const recovered = await readable(); expect(recovered).toHaveLength(51); expect(recovered.every(r => r.readable && r.cost === "10")).toBe(true);
    expect((await pool.query("SELECT jsonb_array_length(scope->'batchFailures') AS n FROM etl_runs WHERE workspace_id=$1 AND run_kind='full'", [ws])).rows[0].n).toBe(1);
  }, 30000);
});
