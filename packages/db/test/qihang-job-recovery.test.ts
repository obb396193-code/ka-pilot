import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { approvedScheduledSyncPayload, type ScheduledSyncAuthorizationSnapshot } from "@ka/domain";
import { JobRepository } from "../src/job-repository.js";
import { runMigrations } from "../src/migrate.js";

describe("identity-only scheduled job recovery / real PG", () => {
  const workspaceId = randomUUID(), otherWorkspace = randomUUID(), userId = randomUUID(), identityId = randomUUID();
  let pool: Pool, jobs: JobRepository;
  const snapshot = (): ScheduledSyncAuthorizationSnapshot => ({ workspaceId, userId, identityId, role: "optimizer", allowedAccounts: [{ media: "KUAISHOU", accountId: "synthetic-same-id", accessLevel: "read" }] });
  const recover = async (s = snapshot(), media = "KUAISHOU") => (await jobs.recoverQihangIdentityBlocked(s, media)).length;
  async function blocked(date = "2026-09-08", reason = "QIHANG_IDENTITY_MISSING", media = "KUAISHOU") {
    const id = randomUUID();
    await jobs.enqueueScheduled({ id, workspaceId, jobType: "etl_full", credentialOwnerUserId: userId,
      payload: { workspaceId, media, businessDate: date, initiatorUserId: userId,
        authorizationSnapshot: { workspaceId, userId, status: "blocked_auth", reason } } }, { status: "blocked_auth", reason });
    return id;
  }
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_be_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated local be test DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl }); jobs = new JobRepository(pool, { workspaceId, jobTypes: ["etl_full", "etl_incr"] });
    for (const id of [workspaceId, otherWorkspace]) await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic recovery')", [id]);
    await pool.query("INSERT INTO users(id,workspace_id,name,qihang_user_id) VALUES($1,$2,'synthetic actor','synthetic-private')", [userId, workspaceId]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1,'internal_test',$2,'synthetic identity')", [identityId, `recovery-${identityId}`]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'optimizer')", [workspaceId, identityId, userId]);
    for (const ws of [workspaceId, otherWorkspace]) for (const media of ["KUAISHOU", "TENCENT"]) await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'synthetic-same-id')", [ws, media]);
  });
  beforeEach(async () => {
    for (const table of ["audit_log", "jobs", "account_access_grants"]) await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU','synthetic-same-id','read')", [workspaceId, identityId]);
    await pool.query("UPDATE users SET qihang_user_id='synthetic-private' WHERE id=$1", [userId]);
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["audit_log", "jobs", "account_access_grants", "workspace_memberships", "accounts", "users", "workspaces"]) await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, otherWorkspace]]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]); await pool.end();
  });
  it("recovers old dates without changing identity, attempts or losing the original cause", async () => {
    const ids = [await blocked(), await blocked("2026-09-07")];
    expect(await recover()).toBe(2); expect(await recover()).toBe(0);
    const rows = (await pool.query("SELECT * FROM jobs WHERE workspace_id=$1 ORDER BY payload->>'businessDate'", [workspaceId])).rows;
    expect(rows.map(r => r.id).sort()).toEqual(ids.sort());
    for (const row of rows) {
      expect(row).toMatchObject({ status: "queued", attempts: 0, last_error: "QIHANG_IDENTITY_MISSING", credential_owner_user_id: userId, lease_token: null, finished_at: null });
      expect(row.payload).toEqual(approvedScheduledSyncPayload(snapshot(), "etl_full", "KUAISHOU", row.payload.businessDate));
    }
    const audits = (await pool.query("SELECT * FROM audit_log WHERE workspace_id=$1", [workspaceId])).rows;
    expect(audits).toHaveLength(2); expect(JSON.stringify(audits)).not.toContain("synthetic-private");
  });
  it("restores an execution-time identity failure with frozen scope and consumed attempt unchanged", async () => {
    const payload = approvedScheduledSyncPayload(snapshot(), "etl_full", "KUAISHOU", "2026-09-08");
    const id = await jobs.enqueue({ workspaceId, jobType: "etl_full", payload, credentialOwnerUserId: userId });
    const leased = await jobs.leaseNext(60); expect(leased?.id).toBe(id);
    await jobs.markBlockedAuth(leased!, "Credential owner has no usable Qihang identity");
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-extra')", [workspaceId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU','synthetic-extra','read')", [workspaceId, identityId]);
    try {
      const wider = snapshot(); wider.allowedAccounts.push({ media: "KUAISHOU", accountId: "synthetic-extra", accessLevel: "read" });
      expect(await recover(wider)).toBe(1);
      expect((await pool.query("SELECT payload,attempts,status FROM jobs WHERE id=$1", [id])).rows[0]).toEqual({ payload, attempts: 1, status: "queued" });
    } finally {
      await pool.query("DELETE FROM account_access_grants WHERE workspace_id=$1 AND account_id='synthetic-extra'", [workspaceId]);
      await pool.query("DELETE FROM accounts WHERE workspace_id=$1 AND account_id='synthetic-extra'", [workspaceId]);
    }
  });
  it("does not recover before private identity exists", async () => {
    await blocked(); await pool.query("UPDATE users SET qihang_user_id=NULL WHERE id=$1", [userId]); expect(await recover()).toBe(0);
  });
  it("does not recover incremental work before the original owner's initial full has succeeded", async () => {
    const id = await blocked(); await pool.query("UPDATE jobs SET job_type='etl_incr' WHERE id=$1", [id]);
    expect(await recover()).toBe(0);
    const fullId = await jobs.enqueue({ workspaceId, jobType: "etl_full", payload: { media: "KUAISHOU" }, credentialOwnerUserId: userId });
    await pool.query("INSERT INTO etl_runs(workspace_id,job_id,run_kind,status) VALUES($1,$2,'full','done')", [workspaceId, fullId]);
    try {
      expect(await recover()).toBe(1);
      expect((await pool.query("SELECT payload FROM jobs WHERE id=$1", [id])).rows[0].payload).toEqual(approvedScheduledSyncPayload(snapshot(), "etl_incr", "KUAISHOU", "2026-09-08"));
    } finally { await pool.query("DELETE FROM etl_runs WHERE workspace_id=$1", [workspaceId]); }
  });
  it.each(["users", "workspaces", "workspace_memberships", "auth_identities"])("rejects inactive %s", async table => {
    await blocked(); const predicate = table === "workspace_memberships" ? "workspace_id" : "id";
    const id = table === "users" ? userId : table === "auth_identities" ? identityId : workspaceId;
    await pool.query(`UPDATE ${table} SET is_active=false WHERE ${predicate}=$1`, [id]);
    try { expect(await recover()).toBe(0); } finally { await pool.query(`UPDATE ${table} SET is_active=true WHERE ${predicate}=$1`, [id]); }
  });
  it("rejects team and stale membership role", async () => {
    await blocked(); await pool.query("UPDATE workspaces SET kind='team' WHERE id=$1", [workspaceId]);
    try { expect(await recover()).toBe(0); } finally { await pool.query("UPDATE workspaces SET kind='personal' WHERE id=$1", [workspaceId]); }
    await pool.query("UPDATE workspace_memberships SET role='admin' WHERE workspace_id=$1", [workspaceId]);
    try { expect(await recover()).toBe(0); } finally { await pool.query("UPDATE workspace_memberships SET role='optimizer' WHERE workspace_id=$1", [workspaceId]); }
  });
  it("does not confuse the same account ID across media or workspaces and excludes revoked grants", async () => {
    await blocked(); const otherMedia = await blocked("2026-09-08", "QIHANG_IDENTITY_MISSING", "TENCENT");
    await pool.query("UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1", [workspaceId]);
    expect(await recover()).toBe(0);
    await expect(recover({ ...snapshot(), workspaceId: otherWorkspace })).rejects.toThrow("scope mismatch");
    await pool.query("UPDATE account_access_grants SET revoked_at=NULL WHERE workspace_id=$1", [workspaceId]);
    expect(await recover()).toBe(1);
    expect((await pool.query("SELECT status FROM jobs WHERE id=$1", [otherMedia])).rows[0].status).toBe("blocked_auth");
  });
  it("rejects empty, missing and different-owner authorization", async () => {
    await blocked(); await expect(recover({ ...snapshot(), allowedAccounts: [] })).rejects.toThrow("Invalid Qihang recovery scope");
    expect(await recover({ ...snapshot(), userId: randomUUID() })).toBe(0);
    await pool.query("DELETE FROM account_access_grants WHERE workspace_id=$1", [workspaceId]); expect(await recover()).toBe(0);
  });
  it("does not revive other auth causes, exhausted jobs or unrelated terminal state", async () => {
    await blocked("2026-09-07", "ACCOUNT_SCOPE_MISSING"); const exhausted = await blocked();
    await pool.query("UPDATE jobs SET attempts=max_attempts WHERE id=$1", [exhausted]);
    for (const status of ["done", "failed", "queued"]) { const id = await blocked(); await pool.query("UPDATE jobs SET status=$2 WHERE id=$1", [id, status]); }
    expect(await recover()).toBe(0);
  });
  it("does not substitute a new identity or grant for a frozen execution-time scope", async () => {
    const payload = approvedScheduledSyncPayload(snapshot(), "etl_full", "KUAISHOU", "2026-09-08");
    const id = await jobs.enqueue({ workspaceId, jobType: "etl_full", payload, credentialOwnerUserId: userId });
    const leased = await jobs.leaseNext(60); await jobs.markBlockedAuth(leased!, "Credential owner has no usable Qihang identity");
    const old = { ...snapshot(), identityId: randomUUID() };
    await pool.query("UPDATE jobs SET payload=$2 WHERE id=$1", [id, { ...payload, authorizationSnapshot: old }]);
    expect(await recover()).toBe(0);
    await pool.query("UPDATE jobs SET payload=$2 WHERE id=$1", [id, { ...payload, accountIds: ["synthetic-not-granted"] }]);
    expect(await recover()).toBe(0);
  });
  it.each(["workspace", "user", "date", "extra"])("does not repair a malformed %s payload by guessing", async kind => {
    const id = await blocked(); const payload = (await pool.query("SELECT payload FROM jobs WHERE id=$1", [id])).rows[0].payload;
    if (kind === "workspace") payload.workspaceId = otherWorkspace;
    if (kind === "user") payload.initiatorUserId = randomUUID();
    if (kind === "date") payload.businessDate = "2026-02-31";
    if (kind === "extra") payload.userId = "synthetic-private-do-not-copy";
    await pool.query("UPDATE jobs SET payload=$2 WHERE id=$1", [id, payload]);
    expect(await recover()).toBe(0); expect((await pool.query("SELECT count(*)::int n FROM audit_log WHERE workspace_id=$1", [workspaceId])).rows[0].n).toBe(0);
  });
  it("concurrent recoveries publish one audit and preserve the job", async () => {
    await blocked(); const counts = await Promise.all([recover(), recover()]); expect(counts.sort()).toEqual([0, 1]);
    expect((await pool.query("SELECT count(*)::int n FROM audit_log WHERE workspace_id=$1", [workspaceId])).rows[0].n).toBe(1);
  });
  it("audit failure rolls the real job update back instead of leaving an untracked recovery", async () => {
    const id = await blocked();
    const wrapped = { connect: async () => {
      const client = await pool.connect();
      return { query: async (sql: string, values?: unknown[]) => {
        if (sql.includes("INSERT INTO audit_log")) throw new Error("synthetic-private-database-failure");
        return client.query(sql, values);
      }, release: (destroy?: boolean) => client.release(destroy) };
    } } as unknown as Pool;
    await expect(new JobRepository(wrapped).recoverQihangIdentityBlocked(snapshot(), "KUAISHOU")).rejects.toThrow(/^Qihang identity recovery failed$/);
    expect((await pool.query("SELECT status,payload FROM jobs WHERE id=$1", [id])).rows[0]).toMatchObject({ status: "blocked_auth", payload: { authorizationSnapshot: { status: "blocked_auth" } } });
    expect((await pool.query("SELECT count(*)::int n FROM audit_log WHERE workspace_id=$1", [workspaceId])).rows[0].n).toBe(0);
  });
  it("1001 sentinel refuses the complete batch before changing any job", async () => {
    const id = await blocked();
    await pool.query(`INSERT INTO jobs(workspace_id,job_type,payload,credential_owner_user_id,status,last_error)
      SELECT workspace_id,job_type,payload,credential_owner_user_id,status,last_error FROM jobs CROSS JOIN generate_series(1,1000) WHERE id=$1`, [id]);
    await expect(recover()).rejects.toThrow(/^Qihang identity recovery failed$/);
    expect((await pool.query("SELECT count(*)::int n FROM jobs WHERE workspace_id=$1 AND status='blocked_auth'", [workspaceId])).rows[0].n).toBe(1001);
    expect((await pool.query("SELECT count(*)::int n FROM audit_log WHERE workspace_id=$1", [workspaceId])).rows[0].n).toBe(0);
  });
  it("over-limit live grants are not silently truncated into an approval", async () => {
    await blocked();
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) SELECT $1,'KUAISHOU','synthetic-overflow-'||n FROM generate_series(1,1000) n", [workspaceId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) SELECT $1,$2,'KUAISHOU','synthetic-overflow-'||n,'read' FROM generate_series(1,1000) n", [workspaceId, identityId]);
    await expect(recover()).rejects.toThrow(/^Qihang identity recovery failed$/);
    expect((await pool.query("SELECT count(*)::int n FROM jobs WHERE workspace_id=$1 AND status='blocked_auth'", [workspaceId])).rows[0].n).toBe(1);
  });
});
