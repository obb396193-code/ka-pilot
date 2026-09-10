import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { EtlRunListRepository } from "../src/etl-run-list-repository.js";
import { runMigrations } from "../src/migrate.js";

describe("ETL run pages / synthetic real PG", { timeout: 30_000 }, () => {
  const workspaceId = randomUUID(), foreign = randomUUID(), jobId = randomUUID(), foreignJob = randomUUID();
  const auth: ApprovedWorkspaceAuthContext = { workspaceId, userId: randomUUID(), role: "admin", workspaceKind: "personal",
    scope: { kind: "explicit_accounts", accounts: [] } };
  let pool: Pool, repo: EtlRunListRepository, first: string, second: string;
  const statements: string[] = [];
  const insert = async (ws: string, job: string, kind: string, scope: object, status = "done", count = 3) =>
    (await pool.query(`INSERT INTO etl_runs(workspace_id,job_id,run_kind,scope,started_at,finished_at,status,rows_ingested,error_summary)
      VALUES($1,$2,$3,$4,'2026-09-09T01:00:00Z',CASE WHEN $5='running' THEN NULL ELSE '2026-09-09T01:01:00Z'::timestamptz END,$5,$6,'synthetic private credential/body') RETURNING id`,
    [ws, job, kind, scope, status, count])).rows[0].id as string;
  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL ?? "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
    await runMigrations({ databaseUrl: url.toString() });
    pool = new Pool({ connectionString: url.toString(), max: 4 }); repo = new EtlRunListRepository(pool);
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic P186'),($2,'synthetic P186 foreign')", [workspaceId, foreign]);
    await pool.query("INSERT INTO jobs(id,workspace_id,job_type,payload,attempts) VALUES($1,$2,'etl_incr','{}',9),($3,$4,'etl_incr','{}',9)", [jobId, workspaceId, foreignJob, foreign]);
    first = await insert(workspaceId, jobId, "incr", { ds: "2026-09-09", execution: {
      version: "etl-attempt/v1", jobId, workspaceId, jobType: "etl_incr", attempt: 1 },
      secret: "synthetic private", batchFailures: [{ code: "BATCH_FAILED", resource: "account_realtime", ds: "2026-09-09",
        accountIds: ["synthetic-account"], fingerprint: "a".repeat(64), media: "KUAISHOU", failedAt: "2026-09-09T01:00:00Z" }] });
    second = await insert(workspaceId, jobId, "canonical", { reportDate: "2026-09-09" }, "done", 0);
    await insert(foreign, foreignJob, "incr", { ds: "2026-09-09" });
  }, 30_000);
  afterAll(async () => {
    if (!pool) return;
    try {
      for (const table of ["etl_runs", "jobs", "workspaces"]) await pool.query(
        `DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, foreign]]);
    } finally { await pool.end(); }
  });
  it("uses one RR/RO snapshot, stable ordering, own workspace and stage-local row counts", async () => {
    const client = await pool.connect();
    const monitored = new Proxy(client, { get(target, key) {
      if (key === "query") return async (sql: string, params: unknown[]) => { statements.push(sql); return target.query(sql, params); };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    const result = await new EtlRunListRepository({ connect: async () => monitored } as unknown as Pool).list(auth, { page: 1, pageSize: 1 });
    expect(result).toMatchObject({ workspaceId, dataAsOf: "2026-09-09T01:01:00.000Z", data: { page: 1, pageSize: 1, total: 2,
      items: [{ runId: second, attempt: null, rows: { raw: null, canonical: 0 }, warnings: [{ code: "LEGACY_NO_ATTEMPT" }] }] } });
    expect(statements[0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(statements.at(-1)).toBe("COMMIT");
    expect(statements.join("\n")).not.toMatch(/\berror_summary\b|jobs\.attempts|SELECT\s+\*/);
    const page = await repo.list(auth, { page: 2, pageSize: 1 });
    expect(page.data.items[0]).toMatchObject({ runId: first, attempt: 1, rows: { raw: 3, canonical: null }, warnings: [
      { code: "BATCH_FAILED", accountIds: ["synthetic-account"], fingerprint: "a".repeat(64) }] });
    expect(JSON.stringify(page)).not.toMatch(/private|failedAt|KUAISHOU|secret/);
    expect((await repo.list(auth, { page: 9, pageSize: 1 })).data).toEqual({ page: 9, pageSize: 1, total: 2, items: [] });
  });
  it("admin team can read only that workspace, while a new empty workspace returns no invented timestamp", async () => {
    const team = { ...auth, workspaceId: foreign, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } };
    expect((await repo.list(team, {})).data.total).toBe(1);
    expect(await repo.list({ ...auth, workspaceId: randomUUID() }, {})).toMatchObject({ dataAsOf: null, data: { total: 0, items: [] } });
  });
  it("rejects non-admin and malformed pagination before opening DB", async () => {
    const connect = vi.fn(); const isolated = new EtlRunListRepository({ connect } as unknown as Pool);
    for (const role of ["optimizer", "operator", "lead"]) await expect(isolated.list({ ...auth, role }, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(isolated.list({ ...auth, workspaceId: foreign, scope: { kind: "team_workspace_readonly" } }, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(isolated.list(auth, { page: "1" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(connect).not.toHaveBeenCalled();
  });
  it("concurrent append cannot change count/page within an already open snapshot", async () => {
    let appended: string | undefined;
    const client = await pool.connect();
    const monitored = new Proxy(client, { get(target, key) {
      if (key === "query") return async (sql: string, params: unknown[]) => {
        const result = await target.query(sql, params);
        if (sql.includes("etl-run-page-summary")) appended = await insert(workspaceId, jobId, "incr", { ds: "2026-09-09" });
        return result;
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    try {
      const result = await new EtlRunListRepository({ connect: async () => monitored } as unknown as Pool).list(auth, {});
      expect(result.data.total).toBe(2); expect(result.data.items).toHaveLength(2);
      expect(result.data.items.map(row => row.runId)).not.toContain(appended);
    } finally { if (appended) await pool.query("DELETE FROM etl_runs WHERE id=$1 AND workspace_id=$2", [appended, workspaceId]); }
  });
  it.each(["full", "backfill_coordinator", "backfill_day", "quality"])("preserves actual %s date and does not call quality checks raw rows", async kind => {
    const scope = kind === "full" ? { asOfDate: "2026-09-08" } : { dateTo: "2026-09-08" };
    const id = await insert(workspaceId, jobId, kind, scope);
    try {
      const row = (await repo.list(auth, {})).data.items.find(row => row.runId === id);
      expect(row?.businessDate).toBe("2026-09-08");
      expect(row?.rows).toEqual(kind === "quality" ? null : { raw: 3, canonical: null });
    } finally { await pool.query("DELETE FROM etl_runs WHERE id=$1 AND workspace_id=$2", [id, workspaceId]); }
  });
  it.each(["running", "failed"])("does not invent finished counts for %s run", async status => {
    const id = await insert(workspaceId, jobId, "incr", { ds: "2026-09-09" }, status, 0);
    try {
      if (status === "failed") await pool.query("UPDATE etl_runs SET step_failed='fetch:account_page_2' WHERE id=$1", [id]);
      const row = (await repo.list(auth, {})).data.items.find(row => row.runId === id);
      expect(row?.rows).toBeNull();
      if (status === "failed") expect(row?.failedStage).toBe("fetch:account_page_2");
    } finally { await pool.query("DELETE FROM etl_runs WHERE id=$1 AND workspace_id=$2", [id, workspaceId]); }
  });
  it.each(["null-execution", "bad-attempt", "foreign-execution", "invalid-date", "null-warnings", "unsafe-warning"])("rejects present-invalid %s without private error leakage", async scenario => {
    const scope: Record<string, unknown> = { ds: "2026-09-09" };
    if (scenario === "null-execution") scope.execution = null;
    if (scenario === "bad-attempt" || scenario === "foreign-execution") scope.execution = { version: "etl-attempt/v1", jobId,
      workspaceId: scenario === "foreign-execution" ? foreign : workspaceId, jobType: "etl_incr", attempt: scenario === "foreign-execution" ? 1 : "private" };
    if (scenario === "invalid-date") scope.ds = "2026-02-31";
    if (scenario === "null-warnings") scope.batchFailures = null;
    if (scenario === "unsafe-warning") scope.batchFailures = [{ code: "private", token: "synthetic private" }];
    const id = await insert(workspaceId, jobId, "incr", scope);
    try { await expect(repo.list(auth, {})).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE", message: "ETL run list: UPSTREAM_INVALID_RESPONSE" }); }
    finally { await pool.query("DELETE FROM etl_runs WHERE id=$1 AND workspace_id=$2", [id, workspaceId]); }
  });
  it("fails closed at the SQL page storage cap without returning a giant/private JSON blob", async () => {
    const id = await insert(workspaceId, jobId, "incr", { ds: "2026-09-09", padding: "" });
    try {
      const size = (await pool.query("SELECT octet_length(scope::text) AS size FROM etl_runs WHERE id=$1", [id])).rows[0].size;
      await pool.query("UPDATE etl_runs SET scope=jsonb_set(scope,'{padding}',to_jsonb(repeat('x',$2::integer))) WHERE id=$1", [id, 16 * 1024 * 1024 - 512 - size]);
      // Latest row only: projected page estimate is exactly 16MiB.
      await expect(repo.list(auth, { pageSize: 1 })).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    } finally { await pool.query("DELETE FROM etl_runs WHERE id=$1 AND workspace_id=$2", [id, workspaceId]); }
  });
  it("rejects 10001 warnings rather than silently dropping them", async () => {
    const id = await insert(workspaceId, jobId, "incr", { ds: "2026-09-09", batchFailures: Array(10001).fill({}) });
    try { await expect(repo.list(auth, {})).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" }); }
    finally { await pool.query("DELETE FROM etl_runs WHERE id=$1 AND workspace_id=$2", [id, workspaceId]); }
  });
  it("keeps legacy runs lacking scope dates instead of dropping them or inventing today", async () => {
    const id = await insert(workspaceId, jobId, "incr", {});
    try {
      expect((await repo.list(auth, {})).data.items.find(row => row.runId === id)).toMatchObject({ businessDate: null,
        attempt: null, warnings: [{ code: "LEGACY_NO_ATTEMPT" }, { code: "LEGACY_NO_DATE" }] });
    } finally { await pool.query("DELETE FROM etl_runs WHERE id=$1 AND workspace_id=$2", [id, workspaceId]); }
  });
  it("orders adjacent BIGSERIAL IDs beyond JS safe integer without rounding or lexical sort", async () => {
    const base = 9007199254740992n + BigInt(Math.floor(Math.random() * 1000000)) * 2n;
    const ids: string[] = [];
    try {
      for (let i = 0n; i < 2n; i++) {
        const original = await insert(workspaceId, jobId, "incr", { ds: "2026-09-09" }); ids.push(original);
        const id = String(base + i);
        await pool.query("UPDATE etl_runs SET id=$2 WHERE id=$1 AND workspace_id=$3", [original, id, workspaceId]);
        ids[ids.length - 1] = id;
      }
      const result = await repo.list(auth, { pageSize: 2 });
      expect(result.data.items.map(row => row.runId)).toEqual([String(base + 1n), String(base)]);
    } finally { await pool.query("DELETE FROM etl_runs WHERE id=ANY($1::bigint[]) AND workspace_id=$2", [ids, workspaceId]); }
  });
});
