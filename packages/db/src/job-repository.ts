import type { Pool, PoolClient } from "pg";

export type JobStatus =
  | "queued"
  | "leased"
  | "running"
  | "done"
  | "failed"
  | "blocked_auth";

export interface JobRecord {
  id: string;
  workspaceId: string | null;
  jobType: string;
  payload: Record<string, unknown>;
  priority: number;
  credentialOwnerUserId: string | null;
  status: JobStatus;
  leaseUntil: Date | null;
  leaseToken: string | null;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
}

export interface JobLeaseIdentity {
  id: string;
  leaseToken: string | null;
}

export class LostJobLeaseError extends Error {
  constructor(id: string) {
    super(`Job ${id} lease is no longer owned by this worker`);
    this.name = "LostJobLeaseError";
  }
}

export interface JobRepositoryPort {
  leaseNext(leaseSeconds: number): Promise<JobRecord | null>;
  markRunning(job: JobLeaseIdentity): Promise<void>;
  markDone(job: JobLeaseIdentity): Promise<void>;
  markFailure(job: JobRecord, message: string, retryAt: Date): Promise<void>;
  markBlockedAuth(job: JobLeaseIdentity, message: string): Promise<void>;
  extendLease(job: JobLeaseIdentity, leaseSeconds: number): Promise<void>;
}

export interface NewJob {
  id?: string;
  workspaceId: string | null;
  jobType: string;
  payload: Record<string, unknown>;
  priority?: number;
  credentialOwnerUserId: string | null;
  maxAttempts?: number;
  runAfter?: Date;
}

export interface JobEnqueuerPort {
  enqueue(job: NewJob): Promise<string>;
}

type JobRow = {
  id: string;
  workspace_id: string | null;
  job_type: string;
  payload: Record<string, unknown> | null;
  priority: number | null;
  credential_owner_user_id: string | null;
  status: JobStatus;
  lease_until: Date | null;
  lease_token: string | null;
  attempts: number | null;
  max_attempts: number | null;
  run_after: Date;
};

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    jobType: row.job_type,
    payload: row.payload ?? {},
    priority: row.priority ?? 5,
    credentialOwnerUserId: row.credential_owner_user_id,
    status: row.status,
    leaseUntil: row.lease_until,
    leaseToken: row.lease_token,
    attempts: row.attempts ?? 0,
    maxAttempts: row.max_attempts ?? 3,
    runAfter: row.run_after,
  };
}

