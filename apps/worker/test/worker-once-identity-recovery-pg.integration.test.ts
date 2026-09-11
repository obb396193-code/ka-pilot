import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runMigrations, QihangIdentitySeedRepository, JobRepository, WorkspaceSyncRepository } from "@ka/db";
import { QihangClient } from "../src/qihang/client.js";
import { executeWorkerOnceChild } from "../src/scheduling/worker-once-child.js";
import type { WorkerOnceConfig } from "../src/scheduling/worker-once.js";
import { WorkspaceSyncTickService } from "../src/scheduling/workspace-sync-service.js";

describe("identity missing once recovery / real PG", () => {
  const workspaceId = randomUUID(), userId = randomUUID(), identityId = randomUUID();
  let pool: Pool, config: WorkerOnceConfig;
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated local test DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic recovery')", [workspaceId]);
    await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic owner')", [userId, workspaceId]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1,'internal_test',$2,'synthetic recovery')", [identityId, `recovery-${identityId}`]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'optimizer')", [workspaceId, identityId, userId]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-recovery')", [workspaceId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU','synthetic-recovery','read')", [workspaceId, identityId]);
    config = { workspaceId, media: "KUAISHOU", mode: "full", databaseUrl, qihangBaseUrl: "https://synthetic.invalid/get_data", maxMs: 30000, leaseSeconds: 60 };
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["audit_log", "outbound_messages", "etl_runs", "jobs", "account_metrics_daily", "metrics_raw", "account_access_grants", "workspace_memberships", "accounts", "users", "workspaces"]) await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=$1`, [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]); await pool.end();
  });
  it("original once after binding recovers yesterday's job as well as today's without changing its owner/date", async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("userId")).toBe("synthetic-private-recovery");
      expect(url.searchParams.get("accountIds")).toBe(url.searchParams.get("resource") === "account" ? null : "synthetic-recovery");  // F-OS-005
      return Response.json({ successful: true, data: url.searchParams.get("resource") === "account" ? { rows: [], totalNum: 0 } : [] });
    });
    const qihang = new QihangClient({ fetchFn, sleep: async () => undefined });
    await expect(executeWorkerOnceChild(config, "2026-09-08T08:00:00Z", { qihang })).resolves.toMatchObject({ status: "blocked_auth" });
    expect(fetchFn).not.toHaveBeenCalled();
    const before = (await pool.query("SELECT * FROM jobs WHERE workspace_id=$1", [workspaceId])).rows[0];
    expect(before).toMatchObject({ status: "blocked_auth", last_error: "QIHANG_IDENTITY_MISSING", attempts: 0 });
    await new QihangIdentitySeedRepository(pool).bind({ workspace_id: workspaceId, user_id: userId, qihang_user_id: "synthetic-private-recovery" });
    await expect(executeWorkerOnceChild(config, "2026-09-09T08:00:00Z", { qihang })).resolves.toMatchObject({ status: "drained" });
    const after = (await pool.query("SELECT id,status,attempts,payload,credential_owner_user_id FROM jobs WHERE id=$1", [before.id])).rows[0];
    expect(after).toMatchObject({ id: before.id, status: "done", attempts: 1, credential_owner_user_id: userId, payload: { businessDate: "2026-09-08", asOfDate: "2026-09-08" } });
    const audits = (await pool.query("SELECT action,detail FROM audit_log WHERE workspace_id=$1 AND object_id=$2", [workspaceId, before.id])).rows;
    expect(audits).toHaveLength(1); expect(audits[0]).toMatchObject({ action: "job.qihang_identity_recovered", detail: { previousReason: "QIHANG_IDENTITY_MISSING", attempts: 0 } });
    expect(JSON.stringify([after, audits])).not.toContain("synthetic-private-recovery");
  }, 30000);
  it("same-day execution failure resumes original frozen scope even when the owner gains another account", async () => {
    await new QihangIdentitySeedRepository(pool).bind({ workspace_id: workspaceId, user_id: userId, qihang_user_id: "synthetic-private-recovery" });
    const jobs = new JobRepository(pool, { workspaceId, jobTypes: ["etl_full", "etl_incr"] });
    const service = new WorkspaceSyncTickService(new WorkspaceSyncRepository(pool), jobs);
    const at = "2026-09-10T08:00:00Z";
    const queued = await service.execute({ workspaceId, media: "KUAISHOU", mode: "full", triggeredAt: at });
    const jobId = queued.jobs[0]!.jobId, leased = await jobs.leaseNext(60);
    expect(leased?.id).toBe(jobId);
    await jobs.markBlockedAuth(leased!, "Credential owner has no usable Qihang identity");
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-extra')", [workspaceId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU','synthetic-extra','read')", [workspaceId, identityId]);
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("accountIds")).toBe(url.searchParams.get("resource") === "account" ? null : "synthetic-recovery");  // F-OS-005
      return Response.json({ successful: true, data: url.searchParams.get("resource") === "account" ? { rows: [], totalNum: 0 } : [] });
    });
    await expect(executeWorkerOnceChild(config, at, { qihang: new QihangClient({ fetchFn }) })).resolves.toMatchObject({ status: "drained" });
    expect(fetchFn).toHaveBeenCalled();
    expect((await pool.query("SELECT status,attempts,payload FROM jobs WHERE id=$1", [jobId])).rows[0]).toMatchObject({ status: "done", attempts: 2, payload: { accountIds: ["synthetic-recovery"] } });
  }, 30000);
});
