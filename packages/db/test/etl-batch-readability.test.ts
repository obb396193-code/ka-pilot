import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EtlRunRepository } from "../src/etl-run-repository.js";
import { EtlBatchFailureRepository } from "../src/etl-batch-failure-repository.js";
import { RawMetricsRepository } from "../src/raw-metrics-repository.js";
import { SemanticQueryRepository } from "../src/semantic-query-repository.js";
import { accountRealtimeDaySampleSql, etlBatchReadableSql } from "../src/etl-batch-readability.js";
import { runMigrations } from "../src/migrate.js";
import { PlatformPivotRepository } from "../src/platform-pivot-repository.js";
import { RuleEvidenceRepository } from "../src/rule-evidence-repository.js";

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
  beforeAll(async () => {
    const value = process.env.TEST_DATABASE_URL ?? "", url = new URL(value);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
    await runMigrations({ databaseUrl: value });
    pool = new Pool({ connectionString: value }); semantic = new SemanticQueryRepository(pool);
  }, 30_000);
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
    for (const table of ["alert_rules", "etl_runs", "jobs", "metrics_raw", "account_metrics_daily", "accounts", "workspaces"]) {
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
    expect(() => accountRealtimeDaySampleSql("raw; SELECT 1")).toThrow("Invalid readability alias");
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
  it("account hour samples never replace a day-level canonical merge input", async () => {
    const repository = new RawMetricsRepository(pool);
    await raw("account_realtime", { hh: 12 });
    await pool.query("UPDATE metrics_raw SET payload='{\"account_cost\":999}' WHERE workspace_id=$1 AND request_params ? 'hh'", [workspaceId]);
    expect((await repository.loadMergeInputs({ ...scope(), reportDate: ds })).map(row => row.realtime)).toEqual([{}]);
    await raw("account_realtime", { hh: 24 });
    await pool.query("UPDATE metrics_raw SET payload='{\"account_cost\":20}' WHERE workspace_id=$1 AND request_params->'hh'='24'::jsonb", [workspaceId]);
    expect(await repository.loadMergeInputs({ ...scope(), reportDate: ds })).toMatchObject([{ accountId: "a", realtime: { account_cost: 20 } }]);
  });
  it("account partial-hour or malformed samples cannot recover a failed day, even after recomputation", async () => {
    await fail();
    for (const hh of [0, 12, 23, "23", null, true, {}, 25]) {
      await raw("account_realtime", { hh });
      await pool.query("UPDATE account_metrics_daily SET computed_at=clock_timestamp() WHERE workspace_id=$1", [workspaceId]);
      await missing();
      expect(await new RawMetricsRepository(pool).loadMergeInputs({ ...scope(), reportDate: ds })).toEqual([]);
    }
    await raw("account_realtime", { hh: "24" });
    await missing();
    await pool.query("UPDATE account_metrics_daily SET computed_at=clock_timestamp() WHERE workspace_id=$1", [workspaceId]);
    expect((await semantic.querySummary(scope())).cost).toBe(20);
  });
  it("pivot retains failed expected rows as missing until matching Raw and canonical recomputation", async () => {
    const pivot = new PlatformPivotRepository(pool);
    const auth = { workspaceId, userId: randomUUID(), role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [
        { media: "KUAISHOU", accountId: "a", accessLevel: "read" },
        { media: "KUAISHOU", accountId: "b", accessLevel: "read" },
      ] } };
    const window = { from: ds, to: ds, preset: "custom" };
    expect((await pivot.read(auth, window)).members.map(row => row.observed)).toEqual([true, true]);
    const withheld = async () => {
      const result = await pivot.read(auth, window);
      expect(result.observation).toMatchObject({ expectedAccountDays: 2, observedAccountDays: 1, observedAccounts: 1 });
      expect(result.members.map(row => [row.accountId, row.observed, row.metrics.cost.value, row.computedAt === null]))
        .toEqual([["a", false, null, true], ["b", true, 10, false]]);
    };
    await fail(); await withheld();
    const otherMedium = { ...auth, scope: { ...auth.scope, accounts: [
      { media: "TENCENT", accountId: "a", accessLevel: "read" },
    ] } };
    expect((await pivot.read(otherMedium, window)).members[0]).toMatchObject({ observed: true, metrics: { cost: { value: 10 } } });
    expect((await pivot.read({ ...auth, workspaceId: foreignId }, window)).members.map(row => row.observed)).toEqual([true, true]);
    await raw(); await withheld();
    await pool.query("UPDATE account_metrics_daily SET computed_at=clock_timestamp() WHERE workspace_id=$1", [workspaceId]);
    expect((await pivot.read(auth, window)).members.map(row => row.observed)).toEqual([true, true]);
  });
  it("rule evidence becomes undeterminable for a failed day and recovers only after recomputation", async () => {
    await pool.query("UPDATE account_metrics_daily SET cash_cost=10 WHERE workspace_id=$1", [workspaceId]);
    const rule = await pool.query(`INSERT INTO alert_rules(workspace_id,name,scope,condition_tree)
      VALUES($1,'synthetic failed batch rule','{}',$2) RETURNING id::text`,
    [workspaceId, { version: "v1", all: [{ metric: "cash_cost", operator: ">", threshold: 5 }] }]);
    const auth = { workspaceId, userId: randomUUID(), role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "a", accessLevel: "read" }] } };
    const target = { ruleId: rule.rows[0].id, media: "KUAISHOU", accountId: "a", ds };
    const evidence = new RuleEvidenceRepository(pool), window = { from: ds, to: ds, preset: "custom" };
    expect(await evidence.read(auth, target, window)).toMatchObject({ evaluation: { pass: true } });
    await fail();
    const missing = async () => {
      expect(await evidence.read(auth, target, window)).toMatchObject({
        evaluation: { pass: null, reason: "METRIC_MISSING" },
        evidence: { observation: { expectedAccountDays: 1, observedAccountDays: 0 }, members: [
          { observed: false, metrics: { cashCost: { value: null, availability: "missing" } } },
        ] },
      });
    };
    await missing(); await raw(); await missing();
    await pool.query("UPDATE account_metrics_daily SET computed_at=clock_timestamp() WHERE workspace_id=$1", [workspaceId]);
    expect(await evidence.read(auth, target, window)).toMatchObject({ evaluation: { pass: true } });
  });
  it("removing only the pivot readability predicate exposes the failed old value (negative control)", async () => {
    await fail();
    let removed = 0;
    const unmasked = new PlatformPivotRepository({ connect: async () => {
      const client = await pool.connect();
      return { on: client.on.bind(client), removeListener: client.removeListener.bind(client), release: client.release.bind(client),
        query: async (sql: string, values?: unknown[]) => {
          if (sql.includes("platform-pivot-members")) {
            const predicate = etlBatchReadableSql("metric");
            expect(sql).toContain(predicate);
            sql = sql.replace(predicate, "TRUE"); removed++;
          }
          return client.query(sql, values);
        },
      };
    } } as never);
    const auth = { workspaceId, userId: randomUUID(), role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "a", accessLevel: "read" }] } };
    const result = await unmasked.read(auth, { from: ds, to: ds, preset: "custom" });
    expect(removed).toBe(1);
    expect(result.members[0]).toMatchObject({ observed: true, metrics: { cost: { value: 10 } } });
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