async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class JobRepository implements JobRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async enqueue(job: NewJob): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO jobs (
         id, workspace_id, job_type, payload, priority, credential_owner_user_id,
         max_attempts, run_after, status
       ) VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, 'queued')
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        job.id ?? null,
        job.workspaceId,
        job.jobType,
        job.payload,
        job.priority ?? 5,
        job.credentialOwnerUserId,
        job.maxAttempts ?? 3,
        job.runAfter ?? new Date(),
      ],
    );
    const id = result.rows[0]?.id;
    if (id) {
      return id;
    }
    if (!job.id) {
      throw new Error("Failed to enqueue job");
    }
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM jobs
       WHERE id = $1
         AND workspace_id IS NOT DISTINCT FROM $2::uuid
         AND job_type = $3
         AND payload = $4::jsonb
         AND priority = $5
         AND credential_owner_user_id IS NOT DISTINCT FROM $6::uuid
         AND max_attempts = $7`,
      [
        job.id,
        job.workspaceId,
        job.jobType,
        job.payload,
        job.priority ?? 5,
        job.credentialOwnerUserId,
        job.maxAttempts ?? 3,
      ],
    );
    if (existing.rows[0]) {
      return existing.rows[0].id;
    }
    throw new Error(`Deterministic job ${job.id} conflicts with an existing job`);
  }

  async leaseNext(leaseSeconds: number): Promise<JobRecord | null> {
    if (!Number.isInteger(leaseSeconds) || leaseSeconds <= 0) {
      throw new Error("leaseSeconds must be a positive integer");
    }
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<JobRow>(
        `
          WITH candidate AS (
            SELECT id
            FROM jobs
            WHERE run_after <= now()
              AND (
                status = 'queued'
                OR (status IN ('leased', 'running') AND lease_until < now())
              )
            ORDER BY priority ASC, run_after ASC, created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE jobs AS job
          SET status = 'leased',
              lease_until = now() + ($1 * interval '1 second'),
              lease_token = gen_random_uuid(),
              attempts = job.attempts + 1,
              last_error = NULL,
              finished_at = NULL
          FROM candidate
          WHERE job.id = candidate.id
          RETURNING job.*
        `,
        [leaseSeconds],
      );
      const row = result.rows[0];
      return row ? mapJob(row) : null;
    });
  }

  async markRunning(job: JobLeaseIdentity): Promise<void> {
    await this.updateExpectedStatus(
      job,
      "UPDATE jobs SET status = 'running' WHERE id = $1 AND lease_token = $2 AND status = 'leased'",
    );
  }

  async markDone(job: JobLeaseIdentity): Promise<void> {
    await this.updateExpectedStatus(
      job,
      `UPDATE jobs
       SET status = 'done', lease_until = NULL, lease_token = NULL,
           finished_at = now(), last_error = NULL
       WHERE id = $1 AND lease_token = $2 AND status = 'running'`,
    );
  }

  async markFailure(job: JobRecord, message: string, retryAt: Date): Promise<void> {
    const safeMessage = message.slice(0, 2_000);
    const leaseToken = requireLeaseToken(job);
    if (job.attempts >= job.maxAttempts) {
      const result = await this.pool.query(
        `UPDATE jobs
         SET status = 'failed', lease_until = NULL, lease_token = NULL,
             finished_at = now(), last_error = $3
         WHERE id = $1 AND lease_token = $2 AND status IN ('leased', 'running')`,
        [job.id, leaseToken, safeMessage],
      );
      assertLeaseMutation(result.rowCount, job.id);
      return;
    }
    const result = await this.pool.query(
      `UPDATE jobs
       SET status = 'queued', lease_until = NULL, lease_token = NULL,
           run_after = $3, last_error = $4
       WHERE id = $1 AND lease_token = $2 AND status IN ('leased', 'running')`,
      [job.id, leaseToken, retryAt, safeMessage],
    );
    assertLeaseMutation(result.rowCount, job.id);
  }

  async markBlockedAuth(job: JobLeaseIdentity, message: string): Promise<void> {
    const leaseToken = requireLeaseToken(job);
    const result = await this.pool.query(
      `UPDATE jobs
       SET status = 'blocked_auth', lease_until = NULL, lease_token = NULL,
           finished_at = now(), last_error = $3
       WHERE id = $1 AND lease_token = $2 AND status IN ('leased', 'running')`,
      [job.id, leaseToken, message.slice(0, 2_000)],
    );
    assertLeaseMutation(result.rowCount, job.id);
  }

  async extendLease(job: JobLeaseIdentity, leaseSeconds: number): Promise<void> {
    if (!Number.isInteger(leaseSeconds) || leaseSeconds <= 0) {
      throw new Error("leaseSeconds must be a positive integer");
    }
    const leaseToken = requireLeaseToken(job);
    const result = await this.pool.query(
      `UPDATE jobs
       SET lease_until = now() + ($3 * interval '1 second')
       WHERE id = $1 AND lease_token = $2 AND status = 'running'`,
      [job.id, leaseToken, leaseSeconds],
    );
    assertLeaseMutation(result.rowCount, job.id);
  }

  async recoverStaleLeases(staleSeconds: number): Promise<{
    requeued: number;
    failed: JobRecord[];
  }> {
    if (!Number.isInteger(staleSeconds) || staleSeconds <= 0) {
      throw new Error("staleSeconds must be a positive integer");
    }
    const result = await this.pool.query<JobRow>(
      `UPDATE jobs
       SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
           lease_until = NULL,
           lease_token = NULL,
           run_after = CASE WHEN attempts >= max_attempts THEN run_after ELSE now() END,
           finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
           last_error = CASE
             WHEN attempts >= max_attempts THEN 'Lease expired after maximum attempts'
             ELSE 'Recovered stale lease at worker startup'
           END
       WHERE status IN ('leased', 'running')
         AND lease_until < now() - ($1 * interval '1 second')
       RETURNING *`,
      [staleSeconds],
    );
    const recovered = result.rows.map(mapJob);
    return {
      requeued: recovered.filter((job) => job.status === "queued").length,
      failed: recovered.filter((job) => job.status === "failed"),
    };
  }

  private async updateExpectedStatus(
    job: JobLeaseIdentity,
    sql: string,
  ): Promise<void> {
    const result = await this.pool.query(sql, [job.id, requireLeaseToken(job)]);
    assertLeaseMutation(result.rowCount, job.id);
  }
}

function requireLeaseToken(job: JobLeaseIdentity): string {
  if (!job.leaseToken) throw new LostJobLeaseError(job.id);
  return job.leaseToken;
}

function assertLeaseMutation(rowCount: number | null, id: string): void {
  if (rowCount !== 1) throw new LostJobLeaseError(id);
}
