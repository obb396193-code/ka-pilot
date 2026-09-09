import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { EtlRunRepository } from "../src/etl-run-repository.js";
import { EtlBatchFailureRepository } from "../src/etl-batch-failure-repository.js";

// Real PG; synthetic isolated workspaces, never media/production data.
describe("fenced batch warning ledger / real PG", () => {
  let pool: Pool, repo: EtlBatchFailureRepository, workspaceId: string, jobId: string, leaseToken: string, runId: string;
  const warning = { code: "BATCH_FAILED" as const, resource: "account_realtime" as const, ds: "2026-09-09", accountIds: ["a"], fingerprint: "a".repeat(64) };
  const input = () => ({ workspaceId, jobId, leaseToken, runId, warning });
  beforeAll(async () => {
    const value = process.env.TEST_DATABASE_URL ?? "", url = new URL(value);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
    await runMigrations({ databaseUrl: value }); // arch 2026-09-10：套件自己跑迁移，不依赖别的套件先跑（空库/乱序都要绿）
    pool = new Pool({ connectionString: value, max: 4 }); repo = new EtlBatchFailureRepository(pool);
  });
  beforeEach(async () => {
    workspaceId = randomUUID(); jobId = randomUUID(); leaseToken = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic batch warnings')", [workspaceId]);
    await pool.query(`INSERT INTO jobs(id,workspace_id,job_type,payload,status,lease_token,lease_until,attempts)
      VALUES($1,$2,'etl_full',$3,'leased',$4,now()+interval '10 minutes',1)`, [jobId, workspaceId, { media: "KUAISHOU", accountIds: ["a", "b"] }, leaseToken]);
    runId = await new EtlRunRepository(pool).startRun(jobId, "full", {
      workspaceId, execution: { version: "etl-attempt/v1", jobId, workspaceId, jobType: "etl_full", attempt: 1 },
      batchScope: { workspaceId, media: "KUAISHOU", accountIds: ["a", "b"], dateFrom: "2026-09-01", dateTo: "2026-09-09" },
      observations: [{ resource: "account_realtime", rowCount: 1 }],
    });
  });
  afterEach(async () => {
    await pool.query("DELETE FROM etl_runs WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM jobs WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
  });
  afterAll(async () => { await pool?.end(); });
  const snapshot = async () => (await pool.query("SELECT scope,status,rows_ingested FROM etl_runs WHERE id=$1", [runId])).rows[0];
  it("records only typed failure evidence, keeps observations/state and replays idempotently", async () => {
    const before = await snapshot();
    expect(await repo.record(input())).toEqual({ recorded: true });
    const after = await snapshot();
    expect(after.status).toBe("running"); expect(after.rows_ingested).toBe(0);
    expect(after.scope.observations).toEqual(before.scope.observations);
    expect(after.scope.batchFailures).toEqual([{ ...warning, media: "KUAISHOU", failedAt: expect.any(String) }]);
    expect(await repo.record(input())).toEqual({ recorded: false }); expect(await snapshot()).toEqual(after);
    await new EtlRunRepository(pool).finishRun(runId, 7);
    expect((await snapshot()).scope.batchFailures).toEqual(after.scope.batchFailures);
    await expect(repo.record(input())).rejects.toThrow("ETL batch failure could not be recorded");
  });
  it("concurrent distinct and repeated warnings do not lose data or duplicate facts", async () => {
    const second = { ...input(), warning: { ...warning, accountIds: ["b"], fingerprint: "b".repeat(64) } };
    const results = await Promise.all([repo.record(input()), repo.record(second), repo.record(input()), repo.record(second)]);
    expect(results.filter(r => r.recorded)).toHaveLength(2);
    expect((await snapshot()).scope.batchFailures).toHaveLength(2);
  });
  it.each(["foreign-workspace", "foreign-job", "old-lease", "old-attempt", "other-media", "expired-lease", "queued-job", "unscoped-run", "out-of-account", "out-of-date", "private-field", "bad-history"])("rejects %s with no mutation", async scenario => {
    const candidate = structuredClone(input());
    if (scenario === "foreign-workspace") candidate.workspaceId = randomUUID();
    if (scenario === "foreign-job") candidate.jobId = randomUUID();
    if (scenario === "old-lease") candidate.leaseToken = randomUUID();
    if (scenario === "old-attempt") await pool.query("UPDATE jobs SET attempts=2 WHERE id=$1", [jobId]);
    if (scenario === "other-media") await pool.query("UPDATE jobs SET payload=jsonb_set(payload,'{media}','\"TENCENT\"') WHERE id=$1", [jobId]);
    if (scenario === "expired-lease") await pool.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [jobId]);
    if (scenario === "queued-job") await pool.query("UPDATE jobs SET status='queued',lease_token=NULL,lease_until=NULL WHERE id=$1", [jobId]);
    if (scenario === "unscoped-run") await pool.query("UPDATE etl_runs SET scope=scope-'batchScope' WHERE id=$1", [runId]);
    if (scenario === "out-of-account") candidate.warning.accountIds = ["not-authorized"];
    if (scenario === "out-of-date") candidate.warning.ds = "2026-09-10";
    if (scenario === "private-field") Object.assign(candidate.warning, { userId: "synthetic-private" });
    if (scenario === "bad-history") await pool.query("UPDATE etl_runs SET scope=jsonb_set(scope,'{batchFailures}','null') WHERE id=$1", [runId]);
    const before = await snapshot();
    await expect(repo.record(candidate)).rejects.toThrow("ETL batch failure could not be recorded");
    expect(await snapshot()).toEqual(before);
  });
  it("same fingerprint with different scope facts is a conflict, never an overwritten warning", async () => {
    await repo.record(input()); const before = await snapshot();
    await expect(repo.record({ ...input(), warning: { ...warning, accountIds: ["b"] } })).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });
  it("rolls back after the actual UPDATE when commit transport fails", async () => {
    const client = await pool.connect(); let didUpdate = false;
    const failing = new EtlBatchFailureRepository({ connect: async () => ({
      query: async (sql: string, values?: unknown[]) => {
        if (sql === "COMMIT") throw new Error("synthetic-private-driver");
        const result = await client.query(sql, values); if (sql.includes("UPDATE etl_runs")) didUpdate = true; return result;
      }, release: () => client.release(),
    }) } as unknown as Pool);
    const before = await snapshot(); await expect(failing.record(input())).rejects.toThrow("ETL batch failure could not be recorded");
    expect(didUpdate).toBe(true); expect(await snapshot()).toEqual(before);
  });
  it("accepts exactly 10000 known records for replay, but rejects the 10001st", async () => {
    const evidence = Array.from({ length: 10000 }, (_, i) => ({ ...warning, media: "KUAISHOU", failedAt: "2026-09-09T00:00:00.000Z", fingerprint: i.toString(16).padStart(64, "0") }));
    await pool.query("UPDATE etl_runs SET scope=jsonb_set(scope,'{batchFailures}',$2) WHERE id=$1", [runId, JSON.stringify(evidence)]);
    expect(await repo.record({ ...input(), warning: { ...warning, fingerprint: evidence[0]!.fingerprint } })).toEqual({ recorded: false });
    await expect(repo.record(input())).rejects.toThrow();
    expect((await snapshot()).scope.batchFailures).toHaveLength(10000);
  });
  it.each([0, -80])("rejects existing/exceed-on-append JSONB 16MiB boundary offset %s atomically", async offset => {
    const max = 16 * 1024 * 1024;
    await pool.query("UPDATE etl_runs SET scope=scope || jsonb_build_object('padding','') WHERE id=$1", [runId]);
    const size = (await pool.query("SELECT octet_length(scope::text) AS size FROM etl_runs WHERE id=$1", [runId])).rows[0].size as number;
    await pool.query("UPDATE etl_runs SET scope=jsonb_set(scope,'{padding}',to_jsonb(repeat('x',$2::integer))) WHERE id=$1", [runId, max + offset - size]);
    await expect(repo.record(input())).rejects.toThrow();
    const result = (await pool.query("SELECT octet_length(scope::text) AS size,scope ? 'batchFailures' AS changed FROM etl_runs WHERE id=$1", [runId])).rows[0];
    expect(result).toEqual({ size: max + offset, changed: false });
  });
  it("rechecks the lease clock at UPDATE, not just before potentially waiting for a row lock", async () => {
    const client = await pool.connect(); let reachedWrite = false;
    const wrapper = new EtlBatchFailureRepository({ connect: async () => ({
      query: async (sql: string, values?: unknown[]) => {
        if (sql.includes("UPDATE etl_runs")) {
          reachedWrite = true;
          await client.query("UPDATE jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [jobId]);
        }
        return client.query(sql, values);
      }, release: () => client.release(),
    }) } as unknown as Pool);
    const before = await snapshot(); await expect(wrapper.record(input())).rejects.toThrow();
    expect(reachedWrite).toBe(true); expect(await snapshot()).toEqual(before);
  });
});
