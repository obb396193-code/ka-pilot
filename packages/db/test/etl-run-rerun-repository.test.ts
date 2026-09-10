import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { EtlRunRerunRepository } from "../src/etl-run-rerun-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic local test DB required");
describe("ETL rerun atomic queue / real PG", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const repository = new EtlRunRerunRepository(pool);
  const workspaces: string[] = [], identities: string[] = [];
  let auth: ApprovedWorkspaceAuthContext, sourceJobId: string, sourceRunId: string, owner: string, payload: Record<string, unknown>;
  beforeAll(async () => { await runMigrations({ databaseUrl }); }, 30000);
  beforeEach(async () => {
    const workspaceId = randomUUID(), userId = randomUUID(), identity = randomUUID(); owner = randomUUID();
    workspaces.push(workspaceId); identities.push(identity);
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic rerun')", [workspaceId]);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$3,'synthetic admin','admin'),($2,$3,'synthetic owner','optimizer')", [userId, owner, workspaceId]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'synthetic')", [identity]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,user_id,identity_id,role) VALUES($1,$2,$3,'admin')", [workspaceId, userId, identity]);
    auth = { workspaceId, userId, role: "admin", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
    payload = { workspaceId, media: "KUAISHOU", accountIds: ["same"], asOfDate: "2026-09-01", initiatorUserId: owner,
      authorizationSnapshot: { workspaceId, identityId: identity, userId: owner, role: "optimizer", allowedAccounts: [
        { media: "KUAISHOU", accountId: "same", accessLevel: "read" },
      ] } };
    sourceJobId = randomUUID();
    await pool.query(`INSERT INTO jobs(id,workspace_id,job_type,payload,credential_owner_user_id,status,priority,max_attempts,attempts)
      VALUES($1,$2,'etl_full',$3,$4,'failed',7,4,4)`, [sourceJobId, workspaceId, payload, owner]);
    const result = await pool.query(`INSERT INTO etl_runs(workspace_id,job_id,run_kind,scope,status,started_at,finished_at)
      VALUES($1,$2,'full',$3,'failed',now()-interval '1 hour',now()) RETURNING id::text`, [workspaceId, sourceJobId, { workspaceId }]);
    sourceRunId = result.rows[0].id;
  });
  afterAll(async () => {
    try {
      for (const table of ["audit_log", "etl_runs", "jobs", "workspace_memberships", "users"])
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [workspaces]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [workspaces]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [identities]);
    } finally { await pool.end(); }
  });
  const counts = async () => (await pool.query("SELECT count(*)::int AS n FROM jobs WHERE workspace_id=$1", [auth.workspaceId])).rows[0].n;
  const setStatus = (id: string, status: string) => pool.query(`UPDATE jobs SET status=$2,
    lease_token=CASE WHEN $2 IN ('leased','running') THEN gen_random_uuid() ELSE NULL END,
    lease_until=CASE WHEN $2 IN ('leased','running') THEN now()+interval '1 minute' ELSE NULL END WHERE id=$1`, [id, status]);
  it.each(["done", "failed", "blocked_auth"])("creates a new %s rerun preserving original scope/owner and audit", async status => {
    await setStatus(sourceJobId, status);
    const original = (await pool.query("SELECT * FROM jobs WHERE id=$1", [sourceJobId])).rows[0];
    const result = await repository.rerun(auth, sourceRunId);
    expect(result).toMatchObject({ workspaceId: auth.workspaceId, data: { sourceRunId } });
    const next = (await pool.query("SELECT * FROM jobs WHERE id=$1", [result.data.jobId])).rows[0];
    expect(next).toMatchObject({ workspace_id: auth.workspaceId, job_type: "etl_full", payload, credential_owner_user_id: owner,
      status: "queued", attempts: 0, priority: 7, max_attempts: 4, lease_token: null });
    expect(next.id).not.toBe(sourceJobId); expect(next.credential_owner_user_id).not.toBe(auth.userId);
    expect((await pool.query("SELECT * FROM jobs WHERE id=$1", [sourceJobId])).rows[0]).toEqual(original);
    expect((await pool.query("SELECT action,object_type,object_id,detail,user_id FROM audit_log WHERE workspace_id=$1", [auth.workspaceId])).rows)
      .toEqual([{ action: "etl_run.rerun", object_type: "etl_run", object_id: sourceRunId,
        detail: { sourceJobId, jobId: next.id }, user_id: auth.userId }]);
  });
  it.each(["queued", "leased", "running"])("rejects active original job %s", async status => {
    await setStatus(sourceJobId, status);
    await expect(repository.rerun(auth, sourceRunId)).rejects.toMatchObject({ code: "INVALID_STATE" }); expect(await counts()).toBe(1);
  });
  it("concurrent duplicate clicks create one job; activity conflicts then completed rerun permits a new one", async () => {
    const results = await Promise.allSettled([repository.rerun(auth, sourceRunId), repository.rerun(auth, sourceRunId)]);
    const success = results.find(result => result.status === "fulfilled");
    if (!success || success.status !== "fulfilled") throw new Error("Expected one successful rerun");
    const id = success.value.data.jobId;
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT", jobId: id } });
    for (const status of ["queued", "leased", "running"]) {
      await setStatus(id, status);
      await expect(repository.rerun(auth, sourceRunId)).rejects.toMatchObject({ code: "CONFLICT", jobId: id });
    }
    await setStatus(id, "done");
    expect((await repository.rerun(auth, sourceRunId)).data.jobId).not.toBe(id); expect(await counts()).toBe(3);
  });
  it("preserves BIGINT run IDs beyond JS integer precision", async () => {
    const exact = "9007199254740993";
    // Own source only; restore the original ID so independent suites never share this synthetic key.
    await pool.query("UPDATE etl_runs SET id=$2 WHERE id=$1 AND workspace_id=$3", [sourceRunId, exact, auth.workspaceId]);
    try { expect((await repository.rerun(auth, exact)).data.sourceRunId).toBe(exact); }
    finally { await pool.query("UPDATE etl_runs SET id=$2 WHERE id=$1 AND workspace_id=$3", [exact, sourceRunId, auth.workspaceId]); }
  });
  it("rejects unknown/cross-workspace source IDs and never falls back to another owner", async () => {
    await pool.query("UPDATE etl_runs SET workspace_id=$2 WHERE id=$1", [sourceRunId, randomUUID()]);
    try { await expect(repository.rerun(auth, sourceRunId)).rejects.toMatchObject({ code: "NOT_FOUND" }); }
    finally { await pool.query("UPDATE etl_runs SET workspace_id=$2 WHERE id=$1", [sourceRunId, auth.workspaceId]); }
    await pool.query("UPDATE jobs SET credential_owner_user_id=$2 WHERE id=$1", [sourceJobId, randomUUID()]);
    await expect(repository.rerun(auth, sourceRunId)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" }); expect(await counts()).toBe(1);
  });
  it.each(["payload", "type", "job_workspace", "running_run"])("rejects corrupt source %s", async kind => {
    if (kind === "payload") await pool.query("UPDATE jobs SET payload=$2 WHERE id=$1", [sourceJobId, { workspaceId: randomUUID() }]);
    if (kind === "type") await pool.query("UPDATE jobs SET job_type='changeset_execute' WHERE id=$1", [sourceJobId]);
    if (kind === "job_workspace") await pool.query("UPDATE jobs SET workspace_id=$2 WHERE id=$1", [sourceJobId, randomUUID()]);
    if (kind === "running_run") await pool.query("UPDATE etl_runs SET status='running' WHERE id=$1", [sourceRunId]);
    try { await expect(repository.rerun(auth, sourceRunId)).rejects.toMatchObject({ code: kind === "running_run" ? "INVALID_STATE" : "UPSTREAM_INVALID_RESPONSE" }); }
    finally { if (kind === "job_workspace") await pool.query("UPDATE jobs SET workspace_id=$2 WHERE id=$1", [sourceJobId, auth.workspaceId]); }
  });
  it("does not materialize a payload at the 16MiB limit", async () => {
    await pool.query(`UPDATE jobs SET payload=jsonb_build_object('workspaceId',$2::text,'synthetic',repeat('x',
      16777216-octet_length(jsonb_build_object('workspaceId',$2::text,'synthetic','')::text))) WHERE id=$1`, [sourceJobId, auth.workspaceId]);
    expect((await pool.query("SELECT octet_length(payload::text) AS bytes FROM jobs WHERE id=$1", [sourceJobId])).rows[0].bytes).toBe(16777216);
    await expect(repository.rerun(auth, sourceRunId)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" }); expect(await counts()).toBe(1);
  });
  it("preserves a null system-job credential owner without substituting the administrator", async () => {
    await pool.query("UPDATE jobs SET credential_owner_user_id=NULL,payload=$2 WHERE id=$1", [sourceJobId, { workspaceId: auth.workspaceId }]);
    const result = await repository.rerun(auth, sourceRunId);
    expect((await pool.query("SELECT credential_owner_user_id,payload FROM jobs WHERE id=$1", [result.data.jobId])).rows[0])
      .toEqual({ credential_owner_user_id: null, payload: { workspaceId: auth.workspaceId } });
  });
  it.each(["credentialOwnerUserId", "initiatorUserId", "authorizationSnapshot"])("rejects mismatched payload binding %s", async field => {
    const value = field === "authorizationSnapshot" ? { workspaceId: auth.workspaceId, userId: auth.userId } : randomUUID();
    await pool.query("UPDATE jobs SET payload=$2 WHERE id=$1", [sourceJobId, { ...payload, [field]: value }]);
    await expect(repository.rerun(auth, sourceRunId)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" }); expect(await counts()).toBe(1);
  });
  it.each(["identity", "membership", "user", "workspace", "role"])("rechecks live admin %s", async kind => {
    if (kind === "identity") await pool.query("UPDATE auth_identities SET is_active=false WHERE id=$1", [identities.at(-1)]);
    if (kind === "membership") await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [auth.workspaceId]);
    if (kind === "user") await pool.query("UPDATE users SET is_active=false WHERE id=$1", [auth.userId]);
    if (kind === "workspace") await pool.query("UPDATE workspaces SET is_active=false WHERE id=$1", [auth.workspaceId]);
    if (kind === "role") await pool.query("UPDATE workspace_memberships SET role='optimizer' WHERE workspace_id=$1", [auth.workspaceId]);
    await expect(repository.rerun(auth, sourceRunId)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(await counts()).toBe(1);
  });
  it("audit failure rolls back enqueue and hides internal error text", async () => {
    const hooked = new EtlRunRerunRepository({ connect: async () => {
      const client = await pool.connect();
      return { release: client.release.bind(client), query: (sql: string, values?: unknown[]) => {
        if (sql.includes("etl-rerun-audit")) throw new Error("synthetic private SQL/token");
        return client.query(sql, values);
      } };
    } } as never);
    await expect(hooked.rerun(auth, sourceRunId)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE", message: "ETL rerun: SOURCE_UNAVAILABLE" });
    expect(await counts()).toBe(1);
    expect((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE workspace_id=$1", [auth.workspaceId])).rows[0].n).toBe(0);
  });
  it("rejects invalid auth/IDs before connecting", async () => {
    const denied = new EtlRunRerunRepository({ connect: () => { throw new Error("Must not connect"); } } as never);
    for (const role of ["viewer", "operator", "optimizer", "lead"]) await expect(denied.rerun({ ...auth, role }, sourceRunId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const id of ["0", "01", "1e3", "9223372036854775808", randomUUID()]) await expect(denied.rerun(auth, id)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});
