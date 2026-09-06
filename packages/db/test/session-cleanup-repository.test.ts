// Real PostgreSQL with synthetic identities only. No existing session/data cleanup.
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { JobRepository, LostJobLeaseError, type JobRecord } from "../src/job-repository.js";
import { SessionCleanupRepository, SESSION_CLEANUP_JOB_TYPE } from "../src/session-cleanup-repository.js";

describe("session retention / real PG", () => {
  let pool: Pool;
  const workspaceId = randomUUID(), otherWorkspace = randomUUID(), identityId = randomUUID();
  const scopes = [workspaceId, otherWorkspace];
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl, max: 5 });
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'synthetic retention')", [identityId]);
    for (const [index, id] of scopes.entries()) {
      const userId = randomUUID();
      await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,'synthetic retention',$2)", [id, index === 0 ? "personal" : "team"]);
      await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic retention')", [userId, id]);
      await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'admin')", [id, identityId, userId]);
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-retention-account')", [id]);
    }
  });
  beforeEach(async () => {
    await pool.query("DELETE FROM auth_sessions WHERE active_workspace_id=ANY($1::uuid[])", [scopes]);
    await pool.query("DELETE FROM jobs WHERE workspace_id=ANY($1::uuid[])", [scopes]);
  });
  afterAll(async () => {
    vi.useRealTimers(); if (!pool) return;
    await pool.query("DELETE FROM auth_sessions WHERE active_workspace_id=ANY($1::uuid[])", [scopes]);
    for (const table of ["jobs", "accounts", "workspace_memberships", "users"]) await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [scopes]);
    await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [scopes]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]); await pool.end();
  });
  async function session(days: number, revokedDays: number | null = null, workspace = workspaceId) {
    const id = randomUUID();
    await pool.query(`INSERT INTO auth_sessions(id,identity_id,active_workspace_id,token_hash,expires_at,revoked_at,created_at,last_seen_at)
      VALUES($1::uuid,$2::uuid,$3::uuid,md5($1::text)||md5($2::text),now()+($4*interval '1 day'),
        CASE WHEN $5::int IS NULL THEN NULL ELSE now()+($5*interval '1 day') END,
        now()-interval '90 days',now()-interval '90 days')`, [id, identityId, workspace, days, revokedDays]);
    return id;
  }
  function jobs(workspace = workspaceId) { return new JobRepository(pool, { workspaceId: workspace, jobTypes: [SESSION_CLEANUP_JOB_TYPE] }); }
  async function job() {
    const repository = jobs(); await repository.enqueue({ workspaceId, jobType: SESSION_CLEANUP_JOB_TYPE, payload: {}, credentialOwnerUserId: null });
    const leased = (await repository.leaseNext(60))!; await repository.markRunning(leased); return leased;
  }
  function lease(row: JobRecord) { return { id: row.id, workspaceId: row.workspaceId, leaseToken: row.leaseToken }; }
  async function remaining() {
    return (await pool.query<{ id: string }>("SELECT id FROM auth_sessions WHERE active_workspace_id=ANY($1::uuid[]) ORDER BY id", [scopes])).rows.map((r) => r.id);
  }

  it("deletes only old invalid sessions in the trusted workspace; keeps all business/identity rows", async () => {
    const expired = await session(-31), revoked = await session(10, -31);
    const keep = [await session(10), await session(-1), await session(10, -1), await session(-31, null, otherWorkspace)];
    const running = await job(), repository = new SessionCleanupRepository(pool);
    expect(await repository.cleanupBatch(lease(running))).toEqual({ deletedCount: 2 });
    expect(await remaining()).toEqual(keep.sort()); expect(await remaining()).not.toContain(expired); expect(await remaining()).not.toContain(revoked);
    expect(await repository.cleanupBatch(lease(running))).toEqual({ deletedCount: 0 });
    expect((await pool.query("SELECT count(*)::int AS n FROM accounts WHERE workspace_id=ANY($1::uuid[])", [scopes])).rows[0]?.n).toBe(2);
    expect((await pool.query("SELECT count(*)::int AS n FROM users WHERE workspace_id=ANY($1::uuid[])", [scopes])).rows[0]?.n).toBe(2);
  });
  it("uses DB time even when application Date is in 2099", async () => {
    const keep = await session(-1); await session(-31); const running = await job();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
    try { expect(await new SessionCleanupRepository(pool).cleanupBatch(lease(running))).toEqual({ deletedCount: 1 }); }
    finally { vi.useRealTimers(); }
    expect(await remaining()).toEqual([keep]);
  });
  it("keeps the exact 720-hour boundary and deletes only strictly older records", async () => {
    const exact = await session(-31), older = await session(-31), running = await job();
    // Seed relative to the actual repository transaction start, not an approximate Node clock.
    const wrappedPool = { connect: async () => {
      const client = await pool.connect(), query = client.query.bind(client);
      const wrapped = Object.create(client) as PoolClient;
      wrapped.query = (async (sql: string, params?: unknown[]) => {
        const result = await query(sql, params);
        if (sql === "BEGIN") await query(`UPDATE auth_sessions SET expires_at=CURRENT_TIMESTAMP-interval '720 hours'
          - CASE WHEN id=$2 THEN interval '1 microsecond' ELSE interval '0' END WHERE id=ANY($1::uuid[])`, [[exact, older], older]);
        return result;
      }) as PoolClient["query"];
      wrapped.on = client.on.bind(client); wrapped.removeListener = client.removeListener.bind(client); wrapped.release = client.release.bind(client);
      return wrapped;
    } };
    expect(await new SessionCleanupRepository(wrappedPool).cleanupBatch(lease(running))).toEqual({ deletedCount: 1 });
    expect(await remaining()).toEqual([exact]);
  });
  it("fences expired/reassigned leases and rejects a forged workspace before deletion", async () => {
    await session(-31); const running = await job(), repository = new SessionCleanupRepository(pool);
    await expect(repository.cleanupBatch({ ...lease(running), workspaceId: otherWorkspace })).rejects.toBeInstanceOf(LostJobLeaseError);
    await pool.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [running.id]);
    await expect(repository.cleanupBatch(lease(running))).rejects.toBeInstanceOf(LostJobLeaseError);
    const next = (await jobs().leaseNext(60))!; expect(next.leaseToken).not.toBe(running.leaseToken); await jobs().markRunning(next);
    await expect(repository.cleanupBatch(lease(running))).rejects.toBeInstanceOf(LostJobLeaseError);
    expect(await repository.cleanupBatch(lease(next))).toEqual({ deletedCount: 1 });
  });
  it.each(["wrong-job", "forged-payload", "credential-owner"])("rejects %s persisted job metadata", async (kind) => {
    await session(-31); const running = await job();
    if (kind === "wrong-job") await pool.query("UPDATE jobs SET job_type='etl_full' WHERE id=$1", [running.id]);
    if (kind === "forged-payload") await pool.query("UPDATE jobs SET payload='{\"cutoff\":\"2099-01-01\"}' WHERE id=$1", [running.id]);
    if (kind === "credential-owner") await pool.query("UPDATE jobs SET credential_owner_user_id=(SELECT id FROM users WHERE workspace_id=$2) WHERE id=$1", [running.id, workspaceId]);
    await expect(new SessionCleanupRepository(pool).cleanupBatch(lease(running))).rejects.toBeInstanceOf(LostJobLeaseError);
    expect(await remaining()).toHaveLength(1);
  });
  it("bounds a batch at 1000 and supports concurrent idempotent draining", async () => {
    await pool.query(`INSERT INTO auth_sessions(identity_id,active_workspace_id,token_hash,expires_at,created_at,last_seen_at)
      SELECT $1::uuid,$2::uuid,md5($1::text||n::text)||md5($2::text||n::text),now()-interval '31 days',now()-interval '90 days',now()-interval '90 days'
      FROM generate_series(1,1003) AS series(n)`, [identityId, workspaceId]);
    const first = await job(), second = await job(), repository = new SessionCleanupRepository(pool);
    expect(await repository.cleanupBatch(lease(first))).toEqual({ deletedCount: 1000 });
    expect(await remaining()).toHaveLength(3);
    const results = await Promise.all([repository.cleanupBatch(lease(first)), repository.cleanupBatch(lease(second))]);
    expect(results.reduce((sum, r) => sum + r.deletedCount, 0)).toBe(3);
    expect(await remaining()).toEqual([]);
  });
  it("skips a concurrently locked session, then rechecks its new workspace/expiry on the next run", async () => {
    const id = await session(-31), running = await job(), repository = new SessionCleanupRepository(pool);
    const switcher = await pool.connect();
    try {
      await switcher.query("BEGIN"); await switcher.query("SELECT id FROM auth_sessions WHERE id=$1 FOR UPDATE", [id]);
      expect(await repository.cleanupBatch(lease(running))).toEqual({ deletedCount: 0 });
      await switcher.query("UPDATE auth_sessions SET active_workspace_id=$2,expires_at=now()+interval '1 day' WHERE id=$1", [id, otherWorkspace]);
      await switcher.query("COMMIT");
    } finally { await switcher.query("ROLLBACK"); switcher.release(); }
    expect(await repository.cleanupBatch(lease(running))).toEqual({ deletedCount: 0 }); expect(await remaining()).toEqual([id]);
  });
});
