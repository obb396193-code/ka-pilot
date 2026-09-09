import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";

import {
  JobRepository,
  CredentialRepository,
  WorkspaceSyncRepository,
  runMigrations,
} from "@ka/db";

import { WorkspaceSyncTickService } from "../src/scheduling/workspace-sync-service.js";
import { JobConsumer } from "../src/jobs/consumer.js";
import { withQihangIdentity } from "../src/jobs/identity.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("workspace sync scheduler with PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const jobs = new JobRepository(pool);
  const service = new WorkspaceSyncTickService(
    new WorkspaceSyncRepository(pool),
    jobs,
  );
  let workspaceId: string;
  let userId: string;
  let identityId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    const suffix = randomUUID();
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
      [`scheduler-pg-${suffix}`],
    );
    workspaceId = workspace.rows[0]!.id;
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, name, qihang_user_id)
       VALUES ($1, 'scheduler-owner', 'private-qihang-id') RETURNING id`,
      [workspaceId],
    );
    userId = user.rows[0]!.id;
    const identity = await pool.query<{ id: string }>(
      `INSERT INTO auth_identities (provider, provider_subject, display_name)
       VALUES ('internal_test', $1, 'scheduler identity') RETURNING id`,
      [`scheduler-${suffix}`],
    );
    identityId = identity.rows[0]!.id;
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, identity_id, user_id, role)
       VALUES ($1, $2, $3, 'optimizer')`,
      [workspaceId, identityId, userId],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM etl_runs WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM jobs WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM account_access_grants WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM workspace_memberships WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM accounts WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM users WHERE workspace_id = $1", [workspaceId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id = $1", [identityId]);
    await pool.end();
  });

  it("persists blocked_auth and no executable scope when the user has no grant", async () => {
    const result = await service.execute({
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T20:00:00Z",
    });
    expect(result.jobs[0]).toMatchObject({
      jobType: "etl_full",
      status: "blocked_auth",
      reason: "ACCOUNT_SCOPE_MISSING",
    });
    const stored = await pool.query<{
      status: string;
      payload: Record<string, unknown>;
    }>("SELECT status, payload FROM jobs WHERE id = $1", [result.jobs[0]!.jobId]);
    expect(stored.rows[0]?.status).toBe("blocked_auth");
    expect(stored.rows[0]?.payload).not.toHaveProperty("accountIds");
    expect(stored.rows[0]?.payload.authorizationSnapshot).toEqual({
      workspaceId,
      userId,
      status: "blocked_auth",
      reason: "ACCOUNT_SCOPE_MISSING",
    });

    await pool.query("DELETE FROM jobs WHERE id = $1", [result.jobs[0]!.jobId]);
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'account-1')`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO account_access_grants (
         workspace_id, identity_id, media, account_id, access_level
       ) VALUES ($1, $2, 'KUAISHOU', 'account-1', 'read')`,
      [workspaceId, identityId],
    );
  });

  it("makes concurrent first-full ticks one job and keeps retries on the original owner", async () => {
    const request = {
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T20:00:00Z",
    };
    const [left, right] = await Promise.all([
      service.execute(request),
      service.execute(request),
    ]);

    expect(new Set([left.jobs[0]?.jobId, right.jobs[0]?.jobId]).size).toBe(1);
    expect([left.jobs[0]?.idempotent, right.jobs[0]?.idempotent].sort()).toEqual([false, true]);
    const stored = await pool.query<{
      id: string;
      credential_owner_user_id: string;
      payload: Record<string, unknown>;
    }>("SELECT id, credential_owner_user_id, payload FROM jobs WHERE workspace_id = $1", [workspaceId]);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]?.credential_owner_user_id).toBe(userId);
    expect(JSON.stringify(stored.rows[0]?.payload)).not.toContain("private-qihang-id");

    await pool.query(
      "UPDATE jobs SET priority = -32768, run_after = now() - interval '1 second' WHERE id = $1",
      [stored.rows[0]!.id],
    );
    const leased = await jobs.leaseNext(60);
    expect(leased?.id).toBe(stored.rows[0]?.id);
    await jobs.markRunning(leased!);
    await jobs.markFailure(leased!, "retryable timeout", new Date("2026-08-25T20:01:00Z"));
    const retry = await pool.query<{
      status: string;
      credential_owner_user_id: string;
    }>("SELECT status, credential_owner_user_id FROM jobs WHERE id = $1", [leased!.id]);
    expect(retry.rows[0]).toEqual({
      status: "queued",
      credential_owner_user_id: userId,
    });
  });

  it("does not schedule incremental work before full success, then freezes granted tuples", async () => {
    const first = await pool.query<{ id: string }>(
      "SELECT id FROM jobs WHERE workspace_id = $1 AND job_type = 'etl_full'",
      [workspaceId],
    );
    await pool.query(
      "UPDATE jobs SET status = 'done', finished_at = now(), run_after = now() WHERE id = $1",
      [first.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO etl_runs (
         workspace_id, job_id, run_kind, scope, started_at, finished_at, status, rows_ingested
       ) VALUES ($1, $2, 'full', '{}'::jsonb, now(), now(), 'done', 1)`,
      [workspaceId, first.rows[0]!.id],
    );
    const result = await service.execute({
      workspaceId,
      media: "KUAISHOU",
      mode: "auto",
      triggeredAt: "2026-08-25T20:00:00Z",
    });
    expect(result.jobs[0]).toMatchObject({ jobType: "etl_incr", status: "queued" });
    const stored = await pool.query<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM jobs WHERE id = $1",
      [result.jobs[0]!.jobId],
    );
    expect(stored.rows[0]?.payload).toMatchObject({
      accountIds: ["account-1"],
      authorizationSnapshot: {
        identityId,
        userId,
        allowedAccounts: [{ media: "KUAISHOU", accountId: "account-1" }],
      },
    });
  });

  it("blocks a queued full job after revocation, before any upstream handler", async () => {
    const result = await service.execute({ workspaceId, media: "KUAISHOU", mode: "full", triggeredAt: "2026-08-27T20:00:00Z" });
    const jobId = result.jobs[0]!.jobId;
    expect(result.jobs[0]?.status).toBe("queued");
    await pool.query("UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1", [workspaceId]);
    const upstream = vi.fn().mockResolvedValue(undefined);
    // Lease only this synthetic workspace/type; never consume another suite's jobs.
    const consumer = new JobConsumer(new JobRepository(pool, { workspaceId, jobTypes: ["etl_full"] }), {
      etl_full: withQihangIdentity(upstream, new CredentialRepository(pool), "must-not-fallback"),
    });
    expect(await consumer.processOnce()).toBe(true);
    expect(upstream).not.toHaveBeenCalled();
    expect((await pool.query("SELECT status,credential_owner_user_id,payload FROM jobs WHERE id=$1", [jobId])).rows).toMatchObject([{
      status: "blocked_auth", credential_owner_user_id: userId,
      payload: { accountIds: ["account-1"], authorizationSnapshot: { identityId, userId } },
    }]);
  });
});
