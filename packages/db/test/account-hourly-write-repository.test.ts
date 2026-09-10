import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountHourlyWriteRepository } from "../src/account-hourly-write-repository.js";
import { EtlRunRepository } from "../src/etl-run-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic DB required");
describe("atomic account hourly evidence / real PG", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 }), repo = new AccountHourlyWriteRepository(pool);
  let ws: string, owner: string, jobId: string, lease: string, runId: string;
  const input = (cost = 10, sampledAt = "2026-09-10T02:05:00Z") => ({
    workspaceId: ws, jobId, leaseToken: lease, runId, media: "KUAISHOU", accountIds: ["a", "b"],
    ds: "2026-09-10", hh: 9, sampledAt, sourceUtcOffset: "+08:00",
    rows: [{ workspaceId: ws, media: "KUAISHOU", accountId: "a", ds: "2026-09-10", hh: 9,
      cost, exposure: null, click: 0, conversion: 0, realConversion: null, budget: null,
      lastSyncTime: "2026-09-10T02:02:00Z", sampledAt, complete: true, sourceRunId: runId }],
    rawRows: [{ account_id: "a", ds: "20260910", account_cost: cost, account_click: 0, account_conversion: 0, last_sync_time: "2026-09-10 10:02:00" }],
  });
  const counts = async () => (await pool.query(`SELECT
    (SELECT count(*)::int FROM account_metrics_hourly WHERE workspace_id=$1) hourly,
    (SELECT count(*)::int FROM metrics_raw WHERE workspace_id=$1) raw`, [ws])).rows[0];
  beforeAll(async () => { await runMigrations({ databaseUrl }); }, 30000);
  beforeEach(async () => {
    ws = randomUUID(); owner = randomUUID(); jobId = randomUUID(); lease = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic hourly writer')", [ws]);
    await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic owner')", [owner, ws]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','a'),($1,'KUAISHOU','b'),($1,'TENCENT','a')", [ws]);
    await pool.query(`INSERT INTO jobs(id,workspace_id,job_type,payload,status,lease_token,lease_until,attempts,credential_owner_user_id)
      VALUES($1,$2,'etl_incr',$3,'running',$4,clock_timestamp()+interval '10 minutes',1,$5)`,
    [jobId, ws, { workspaceId: ws, ds: "2026-09-10", media: "KUAISHOU", accountIds: ["a", "b"], hh: 9 }, lease, owner]);
    runId = await new EtlRunRepository(pool).startRun(jobId, "incr", { workspaceId: ws, ds: "2026-09-10", accountIds: ["a", "b"],
      execution: { version: "etl-attempt/v1", jobType: "etl_incr", jobId, workspaceId: ws, attempt: 1 } });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const table of ["account_metrics_hourly", "metrics_raw", "etl_runs", "jobs", "accounts", "users"])
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [ws]);
    await pool.query("DELETE FROM workspaces WHERE id=$1", [ws]);
  });
  afterAll(async () => { await pool.end(); });

  it("writes raw + snapshot together, keeps missing/zero and provenance", async () => {
    expect(await repo.persist(input())).toEqual({ rawRows: 1, writtenRows: 1 });
    expect(await counts()).toEqual({ hourly: 1, raw: 1 });
    const raw = (await pool.query("SELECT resource,source,request_params,payload,fetched_by_user FROM metrics_raw WHERE workspace_id=$1", [ws])).rows[0];
    expect(raw).toEqual({ resource: "account_realtime", source: "realtime", fetched_by_user: owner,
      request_params: { media: "KUAISHOU", ds: "20260910", hh: 9, accountIds: ["a", "b"] }, payload: input().rawRows[0] });
    const hourly = (await pool.query("SELECT account_id,media,cost::text,exposure,click::text,complete,source_run_id::text FROM account_metrics_hourly WHERE workspace_id=$1", [ws])).rows;
    expect(hourly).toEqual([{ account_id: "a", media: "KUAISHOU", cost: "10", exposure: null, click: "0", complete: true, source_run_id: runId }]);
  });
  it("replays without duplicating snapshots and ignores late old sampling, retains raw history", async () => {
    await repo.persist(input());
    expect(await repo.persist(input())).toEqual({ writtenRows: 0, rawRows: 1 });
    await repo.persist(input(20, "2026-09-10T02:07:00Z"));
    expect(await repo.persist(input(11, "2026-09-10T02:06:00Z"))).toEqual({ writtenRows: 0, rawRows: 1 });
    expect((await pool.query("SELECT cost::text FROM account_metrics_hourly WHERE workspace_id=$1", [ws])).rows[0]?.cost).toBe("20");
    expect(await counts()).toEqual({ hourly: 1, raw: 4 });
  });
  it("serializes concurrent samples and never regresses source sync time", async () => {
    await Promise.all([repo.persist(input(30, "2026-09-10T02:08:00Z")), repo.persist(input(20, "2026-09-10T02:07:00Z"))]);
    const olderSource = input(40, "2026-09-10T02:09:00Z"); olderSource.rows[0]!.lastSyncTime = "2026-09-10T01:59:00Z";
    olderSource.rawRows[0]!.last_sync_time = "2026-09-10 09:59:00";
    expect((await repo.persist(olderSource)).writtenRows).toBe(0);
    expect((await pool.query("SELECT cost::text FROM account_metrics_hourly WHERE workspace_id=$1", [ws])).rows[0]?.cost).toBe("30");
  });
  it.each(["foreign-workspace", "other-media", "other-account", "expired", "wrong-token", "old-attempt", "not-running", "finished-run", "owner-missing", "owner-inactive", "team", "scope-date", "scope-accounts", "unrequested-hour"])("rejects %s before writing", async scenario => {
    const value = input();
    if (scenario === "foreign-workspace") { value.workspaceId = randomUUID(); value.rows[0]!.workspaceId = value.workspaceId; }
    if (scenario === "other-media") { value.media = "TENCENT"; value.rows[0]!.media = "TENCENT"; }
    if (scenario === "other-account") { value.accountIds = ["c"]; value.rows[0]!.accountId = "c"; value.rawRows[0]!.account_id = "c"; }
    if (scenario === "expired") await pool.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [jobId]);
    if (scenario === "wrong-token") value.leaseToken = randomUUID();
    if (scenario === "old-attempt") await pool.query("UPDATE jobs SET attempts=2 WHERE id=$1", [jobId]);
    if (scenario === "not-running") await pool.query("UPDATE jobs SET status='done',lease_token=NULL,lease_until=NULL WHERE id=$1", [jobId]);
    if (scenario === "finished-run") await pool.query("UPDATE etl_runs SET status='done' WHERE id=$1", [runId]);
    if (scenario === "owner-missing") await pool.query("UPDATE jobs SET credential_owner_user_id=NULL WHERE id=$1", [jobId]);
    if (scenario === "owner-inactive") await pool.query("UPDATE users SET is_active=false WHERE id=$1", [owner]);
    if (scenario === "team") await pool.query("UPDATE workspaces SET kind='team' WHERE id=$1", [ws]);
    if (scenario === "scope-date") await pool.query("UPDATE etl_runs SET scope=jsonb_set(scope,'{ds}','\"2026-09-09\"') WHERE id=$1", [runId]);
    if (scenario === "scope-accounts") await pool.query("UPDATE etl_runs SET scope=jsonb_set(scope,'{accountIds}','[\"c\"]') WHERE id=$1", [runId]);
    if (scenario === "unrequested-hour") await pool.query("UPDATE jobs SET payload=jsonb_set(payload,'{hh}','3') WHERE id=$1", [jobId]);
    await expect(repo.persist(value)).rejects.toThrow("Account hourly sample could not be stored");
    expect(await counts()).toEqual({ hourly: 0, raw: 0 });
  });
  it("does not invent rows for an empty response", async () => {
    expect(await repo.persist({ ...input(), rows: [], rawRows: [] })).toEqual({ writtenRows: 0, rawRows: 0 });
    expect(await counts()).toEqual({ hourly: 0, raw: 0 });
  });
  it("cannot overwrite same-number accounts in another media or workspace", async () => {
    const foreign = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'foreign hourly fixture')", [foreign]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','a')", [foreign]);
    try {
      await pool.query(`INSERT INTO account_metrics_hourly(workspace_id,media,account_id,ds,hh,cost,last_sync_time,sampled_at,complete)
        VALUES($1,'TENCENT','a','2026-09-10',9,99,now(),now(),true),($2,'KUAISHOU','a','2026-09-10',9,88,now(),now(),true)`, [ws, foreign]);
      await repo.persist(input());
      expect((await pool.query("SELECT cost::text FROM account_metrics_hourly WHERE workspace_id=$1 AND media='TENCENT'", [ws])).rows[0]?.cost).toBe("99");
      expect((await pool.query("SELECT cost::text FROM account_metrics_hourly WHERE workspace_id=$1", [foreign])).rows[0]?.cost).toBe("88");
      expect((await pool.query("SELECT count(*)::int n FROM metrics_raw WHERE workspace_id=$1", [foreign])).rows[0]?.n).toBe(0);
    } finally {
      await pool.query("DELETE FROM account_metrics_hourly WHERE workspace_id=$1", [foreign]);
      await pool.query("DELETE FROM accounts WHERE workspace_id=$1", [foreign]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [foreign]);
    }
  });
  it("does not observe caller mutation after beginning credential/lease IO", async () => {
    const value = input(), connect = pool.connect.bind(pool);
    vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
      value.rows[0]!.cost = 999; value.rawRows[0]!.account_cost = 999;
      value.accountIds = ["out-of-scope"]; value.workspaceId = randomUUID();
      return connect();
    });
    await repo.persist(value);
    expect((await pool.query("SELECT cost::text FROM account_metrics_hourly WHERE workspace_id=$1", [ws])).rows[0]?.cost).toBe("10");
  });
  it("destroys the connection when rollback itself fails and redacts original errors", async () => {
    const release = vi.fn(), query = vi.fn().mockRejectedValue(new Error("synthetic-private-sql"));
    const broken = new AccountHourlyWriteRepository({ connect: async () => ({ query, release }) } as unknown as Pool);
    await expect(broken.persist(input())).rejects.toThrow("Account hourly sample could not be stored");
    expect(query).toHaveBeenLastCalledWith("ROLLBACK"); expect(release).toHaveBeenCalledWith(true);
  });
  it("rolls back raw writes if the snapshot fails", async () => {
    const client = await pool.connect(); let rawWritten = false;
    const failed = new AccountHourlyWriteRepository({ connect: async () => ({
      query: async (sql: string, values?: unknown[]) => {
        if (sql.includes("INSERT INTO account_metrics_hourly")) throw new Error("synthetic-private-driver-details");
        const result = await client.query(sql, values); if (sql.includes("INSERT INTO metrics_raw")) rawWritten = true; return result;
      }, release: () => client.release(),
    }) } as unknown as Pool);
    await expect(failed.persist(input())).rejects.toThrow("Account hourly sample could not be stored");
    expect(rawWritten).toBe(true); expect(await counts()).toEqual({ hourly: 0, raw: 0 });
  });
  it("rechecks expired lease after writes and rolls both back", async () => {
    const client = await pool.connect(); let hourlyWritten = false;
    const expired = new AccountHourlyWriteRepository({ connect: async () => ({
      query: async (sql: string, values?: unknown[]) => {
        const result = await client.query(sql, values);
        if (sql.includes("INSERT INTO account_metrics_hourly")) {
          hourlyWritten = true;
          await client.query("UPDATE jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [jobId]);
        }
        return result;
      }, release: () => client.release(),
    }) } as unknown as Pool);
    await expect(expired.persist(input())).rejects.toThrow("Account hourly sample could not be stored");
    expect(hourlyWritten).toBe(true); expect(await counts()).toEqual({ hourly: 0, raw: 0 });
  });
  it("rejects malformed input and exact16MiB before opening a transaction", async () => {
    const connect = vi.spyOn(pool, "connect");
    const value = input();
    Object.assign(value.rawRows[0]!, { padding: "" });
    const bytes = Buffer.byteLength(JSON.stringify(value));
    Object.assign(value.rawRows[0]!, { padding: "x".repeat(16 * 1024 * 1024 - bytes) });
    await expect(repo.persist(value)).rejects.toThrow("Account hourly sample could not be stored");
    await expect(repo.persist({ ...input(), leaseToken: "secret-invalid" })).rejects.toThrow("Account hourly sample could not be stored");
    expect(connect).not.toHaveBeenCalled();
  });
});
