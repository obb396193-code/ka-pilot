import { fork, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BootstrapSeedRepository, JobRepository, runMigrations } from "@ka/db";
import { executeWorkerOnceChild } from "../src/scheduling/worker-once-child.js";
import { parseWorkerOnceConfig } from "../src/scheduling/worker-once.js";
import { QihangClient } from "../src/qihang/client.js";
import { superviseWorkerOnce } from "../src/scheduling/worker-once-supervisor.js";

describe("single-shot real PG/runtime/CLI integration (synthetic only)", () => {
  let pool: Pool; let databaseUrl: string;
  const workspaceId = randomUUID(), otherWorkspaceId = randomUUID(), userId = randomUUID(), identityId = randomUUID();
  const env = () => ({ PATH: process.env.PATH, DATABASE_URL: databaseUrl, WORKER_ONCE_WORKSPACE_ID: workspaceId,
    WORKER_ONCE_MEDIA: "KUAISHOU", QIHANG_BASE_URL: "https://synthetic.invalid/get_data", WORKER_ONCE_MAX_MS: "15000" });
  beforeAll(async () => {
    databaseUrl = process.env.TEST_DATABASE_URL ?? "";
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl, max: 4 });
    await new BootstrapSeedRepository(pool).seed({
      identities: [{ id: identityId, display_name: "Synthetic once" }],
      workspaces: [{ id: workspaceId, kind: "personal", name: `Synthetic once ${workspaceId}` }, { id: otherWorkspaceId, kind: "personal", name: `Synthetic foreign ${otherWorkspaceId}` }],
      memberships: [{ identity_id: identityId, workspace_id: workspaceId, user_id: userId, role: "optimizer" }], grants: [],
    });
    await pool.query("UPDATE users SET qihang_user_id='synthetic-once-private' WHERE id=$1", [userId]);
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["data_quality_checks", "outbound_messages", "etl_runs", "metrics_raw", "account_metrics_daily", "jobs", "account_access_grants", "workspace_memberships", "accounts", "users", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, otherWorkspaceId]]);
    }
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]); await pool.end();
  });
  it("real executable blocks missing grant, never queries the source or consumes a foreign job", async () => {
    const foreignId = await new JobRepository(pool).enqueue({ workspaceId: otherWorkspaceId, jobType: "etl_full", payload: { private: "synthetic-secret" }, credentialOwnerUserId: null, priority: 1 });
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "src/scheduling/worker-once-cli.ts"], { cwd: new URL("..", import.meta.url), env: env(), stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      child.stdout.on("data", (value: Buffer) => { stdout += value; }); child.stderr.on("data", (value: Buffer) => { stderr += value; });
      child.once("error", reject); child.once("close", (code) => resolve({ code, stdout, stderr }));
    });
    expect(result.code).toBe(1); expect(result.stderr).toBe("Worker once failed [BLOCKED_AUTH]\n");
    expect(JSON.parse(result.stdout)).toEqual({ jobId: expect.any(String), jobType: "etl_full", status: "blocked_auth" });
    expect(result.stdout).not.toContain("synthetic-once-private");
    expect((await pool.query("SELECT status,attempts FROM jobs WHERE id=$1", [foreignId])).rows[0]).toEqual({ status: "queued", attempts: 0 });
  }, 20000);
  it("authorized actual runtime drains synthetic empty-source ETL/downstream only in its own workspace", async () => {
    await pool.query("DELETE FROM jobs WHERE workspace_id=$1", [workspaceId]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-once-account')", [workspaceId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU','synthetic-once-account','read')", [workspaceId, identityId]);
    const writeId = await new JobRepository(pool).enqueue({ workspaceId, jobType: "changeset_execute", payload: {}, credentialOwnerUserId: userId, priority: 1 });
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("userId")).toBe("synthetic-once-private");
      expect(url.searchParams.get("accountIds")).toBe(url.searchParams.get("resource") === "account" ? null : "synthetic-once-account");  // F-OS-005
      return Response.json({ successful: true, data: url.searchParams.get("resource") === "account" ? { rows: [], totalNum: 0, pageNum: 1, pageSize: 100 } : [] });
    });
    const events: unknown[] = [];
    const result = await executeWorkerOnceChild(parseWorkerOnceConfig(env()), new Date().toISOString(), {
      qihang: new QihangClient({ baseUrl: "https://synthetic.invalid/get_data", fetchFn, maxRetries: 0 }), onJobState: (event) => events.push(event),
    });
    expect(result.status).toBe("drained"); expect(result.attemptedJobs).toBeGreaterThanOrEqual(2); expect(fetchFn).toHaveBeenCalled();
    expect((await pool.query("SELECT status FROM jobs WHERE workspace_id=$1 AND job_type='etl_full'", [workspaceId])).rows).toEqual([{ status: "done" }]);
    expect((await pool.query("SELECT status,attempts FROM jobs WHERE id=$1", [writeId])).rows[0]).toEqual({ status: "queued", attempts: 0 });
    for (const event of events) expect(Object.keys(event as object).sort()).toEqual(["jobId", "jobType", "status"]);
    expect(JSON.stringify(events)).not.toContain("synthetic-once-private");
  }, 30000);
  it("hard deadline leaves a real PG lease recoverable with a new fence, not falsely done", async () => {
    const id = await new JobRepository(pool).enqueue({ workspaceId, jobType: "data_quality_check", payload: {}, credentialOwnerUserId: userId, priority: 1, runAfter: new Date("2020-01-01T00:00:00Z") });
    const events: unknown[] = [];
    const result = await superviseWorkerOnce({ maxMs: 3000, onJobState: (event) => events.push(event), startChild: () => fork(new URL("./fixtures/worker-once-lease.ts", import.meta.url), [workspaceId], {
      cwd: new URL("..", import.meta.url), execArgv: ["--import", "tsx"], env: { PATH: process.env.PATH, TEST_DATABASE_URL: databaseUrl }, stdio: ["ignore", "ignore", "ignore", "ipc"],
    }) });
    expect(result).toEqual({ status: "budget", jobs: { leased: 1, done: 0, failed: 0 } }); expect(events).toEqual([{ jobId: id, jobType: "data_quality_check", status: "leased" }]);
    const before = (await pool.query("SELECT status,attempts,lease_token FROM jobs WHERE id=$1", [id])).rows[0];
    expect(before).toMatchObject({ status: "leased", attempts: 1 });
    // Controlled expiry avoids sleeping for the production lease duration.
    await pool.query("UPDATE jobs SET lease_until=now()-interval '2 seconds' WHERE id=$1", [id]);
    const repository = new JobRepository(pool, { workspaceId, jobTypes: ["data_quality_check"] });
    expect((await repository.recoverStaleLeases(1)).requeued).toBe(1);
    const next = await repository.leaseNext(60);
    expect(next?.id).toBe(id); expect(next?.attempts).toBe(2); expect(next?.leaseToken).not.toBe(before.lease_token);
    await expect(repository.markDone({ id, leaseToken: before.lease_token })).rejects.toThrow("lease is no longer owned");
  }, 10000);
});
