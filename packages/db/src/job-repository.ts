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

export type ScheduledJobInitialState =
  | { status: "queued" }
  | { status: "blocked_auth"; reason: string };

export interface ScheduledJobEnqueueResult {
  id: string;
  inserted: boolean;
}

interface NormalizedNewJob {
  id: string | null;
  workspaceId: string | null;
  jobType: string;
  payload: Record<string, unknown>;
  priority: number;
  credentialOwnerUserId: string | null;
  maxAttempts: number;
  runAfter: Date | null;
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

/** Code-owned selector for one-shot deployments; never accepted from a browser job payload. */
export interface JobLeaseScope {
  readonly workspaceId: string;
  readonly jobTypes: readonly string[];
}

function normalizeLeaseScope(scope: JobLeaseScope | undefined): JobLeaseScope | null {
  if (scope === undefined) return null; // Preserve existing unscoped background-worker API.
  if (scope === null || typeof scope !== "object" ||
    Object.keys(scope).some((key) => key !== "workspaceId" && key !== "jobTypes") ||
    typeof scope.workspaceId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope.workspaceId) ||
    !Array.isArray(scope.jobTypes) || scope.jobTypes.length === 0 || scope.jobTypes.length > 64 ||
    scope.jobTypes.some((type) => typeof type !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(type)) ||
    new Set(scope.jobTypes).size !== scope.jobTypes.length) throw new Error("Invalid job lease scope");
  return Object.freeze({ workspaceId: scope.workspaceId, jobTypes: Object.freeze([...scope.jobTypes]) });
}

export class JobRepository implements JobRepositoryPort {
  private readonly leaseScope: JobLeaseScope | null;
  constructor(private readonly pool: Pool, leaseScope?: JobLeaseScope) {
    this.leaseScope = normalizeLeaseScope(leaseScope);
  }

  async enqueue(job: NewJob): Promise<string> {
    const normalized = normalizeNewJob(job);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO jobs (
         id, workspace_id, job_type, payload, priority, credential_owner_user_id,
         max_attempts, run_after, status
       ) VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()), 'queued')
       ON CONFLICT (id) DO NOTHING
      RETURNING id`,
      [
        normalized.id,
        normalized.workspaceId,
        normalized.jobType,
        normalized.payload,
        normalized.priority,
        normalized.credentialOwnerUserId,
        normalized.maxAttempts,
        normalized.runAfter,
      ],
    );
    const id = result.rows[0]?.id;
    if (id) {
      return id;
    }
    if (normalized.id === null) {
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
        normalized.id,
        normalized.workspaceId,
        normalized.jobType,
        normalized.payload,
        normalized.priority,
        normalized.credentialOwnerUserId,
        normalized.maxAttempts,
      ],
    );
    if (existing.rows[0]) {
      return existing.rows[0].id;
    }
    throw new Error(`Deterministic job ${normalized.id} conflicts with an existing job`);
  }

  async enqueueScheduled(
    job: NewJob,
    initialState: ScheduledJobInitialState,
  ): Promise<ScheduledJobEnqueueResult> {
    const normalized = normalizeNewJob(job);
    if (normalized.id === null) {
      throw new Error("Scheduled job requires a deterministic id");
    }
    const reason = initialState.status === "blocked_auth"
      ? normalizeBlockedReason(initialState.reason)
      : null;
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO jobs (
         id, workspace_id, job_type, payload, priority, credential_owner_user_id,
         max_attempts, run_after, status, last_error, finished_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()), $9, $10,
         CASE WHEN $9 = 'blocked_auth' THEN now() ELSE NULL END
       )
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        normalized.id,
        normalized.workspaceId,
        normalized.jobType,
        normalized.payload,
        normalized.priority,
        normalized.credentialOwnerUserId,
        normalized.maxAttempts,
        normalized.runAfter,
        initialState.status,
        reason,
      ],
    );
    if (inserted.rows[0]) return { id: inserted.rows[0].id, inserted: true };
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id
       FROM jobs
       WHERE id = $1
         AND workspace_id IS NOT DISTINCT FROM $2::uuid
         AND job_type = $3
         AND payload = $4::jsonb
         AND priority = $5
         AND credential_owner_user_id IS NOT DISTINCT FROM $6::uuid
         AND max_attempts = $7
         AND status = $8
         AND last_error IS NOT DISTINCT FROM $9::text`,
      [
        normalized.id,
        normalized.workspaceId,
        normalized.jobType,
        normalized.payload,
        normalized.priority,
        normalized.credentialOwnerUserId,
        normalized.maxAttempts,
        initialState.status,
        reason,
      ],
    );
    if (existing.rows[0]) return { id: existing.rows[0].id, inserted: false };
    throw new Error(`Deterministic job ${normalized.id} conflicts with an existing job`);
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
              AND ($2::uuid IS NULL OR workspace_id = $2)
              AND ($3::text[] IS NULL OR job_type = ANY($3))
              AND ($2::uuid IS NULL OR attempts < max_attempts)
              AND (
                status = 'queued'
                OR (status IN ('leased', 'running') AND lease_until < now())
              )
            ORDER BY priority ASC, run_after ASC, created_at ASC, id ASC
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
        [leaseSeconds, this.leaseScope?.workspaceId ?? null, this.leaseScope?.jobTypes ?? null],
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
         AND ($2::uuid IS NULL OR workspace_id = $2)
         AND ($3::text[] IS NULL OR job_type = ANY($3))
       RETURNING *`,
      [staleSeconds, this.leaseScope?.workspaceId ?? null, this.leaseScope?.jobTypes ?? null],
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

function normalizeNewJob(job: NewJob): NormalizedNewJob {
  return {
    id: job.id ?? null,
    workspaceId: job.workspaceId,
    jobType: job.jobType,
    payload: job.payload,
    priority: job.priority ?? 5,
    credentialOwnerUserId: job.credentialOwnerUserId,
    maxAttempts: job.maxAttempts ?? 3,
    // Immediate work must use the same clock as leaseNext, not the application host clock.
    runAfter: job.runAfter ?? null,
  };
}

function normalizeBlockedReason(reason: string): string {
  if (!/^[A-Z0-9_]{1,100}$/.test(reason)) {
    throw new Error("Blocked auth reason must be a stable code");
  }
  return reason;
}

function requireLeaseToken(job: JobLeaseIdentity): string {
  if (!job.leaseToken) throw new LostJobLeaseError(job.id);
  return job.leaseToken;
}

function assertLeaseMutation(rowCount: number | null, id: string): void {
  if (rowCount !== 1) throw new LostJobLeaseError(id);
}
