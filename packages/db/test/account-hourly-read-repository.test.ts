import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { runMigrations } from "../src/migrate.js";
import { AccountHourlyReadRepository } from "../src/account-hourly-read-repository.js";

// Synthetic contract table in this suite's schema, NOT a production migration.
describe("account hourly reader / real PG", () => {
  const schema = `hourly_${randomUUID().replaceAll("-", "")}`, date = "2026-09-09";
  let admin: Pool, pool: Pool, repository: AccountHourlyReadRepository, workspaceId: string, foreignId: string;
  const request = { date, media: "KUAISHOU", hhFrom: 1, hhTo: 2 };
  const auth = (accounts = [{ media: "KUAISHOU", accountId: "a", accessLevel: "read" as const }]): ApprovedWorkspaceAuthContext => ({
    workspaceId, userId: "00000000-0000-4000-8000-000000000001", workspaceKind: "personal", role: "optimizer",
    scope: { kind: "explicit_accounts", accounts },
  });
  const sample = (hh: number, id = "a", media = "KUAISHOU", ws = workspaceId) => pool.query(
    `INSERT INTO account_metrics_hourly(workspace_id,media,account_id,ds,hh,cost,conversion,real_conversion,
       last_sync_time,sampled_at,complete,source_run_id)
     VALUES($1,$2,$3,$4,$5,10,0,NULL,'2026-09-09T01:03:00+08:00','2026-09-09T01:05:00+08:00',false,9007199254740993)`,
    [ws, media, id, date, hh]);
  const coefficient = (value: number, day = date, op = "divide") => admin.query(
    "INSERT INTO channel_coefficients(workspace_id,media,coefficient,effective_date,op) VALUES($1,'KUAISHOU',$2,$3,$4)", [workspaceId, value, day, op]);
  const intercept = (transform: (sql: string, rows: Record<string, unknown>[]) => void) => {
    const connect = pool.connect.bind(pool);
    vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
      const client = await connect(), query = client.query.bind(client);
      vi.spyOn(client, "query").mockImplementation((async (text: string, params?: unknown[]) => {
        const result = await query(text, params); transform(text, result.rows); return result;
      }) as typeof client.query);
      return client;
    });
  };
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
    await runMigrations({ databaseUrl }); admin = new Pool({ connectionString: databaseUrl });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public` });
    const contract = readFileSync(new URL("../../contract/schema.sql", import.meta.url), "utf8");
    const start = contract.indexOf("CREATE TABLE account_metrics_hourly (");
    const end = contract.indexOf(") PARTITION BY RANGE (ds);", start);
    if (start < 0 || end < start) throw new Error("Frozen hourly DDL not found");
    await pool.query(contract.slice(start, end + ") PARTITION BY RANGE (ds);".length));
    await pool.query("CREATE TABLE account_metrics_hourly_test_default PARTITION OF account_metrics_hourly DEFAULT");
    repository = new AccountHourlyReadRepository(pool);
  }, 30_000);
  beforeEach(async () => {
    workspaceId = randomUUID(); foreignId = randomUUID();
    for (const ws of [workspaceId, foreignId]) {
      await admin.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic hourly reader')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) for (const id of ["a", "b"]) {
        await admin.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,$3)", [ws, media, id]);
      }
    }
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await pool.query("DELETE FROM account_metrics_hourly WHERE workspace_id=ANY($1::uuid[])", [[workspaceId, foreignId]]);
    for (const table of ["channel_coefficients", "accounts", "workspaces"]) await admin.query(
      `DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, foreignId]]);
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) { await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
  });
  it("only reads approved triple keys; keeps predecessor, actual timestamps, null and zero", async () => {
    for (const hh of [0, 1, 2, 3]) {
      await sample(hh); await sample(hh, "b"); await sample(hh, "a", "TENCENT"); await sample(hh, "a", "KUAISHOU", foreignId);
    }
    const result = await repository.read(auth(), request);
    expect(result).toMatchObject({ workspaceId, date, coefficient: null, rows: [
      { workspaceId, media: "KUAISHOU", accountId: "a", hh: 0, cost: 10, conversion: 0, realConversion: null, sourceRunId: "9007199254740993" },
      { workspaceId, media: "KUAISHOU", accountId: "a", hh: 1 }, { workspaceId, media: "KUAISHOU", accountId: "a", hh: 2 },
    ] });
    expect(result.rows[0]).toMatchObject({ lastSyncTime: "2026-09-08T17:03:00.000Z", sampledAt: "2026-09-08T17:05:00.000Z", complete: false });
    expect(result.rows).toHaveLength(3);
    expect((await repository.read(auth([{ media: "TENCENT", accountId: "a", accessLevel: "read" }]), { ...request, media: "TENCENT" })).rows).toHaveLength(3);
    expect((await repository.read({ ...auth(), workspaceId: foreignId }, request)).rows.every(r => r.workspaceId === foreignId)).toBe(true);
  });
  it("missing hours remain absent; hh24 never aliases hh23", async () => {
    await sample(23);
    expect((await repository.read(auth(), request)).rows).toEqual([]);
    const result = await repository.read(auth(), { ...request, hhFrom: 24, hhTo: 24 });
    expect(result.rows.map(r => r.hh)).toEqual([23]); // predecessor only, no fabricated hh24.
  });
  it("empty or other-media grants never broaden to workspace and perform no IO", async () => {
    const connect = vi.spyOn(pool, "connect");
    expect((await repository.read(auth([]), request)).rows).toEqual([]);
    expect((await repository.read(auth([{ media: "TENCENT", accountId: "a", accessLevel: "read" }]), request)).rows).toEqual([]);
    expect(connect).not.toHaveBeenCalled();
  });
  it("rejects team, malformed auth and duplicated tuples before IO", async () => {
    const connect = vi.spyOn(pool, "connect");
    const granted = { media: "KUAISHOU", accountId: "a", accessLevel: "read" as const };
    for (const value of [null, { ...auth(), workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }, auth([granted, granted])])
      await expect(repository.read(value, request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(connect).not.toHaveBeenCalled();
  });
  it.each([{ date: "2026-02-31" }, { media: "bad' SQL" }, { hhFrom: -1 }, { hhTo: 25 }, { hhFrom: 3 }, { extra: true },
    { hhFrom: undefined }, { hhTo: undefined }, { accountIds: ["a"] }])(
    "validates request before SQL %j", async patch => {
      const connect = vi.spyOn(pool, "connect");
      await expect(repository.read(auth(), { ...request, ...patch })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
      expect(connect).not.toHaveBeenCalled();
    });
  it("missing table is explicit unavailable, never a daily/ad fallback", async () => {
    await pool.query("ALTER TABLE account_metrics_hourly RENAME TO held_hourly");
    try { await expect(repository.read(auth(), request)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" }); }
    finally { await pool.query("ALTER TABLE held_hourly RENAME TO account_metrics_hourly"); }
  });
  it.each(["NaN", "Infinity", "-1"])("invalid present cost %s fails closed", async value => {
    await sample(1); await pool.query("UPDATE account_metrics_hourly SET cost=$1 WHERE workspace_id=$2", [value, workspaceId]);
    await expect(repository.read(auth(), request)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE", message: "Account hourly read: UPSTREAM_INVALID_RESPONSE" });
  });
  it("only selects the latest effective coefficient, not a future or foreign version", async () => {
    await sample(1); await coefficient(2, "2026-09-01", "multiply"); await coefficient(3); await coefficient(4, "2026-09-10");
    await admin.query("INSERT INTO channel_coefficients(workspace_id,media,coefficient,effective_date,op) VALUES($1,'KUAISHOU',99,$2,'divide')", [foreignId, date]);
    expect((await repository.read(auth(), request)).coefficient).toMatchObject({ value: 3, op: "divide", effectiveDate: date });
  });
  it("ambiguous latest coefficient is not chosen arbitrarily", async () => {
    await sample(1); await coefficient(2); await coefficient(3);
    await expect(repository.read(auth(), request)).rejects.toMatchObject({ code: "AMBIGUOUS_VERSION" });
  });
  it("absence/future-only coefficient stays null and all null metrics stay null", async () => {
    await sample(1); await coefficient(2, "2026-09-10");
    await pool.query("UPDATE account_metrics_hourly SET cost=NULL,conversion=NULL WHERE workspace_id=$1", [workspaceId]);
    expect(await repository.read(auth(), request)).toMatchObject({ coefficient: null, rows: [{
      cost: null, exposure: null, click: null, conversion: null, realConversion: null, budget: null,
    }] });
  });
  it("coefficient multiply is retained rather than applying a hardcoded divide", async () => {
    await sample(1); await coefficient(0.5, date, "multiply");
    expect((await repository.read(auth(), request)).coefficient).toMatchObject({ value: 0.5, op: "multiply" });
  });
  it.each(["NaN", "0", "-1", "Infinity"])("present-invalid coefficient %s is not a missing/default value", async value => {
    await sample(1); await coefficient(2);
    await admin.query("UPDATE channel_coefficients SET coefficient=$2 WHERE workspace_id=$1", [workspaceId, value]);
    await expect(repository.read(auth(), request)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it.each([
    { total_count: "oops" }, { total_count: "0" }, { ds: "2026-02-31" }, { ds: "2026-09-08" }, { hh: 3 },
    { complete: "false" }, { exposure: "1.5" }, { click: undefined }, { real_conversion: "9007199254740992" },
    { cost: "not-a-number" }, { cost: "9".repeat(129) }, { last_sync_time: new Date(NaN) },
    { sampled_at: "2026-09-09T01:05:00Z" }, { source_run_id: "9223372036854775808" },
  ])("defensive output guard rejects malformed database result %j", async patch => {
    await sample(1);
    intercept((sql, rows) => { if (sql.includes("hourly-read-rows")) Object.assign(rows[0]!, patch); });
    await expect(repository.read(auth(), request)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it.each([{ workspace_id: "00000000-0000-4000-8000-000000000099" }, { media: "TENCENT" }, { account_id: "b" }])(
    "defensive output guard rejects escaped tuple %j", async patch => {
      await sample(1);
      intercept((sql, rows) => { if (sql.includes("hourly-read-rows")) Object.assign(rows[0]!, patch); });
      await expect(repository.read(auth(), request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  it("duplicate database rows cannot fabricate coverage", async () => {
    await sample(1);
    intercept((sql, rows) => { if (sql.includes("hourly-read-rows")) { rows[0]!.total_count = "2"; rows.push({ ...rows[0] }); } });
    await expect(repository.read(auth(), request)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("total above the cap rejects even if a database adapter returns fewer rows", async () => {
    await sample(1);
    intercept((sql, rows) => { if (sql.includes("hourly-read-rows")) rows[0]!.total_count = "10001"; });
    await expect(repository.read(auth(), request)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
  it.each(["57014", "08006"])("database failure %s is stable without internal details", async code => {
    intercept(sql => { if (sql.includes("hourly-read-rows")) throw Object.assign(new Error("private SQL/body/password"), { code }); });
    const expected = code === "57014" ? "UPSTREAM_TIMEOUT" : "SOURCE_UNAVAILABLE";
    await expect(repository.read(auth(), request)).rejects.toMatchObject({ code: expected, message: `Account hourly read: ${expected}` });
  });
  it("exact UTF8 byte ceiling is refused, one byte below ceiling is accepted", async () => {
    await sample(1); await coefficient(2);
    const value = await repository.read(auth(), request), bytes = Buffer.byteLength(JSON.stringify(value));
    await expect(new AccountHourlyReadRepository(pool, { maxResponseBytes: bytes }).read(auth(), request)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    expect(await new AccountHourlyReadRepository(pool, { maxResponseBytes: bytes + 1 }).read(auth(), request)).toEqual(value);
    const emptyBytes = Buffer.byteLength(JSON.stringify(await repository.read(auth([]), request)));
    await expect(new AccountHourlyReadRepository(pool, { maxResponseBytes: emptyBytes }).read(auth([]), request)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    for (const limit of [0, NaN, 16 * 1024 * 1024 + 1]) expect(() => new AccountHourlyReadRepository(pool, { maxResponseBytes: limit })).toThrow("INVALID_REQUEST");
  });
  it("rows and coefficient share a read-only repeatable snapshot", async () => {
    await sample(1); await coefficient(2);
    const realConnect = pool.connect.bind(pool), sql: string[] = [];
    vi.spyOn(pool, "connect").mockImplementationOnce(async () => {
      const client = await realConnect(), query = client.query.bind(client);
      vi.spyOn(client, "query").mockImplementation((async (text: string, params?: unknown[]) => {
        sql.push(text);
        if (text.includes("hourly-read-coefficient")) await admin.query("UPDATE channel_coefficients SET coefficient=3 WHERE workspace_id=$1", [workspaceId]);
        return query(text, params);
      }) as typeof client.query);
      return client;
    });
    expect((await repository.read(auth(), request)).coefficient?.value).toBe(2);
    expect(sql[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(sql.at(-1)).toBe("COMMIT");
  });
  it("trusted exact 10000 rows is complete retrieval, 10001 is rejected", async () => {
    await admin.query("INSERT INTO accounts(workspace_id,media,account_id) SELECT $1,'KUAISHOU','bulk_'||g FROM generate_series(0,416) g", [workspaceId]);
    await pool.query(`INSERT INTO account_metrics_hourly(workspace_id,media,account_id,ds,hh,last_sync_time,sampled_at,complete)
      SELECT $1,'KUAISHOU','bulk_'||(g/24),$2,g%24,now(),now(),false FROM generate_series(0,9999) g`, [workspaceId, date]);
    const scope = auth(Array.from({ length: 417 }, (_, i) => ({ media: "KUAISHOU", accountId: `bulk_${i}`, accessLevel: "read" })));
    const all = { ...request, hhFrom: 0, hhTo: 23 };
    expect((await repository.read(scope, all)).rows).toHaveLength(10000);
    await pool.query(`INSERT INTO account_metrics_hourly(workspace_id,media,account_id,ds,hh,last_sync_time,sampled_at,complete)
      VALUES($1,'KUAISHOU','bulk_416',$2,16,now(),now(),false)`, [workspaceId, date]);
    await expect(repository.read(scope, all)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  }, 30_000);
});
