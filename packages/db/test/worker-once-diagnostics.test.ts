import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { WorkerOnceDiagnosticsRepository } from "../src/worker-once-diagnostics-repository.js";

describe("worker read-only diagnostics / real PG", () => {
  const workspaceId = randomUUID(), foreign = randomUUID(), userId = randomUUID(), identityId = randomUUID();
  let pool: Pool, repository: WorkerOnceDiagnosticsRepository;
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated local test DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl }); repository = new WorkerOnceDiagnosticsRepository(pool);
    for (const id of [workspaceId, foreign]) await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic diagnostic')", [id]);
    await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic actor')", [userId, workspaceId]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1,'internal_test',$2,'synthetic diagnostic')", [identityId, `diag-${identityId}`]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'optimizer')", [workspaceId, identityId, userId]);
    for (const media of ["KUAISHOU", "TENCENT"]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'synthetic-same-id')", [workspaceId, media]);
      await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,$3,'synthetic-same-id','read')", [workspaceId, identityId, media]);
    }
    for (const state of ["due", "waiting", "identity", "other", "exhausted", "leased", "expired", "done", "failed"]) {
      const status = ["due", "waiting", "exhausted"].includes(state) ? "queued" : ["identity", "other"].includes(state) ? "blocked_auth" : ["leased", "expired"].includes(state) ? "leased" : state;
      await pool.query(`INSERT INTO jobs(workspace_id,job_type,payload,status,attempts,run_after,last_error,lease_token,lease_until)
        VALUES($1,'etl_full',$2,$3,$4,now()+$5::interval,$6,$7,$8)`, [workspaceId, { media: "KUAISHOU", userId: "synthetic-private" }, status,
        state === "exhausted" ? 3 : 0, state === "waiting" ? "1 hour" : "-1 hour", state === "identity" ? "QIHANG_IDENTITY_MISSING" : "synthetic-private-error",
        ["leased", "expired"].includes(state) ? randomUUID() : null,
        ["leased", "expired"].includes(state) ? new Date(Date.now() + (state === "leased" ? 3600000 : -3600000)) : null]);
    }
    await pool.query("INSERT INTO jobs(workspace_id,job_type,payload) VALUES($1,'etl_full',$2),($3,'etl_full',$4),($3,'changeset_execute',$2)", [foreign, { media: "KUAISHOU" }, workspaceId, { media: "TENCENT" }]);
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["jobs", "account_access_grants", "workspace_memberships", "accounts", "users", "workspaces"]) await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, foreign]]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]); await pool.end();
  });
  it("reports scoped queue counts without private payload/error and leaves every job unchanged", async () => {
    const before = (await pool.query("SELECT * FROM jobs WHERE workspace_id=ANY($1::uuid[]) ORDER BY id", [[workspaceId, foreign]])).rows;
    const result = await repository.read(workspaceId, "KUAISHOU");
    expect(result).toEqual({ workspace: { exists: true, active: true, kind: "personal" }, actors: { activeLinked: 1, missingQihangIdentity: 1, missingGrants: 0 },
      queue: { total: 9, queuedDue: 1, queuedWaiting: 1, blockedIdentity: 1, blockedOther: 1, exhausted: 1, leasedActive: 1, leaseExpired: 1, done: 1, failed: 1, unclassified: 0 } });
    expect(JSON.stringify(result)).not.toContain("synthetic-private");
    expect((await pool.query("SELECT * FROM jobs WHERE workspace_id=ANY($1::uuid[]) ORDER BY id", [[workspaceId, foreign]])).rows).toEqual(before);
  });
  it("checks current media grants, not same-ID foreign media or revoked grants", async () => {
    await pool.query("UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1 AND media='KUAISHOU'", [workspaceId]);
    try { expect((await repository.read(workspaceId, "KUAISHOU")).actors.missingGrants).toBe(1); }
    finally { await pool.query("UPDATE account_access_grants SET revoked_at=NULL WHERE workspace_id=$1", [workspaceId]); }
  });
  it("transaction is actually RR/RO, and missing workspace is explicit", async () => {
    const wrapped = { connect: async () => {
      const client = await pool.connect();
      return { query: async (sql: string, values?: unknown[]) => {
        if (sql.startsWith("SELECT kind")) {
          expect((await client.query("SHOW transaction_read_only")).rows[0].transaction_read_only).toBe("on");
          expect((await client.query("SHOW transaction_isolation")).rows[0].transaction_isolation).toBe("repeatable read");
        }
        return client.query(sql, values);
      }, release: (destroy?: boolean) => client.release(destroy) };
    } } as unknown as Pool;
    expect((await new WorkerOnceDiagnosticsRepository(wrapped).read(randomUUID(), "KUAISHOU")).workspace).toEqual({ exists: false, active: false, kind: null });
  });
});
