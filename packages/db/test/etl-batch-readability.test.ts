import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EtlRunRepository } from "../src/etl-run-repository.js";
import { EtlBatchFailureRepository } from "../src/etl-batch-failure-repository.js";
import { RawMetricsRepository } from "../src/raw-metrics-repository.js";
import { SemanticQueryRepository } from "../src/semantic-query-repository.js";
import { etlBatchReadableSql } from "../src/etl-batch-readability.js";

// Synthetic local PG only. Each test owns its workspace; no shared table cleanup.
describe("failed tuple-day readability / real PG", () => {
  let pool: Pool, workspaceId: string, foreignId: string, jobId: string, leaseToken: string, runId: string;
  let semantic: SemanticQueryRepository;
  const ds = "2026-09-09";
  const scope = () => ({ workspaceId, dateFrom: ds, dateTo: ds,
    filters: { accountScopes: [{ media: "KUAISHOU", accountId: "a" }, { media: "KUAISHOU", accountId: "b" }] } });
  const fail = (resource = "account_realtime", filters?: unknown) => new EtlBatchFailureRepository(pool).record({
    workspaceId, jobId, leaseToken, runId,
    warning: { code: "BATCH_FAILED", resource, ds, accountIds: ["a"], fingerprint: "a".repeat(64) },
    ...(filters === undefined ? {} : { filters }),
  });
  const raw = (resource = "account_realtime", params: unknown = {}, media = "KUAISHOU", ws = workspaceId, date = ds) => pool.query(
    `INSERT INTO metrics_raw(workspace_id,media,account_id,ds,resource,source,request_params,payload,fetched_at)
     VALUES($1,$2,'a',$3,$4,'realtime',$5,'{}',clock_timestamp())`, [ws, media, date, resource, params]);
  beforeAll(() => {
    const value = process.env.TEST_DATABASE_URL ?? "", url = new URL(value);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
    pool = new Pool({ connectionString: value }); semantic = new SemanticQueryRepository(pool);
  });
  beforeEach(async () => {
    workspaceId = randomUUID(); foreignId = randomUUID(); jobId = randomUUID(); leaseToken = randomUUID();
    for (const ws of [workspaceId, foreignId]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic read fencing')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) for (const id of ["a", "b"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id,status) VALUES($1,$2,$3,'active')", [ws, media, id]);
        await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cost,real_conversion,computed_at)
          VALUES($1,$2,$3,$4,10,1,clock_timestamp()-interval '1 day')`, [ws, media, id, ds]);
      }
    }
    await raw();
    await pool.query(`UPDATE metrics_raw SET fetched_at=clock_timestamp()-interval '2 days' WHERE workspace_id=$1`, [workspaceId]);
    await pool.query(`INSERT INTO jobs(id,workspace_id,job_type,payload,status,lease_token,lease_until,attempts)
      VALUES($1,$2,'etl_full',$3,'leased',$4,clock_timestamp()+interval '10 minutes',1)`, [jobId, workspaceId, { media: "KUAISHOU", accountIds: ["a", "b"] }, leaseToken]);
    runId = await new EtlRunRepository(pool).startRun(jobId, "full", {
      workspaceId, execution: { version: "etl-attempt/v1", jobId, workspaceId, jobType: "etl_full", attempt: 1 },
      batchScope: { workspaceId, media: "KUAISHOU", accountIds: ["a", "b"], dateFrom: ds, dateTo: ds },
    });
  });
  afterEach(async () => {
    for (const table of ["etl_runs", "jobs", "metrics_raw", "account_metrics_daily", "accounts", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, foreignId]]);
    }
  });
  afterAll(async () => { await pool?.end(); });
  const missing = async () => {
    expect(await semantic.querySummary(scope())).toMatchObject({ cost: null, realConversion: null, rowCount: 1 });
    expect(await semantic.queryTable(scope())).toMatchObject({ total: 1, rows: [{ accountId: "b" }] });
    expect(await semantic.queryLineage(scope())).toMatchObject({ canonicalRows: 1, requestedAccountDays: 2, returnedAccountDays: 1 });
  };
  it("does not allow SQL alias injection", () => {
    expect(() => etlBatchReadableSql("metric; SELECT 1")).toThrow("Invalid readability alias");
  });
  it("hides stale Raw/Canonical but keeps expected missing days and tuple isolation", async () => {
    expect((await semantic.querySummary(scope())).cost).toBe(20);
    await fail(); await missing();
    expect(await new RawMetricsRepository(pool).loadMergeInputs({ ...scope(), reportDate: ds })).toEqual([]);
    expect((await semantic.queryTrend(scope()))[0]?.metrics.cost).toBeNull();
    expect((await semantic.queryDimension({ ...scope(), dimension: "account" })).find(r => r.dimensionKey === "a")?.metrics.cost).toBeNull();
    expect((await semantic.queryHealth(scope())).coverage).toMatchObject({ canonicalRows: 1, expectedAccountDays: 2, missingAccountDays: 1 });
    expect((await semantic.querySummary({ ...scope(), filters: { accountScopes: [{ media: "TENCENT", accountId: "a" }] } })).cost).toBe(10);
    expect((await semantic.querySummary({ ...scope(), workspaceId: foreignId })).cost).toBe(20);
    expect((await pool.query("SELECT count(*) FROM account_metrics_daily WHERE workspace_id=$1", [workspaceId])).rows[0].count).toBe("4");
  });
  it("fresh matching Raw restores merge inputs, not old canonical; recompute restores readability", async () => {
    await fail(); await raw(); await missing();
    expect(await new RawMetricsRepository(pool).loadMergeInputs({ ...scope(), reportDate: ds })).toMatchObject([{ accountId: "a", realtime: {} }]);
    await pool.query("UPDATE account_metrics_daily SET computed_at=clock_timestamp() WHERE workspace_id=$1", [workspaceId]);
    expect((await semantic.querySummary(scope())).cost).toBe(20);
  });
  it("wrong resource/date/media/workspace cannot resolve a failed account request", async () => {
    await fail();
    await raw("account_offline"); await raw("account_realtime", {}, "TENCENT");
    await raw("account_realtime", {}, "KUAISHOU", foreignId); await raw("account_realtime", {}, "KUAISHOU", workspaceId, "2026-09-08");
    await pool.query("UPDATE account_metrics_daily SET computed_at=clock_timestamp() WHERE workspace_id=$1", [workspaceId]);
    await missing();
  });
  it("ad hour and subset must cover the failed request before recomputation can restore the day", async () => {
    await fail("ad_realtime", { hh: 14, adIds: ["ad-a", "ad-b"] });
    for (const params of [{ hh: 13 }, { hh: 14, adIds: ["ad-a"] }, { hh: 15, adIds: ["ad-other"] }]) {
      await raw("ad_realtime", params);
      await pool.query("UPDATE account_metrics_daily SET computed_at=clock_timestamp() WHERE workspace_id=$1", [workspaceId]);
      await missing();
    }
    await raw("ad_realtime", { hh: 14, adIds: ["ad-b", "ad-a"] }); await missing();
    await pool.query("UPDATE account_metrics_daily SET computed_at=clock_timestamp() WHERE workspace_id=$1", [workspaceId]);
    expect((await semantic.querySummary(scope())).cost).toBe(20);
  });
  it("full-day/all-ad failure cannot be cleared by a narrow query; idempotency includes private filters", async () => {
    await fail("ad_realtime");
    await expect(fail("ad_realtime", { hh: 14 })).rejects.toThrow();
    for (const params of [{ hh: 23 }, { hh: 24, adIds: ["ad-a"] }, { hh: 25 }, { hh: null }, { adIds: null }]) {
      await raw("ad_realtime", params);
      await pool.query("UPDATE account_metrics_daily SET computed_at=clock_timestamp() WHERE workspace_id=$1", [workspaceId]);
      await missing();
    }
    await raw("ad_realtime");
    await pool.query("UPDATE account_metrics_daily SET computed_at=clock_timestamp() WHERE workspace_id=$1", [workspaceId]);
    expect((await semantic.querySummary(scope())).cost).toBe(20);
  });
  it("done/failed run status does not discard failure evidence, malformed ledger never becomes ready", async () => {
    await fail();
    for (const status of ["done", "failed"]) {
      await pool.query("UPDATE etl_runs SET status=$2 WHERE id=$1", [runId, status]);
      await missing();
    }
    await pool.query("UPDATE etl_runs SET scope=jsonb_set(scope,'{batchFailures}','null') WHERE id=$1", [runId]);
    await expect(semantic.querySummary(scope())).rejects.toThrow();
  });
});
