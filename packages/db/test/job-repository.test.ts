import { beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import { JobRepository } from "../src/job-repository.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("JobRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const repository = new JobRepository(pool);

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  it("leases a queued job exactly once under concurrent consumers", async () => {
    await pool.query("DELETE FROM jobs");
    const inserted = await pool.query<{ id: string }>(`
      INSERT INTO jobs (job_type, payload, priority, max_attempts)
      VALUES ('etl_incr', '{"userId":"u1"}'::jsonb, 1, 3)
      RETURNING id
    `);

    const [left, right] = await Promise.all([
      repository.leaseNext(60),
      repository.leaseNext(60),
    ]);

    const leased = [left, right].filter((job) => job !== null);
    expect(leased).toHaveLength(1);
    expect(leased[0]?.id).toBe(inserted.rows[0]?.id);
    expect(leased[0]?.status).toBe("leased");
    expect(leased[0]?.attempts).toBe(1);
  });

  it("requeues retryable failures and terminally fails exhausted jobs", async () => {
    await pool.query("DELETE FROM jobs");
    const first = await pool.query<{ id: string }>(`
      INSERT INTO jobs (job_type, attempts, max_attempts)
      VALUES ('etl_full', 0, 2)
      RETURNING id
    `);
    const job = await repository.leaseNext(60);
    expect(job?.id).toBe(first.rows[0]?.id);

    await repository.markRunning(job!.id);
    await repository.markFailure(job!, "gateway timeout", new Date(Date.now() + 5_000));
    let state = await pool.query<{ status: string; last_error: string }>(
      "SELECT status, last_error FROM jobs WHERE id = $1",
      [job!.id],
    );
    expect(state.rows[0]).toMatchObject({ status: "queued", last_error: "gateway timeout" });

    await pool.query("UPDATE jobs SET run_after = now() - interval '1 second' WHERE id = $1", [
      job!.id,
    ]);
    const retry = await repository.leaseNext(60);
    expect(retry?.attempts).toBe(2);
    await repository.markFailure(retry!, "still failing", new Date());
    state = await pool.query<{ status: string; last_error: string }>(
      "SELECT status, last_error FROM jobs WHERE id = $1",
      [job!.id],
    );
    expect(state.rows[0]).toMatchObject({ status: "failed", last_error: "still failing" });
  });

  it("marks blocked auth without changing credential ownership", async () => {
    await pool.query("DELETE FROM jobs");
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('test-workspace') RETURNING id",
    );
    const user = await pool.query<{ id: string }>(
      "INSERT INTO users (workspace_id, name) VALUES ($1, 'owner') RETURNING id",
      [workspace.rows[0]?.id],
    );
    await pool.query(
      "INSERT INTO jobs (job_type, credential_owner_user_id) VALUES ('etl_incr', $1)",
      [user.rows[0]?.id],
    );
    const job = await repository.leaseNext(60);
    await repository.markBlockedAuth(job!.id, "credential expired");

    const state = await pool.query<{
      status: string;
      credential_owner_user_id: string;
    }>("SELECT status, credential_owner_user_id FROM jobs WHERE id = $1", [job!.id]);
    expect(state.rows[0]).toEqual({
      status: "blocked_auth",
      credential_owner_user_id: user.rows[0]?.id,
    });
  });

  it("enqueues a scoped job with explicit credential ownership", async () => {
    await pool.query("DELETE FROM jobs");
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('enqueue-workspace') RETURNING id",
    );
    const user = await pool.query<{ id: string }>(
      "INSERT INTO users (workspace_id, name) VALUES ($1, 'enqueue-owner') RETURNING id",
      [workspace.rows[0]?.id],
    );

    const id = await repository.enqueue({
      workspaceId: workspace.rows[0]!.id,
      jobType: "agent_task",
      payload: { prompt: "分析异常" },
      priority: 3,
      credentialOwnerUserId: user.rows[0]!.id,
      maxAttempts: 2,
    });

    const result = await pool.query<{
      id: string;
      status: string;
      credential_owner_user_id: string;
    }>("SELECT id, status, credential_owner_user_id FROM jobs WHERE id = $1", [id]);
    expect(result.rows[0]).toEqual({
      id,
      status: "queued",
      credential_owner_user_id: user.rows[0]!.id,
    });
  });

  it("enqueues a deterministic job idempotently without changing its owner", async () => {
    await pool.query("DELETE FROM jobs");
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('idempotent-workspace') RETURNING id",
    );
    const owners = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, name)
       VALUES ($1, 'owner-a'), ($1, 'owner-b') RETURNING id`,
      [workspace.rows[0]!.id],
    );
    const deterministicId = "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa";
    const input = {
      id: deterministicId,
      workspaceId: workspace.rows[0]!.id,
      jobType: "backfill_day",
      payload: { backfillId: 7, ds: "2026-08-19" },
      priority: 9,
      credentialOwnerUserId: owners.rows[0]!.id,
    };

    await expect(repository.enqueue(input)).resolves.toBe(deterministicId);
    await expect(repository.enqueue(input)).resolves.toBe(deterministicId);
    await expect(
      repository.enqueue({ ...input, credentialOwnerUserId: owners.rows[1]!.id }),
    ).rejects.toThrow("conflicts with an existing job");

    const result = await pool.query<{ count: string; credential_owner_user_id: string }>(
      `SELECT count(*)::text AS count, max(credential_owner_user_id::text) AS credential_owner_user_id
       FROM jobs WHERE id = $1`,
      [deterministicId],
    );
    expect(result.rows[0]).toEqual({
      count: "1",
      credential_owner_user_id: owners.rows[0]!.id,
    });
  });

  it("extends active leases and recovers only leases stale beyond the startup threshold", async () => {
    await pool.query("DELETE FROM jobs");
    const inserted = await pool.query<{ id: string; job_type: string }>(`
      INSERT INTO jobs (job_type, status, lease_until, attempts, max_attempts)
      VALUES
        ('recover-me', 'running', now() - interval '11 minutes', 1, 3),
        ('fail-me', 'leased', now() - interval '12 minutes', 3, 3),
        ('still-fresh', 'running', now() - interval '5 minutes', 1, 3),
        ('heartbeat', 'running', now() + interval '1 minute', 1, 3)
      RETURNING id, job_type
    `);
    const heartbeat = inserted.rows.find((row) => row.job_type === "heartbeat")!;

    await repository.extendLease(heartbeat.id, 120);
    const lease = await pool.query<{ extended: boolean }>(
      "SELECT lease_until > now() + interval '100 seconds' AS extended FROM jobs WHERE id = $1",
      [heartbeat.id],
    );
    expect(lease.rows[0]?.extended).toBe(true);

    const recovery = await repository.recoverStaleLeases(600);
    expect(recovery.requeued).toBe(1);
    expect(recovery.failed.map((job) => job.jobType)).toEqual(["fail-me"]);

    const states = await pool.query<{ job_type: string; status: string }>(
      "SELECT job_type, status FROM jobs ORDER BY job_type",
    );
    expect(states.rows).toEqual([
      { job_type: "fail-me", status: "failed" },
      { job_type: "heartbeat", status: "running" },
      { job_type: "recover-me", status: "queued" },
      { job_type: "still-fresh", status: "running" },
    ]);
  });
});
