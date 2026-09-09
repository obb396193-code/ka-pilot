import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BootstrapSeedRepository, JobRepository, runMigrations, SESSION_CLEANUP_JOB_TYPE } from "@ka/db";
import { executeSessionCleanupOnce, parseSessionCleanupConfig } from "../src/auth/session-cleanup-once.js";
import { createWorkerConsumer } from "../src/runtime.js";
import { QihangClient } from "../src/qihang/client.js";

describe("session maintenance real PG + executable / synthetic only", () => {
  let pool: Pool, databaseUrl: string;
  const workspaceId = randomUUID(), otherWorkspace = randomUUID(), identityId = randomUUID(), scopes = [workspaceId, otherWorkspace];
  const env = (runId = randomUUID()) => ({ PATH: process.env.PATH, DATABASE_URL: databaseUrl, SESSION_CLEANUP_WORKSPACE_ID: workspaceId, SESSION_CLEANUP_RUN_ID: runId, SESSION_CLEANUP_MAX_MS: "15000" });
  beforeAll(async () => {
    databaseUrl = process.env.TEST_DATABASE_URL ?? ""; if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl, max: 5 });
    await new BootstrapSeedRepository(pool).seed({
      identities: [{ id: identityId, display_name: "Synthetic retention" }],
      workspaces: [{ id: workspaceId, kind: "personal", name: `Synthetic retention ${workspaceId}` }, { id: otherWorkspace, kind: "team", name: `Synthetic retention ${otherWorkspace}` }],
      memberships: scopes.map((id) => ({ identity_id: identityId, workspace_id: id, user_id: randomUUID(), role: "admin" })), grants: [],
    });
  });
  beforeEach(async () => {
    await pool.query("DELETE FROM auth_sessions WHERE active_workspace_id=ANY($1::uuid[])", [scopes]);
    await pool.query("DELETE FROM jobs WHERE workspace_id=ANY($1::uuid[])", [scopes]);
  });
  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM auth_sessions WHERE active_workspace_id=ANY($1::uuid[])", [scopes]);
    for (const table of ["jobs", "workspace_memberships", "users"]) await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [scopes]);
    await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [scopes]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]); await pool.end();
  });
  async function oldSession(workspace = workspaceId) {
    const id = randomUUID();
    await pool.query(`INSERT INTO auth_sessions(id,identity_id,active_workspace_id,token_hash,expires_at,created_at,last_seen_at)
      VALUES($1::uuid,$2::uuid,$3::uuid,md5($1::text)||md5($2::text),now()-interval '31 days',now()-interval '90 days',now()-interval '90 days')`, [id, identityId, workspace]);
    return id;
  }
  async function sessionExists(id: string) { return (await pool.query("SELECT id FROM auth_sessions WHERE id=$1", [id])).rowCount === 1; }
  async function cli(settings = env()) {
    return new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "src/auth/session-cleanup-cli.ts"], { cwd: new URL("..", import.meta.url), env: settings, stdio: ["ignore", "pipe", "pipe"] });
      let out = "", err = ""; child.stdout.on("data", (v: Buffer) => { out += v; }); child.stderr.on("data", (v: Buffer) => { err += v; });
      child.once("error", reject); child.once("close", (code) => resolve({ code, out, err }));
    });
  }
  it("real CLI needs no grants/Qihang, isolates other workspace and leaves media jobs unclaimed", async () => {
    const own = await oldSession(), foreign = await oldSession(otherWorkspace);
    const mediaJob = await new JobRepository(pool).enqueue({ workspaceId, jobType: "changeset_execute", payload: {}, credentialOwnerUserId: null, priority: 1 });
    expect(await cli()).toEqual({ code: 0, out: "Session cleanup round finished\n", err: "" });
    expect(await sessionExists(own)).toBe(false); expect(await sessionExists(foreign)).toBe(true);
    expect((await pool.query("SELECT status,attempts FROM jobs WHERE id=$1", [mediaJob])).rows[0]).toEqual({ status: "queued", attempts: 0 });
    expect((await pool.query("SELECT status FROM jobs WHERE workspace_id=$1 AND job_type=$2", [workspaceId, SESSION_CLEANUP_JOB_TYPE])).rows).toEqual([{ status: "done" }]);
  }, 30000);
  it("same logical run replay and concurrent invocations do not create duplicate jobs or redo a done run", async () => {
    await oldSession(); const config = parseSessionCleanupConfig(env());
    await Promise.all([executeSessionCleanupOnce(config), executeSessionCleanupOnce(config)]);
    expect((await pool.query("SELECT count(*)::int AS n FROM jobs WHERE workspace_id=$1", [workspaceId])).rows[0]?.n).toBe(1);
    const later = await oldSession(); expect(await executeSessionCleanupOnce(config)).toBe("completed");
    expect(await sessionExists(later)).toBe(true);
    await executeSessionCleanupOnce({ ...config, runId: randomUUID() }); expect(await sessionExists(later)).toBe(false);
  });
  it("production consumer actually registers retention without invoking the media identity adapter", async () => {
    await oldSession(); const fetchFn = vi.fn();
    const jobs = new JobRepository(pool); await jobs.enqueue({ workspaceId, jobType: SESSION_CLEANUP_JOB_TYPE, payload: {}, credentialOwnerUserId: null });
    const consumer = createWorkerConsumer({ pool, leaseScope: { workspaceId, jobTypes: [SESSION_CLEANUP_JOB_TYPE] }, leaseSeconds: 30, serviceQihangUserId: null,
      qihang: new QihangClient({ baseUrl: "https://synthetic.invalid/get_data", fetchFn }) });
    expect(await consumer.processOnce()).toBe(true); expect(fetchFn).not.toHaveBeenCalled();
    expect((await pool.query("SELECT status FROM jobs WHERE workspace_id=$1", [workspaceId])).rows).toEqual([{ status: "done" }]);
  });
  it("refuses a nonexistent configured workspace and never creates an orphan job", async () => {
    const config = { ...parseSessionCleanupConfig(env()), workspaceId: randomUUID() };
    await expect(executeSessionCleanupOnce(config)).rejects.toThrow("Session cleanup failed");
    expect((await pool.query("SELECT count(*)::int AS n FROM jobs WHERE workspace_id=$1", [config.workspaceId])).rows[0]?.n).toBe(0);
  });
  it("hard budget observes child termination; it is not advertised as full deletion", async () => {
    await oldSession();
    expect(await cli({ ...env(), SESSION_CLEANUP_MAX_MS: "1" })).toEqual({ code: 0, out: "Session cleanup round budget reached\n", err: "" });
    // A batch committed before the deadline may remain deleted; timeout is not rollback of prior batches.
  });
});
