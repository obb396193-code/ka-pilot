import type { Pool, PoolClient } from "pg";
import { LostJobLeaseError } from "./job-repository.js";

export const SESSION_CLEANUP_JOB_TYPE = "auth_session_cleanup";
export const SESSION_CLEANUP_BATCH_SIZE = 1000;
export interface SessionCleanupLease { id: string; workspaceId: string; leaseToken: string }
export class SessionCleanupError extends Error {
  constructor() { super("Session cleanup failed"); this.name = "SessionCleanupError"; }
}
function parseLease(input: unknown): SessionCleanupLease {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new SessionCleanupError();
  const row = input as Record<string, unknown>, keys = ["id", "workspaceId", "leaseToken"];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (Object.keys(row).length !== keys.length || keys.some((key) => typeof row[key] !== "string" || !uuid.test(row[key]))) throw new SessionCleanupError();
  return { id: row.id as string, workspaceId: row.workspaceId as string, leaseToken: row.leaseToken as string };
}

/** Server-only maintenance. No browser/payload cutoff, session credentials or unrestricted delete. */
export class SessionCleanupRepository {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async cleanupBatch(input: unknown): Promise<{ deletedCount: number }> {
    const lease = parseLease(input);
    let client: PoolClient;
    try { client = await this.pool.connect(); } catch { throw new SessionCleanupError(); }
    let destroy = false;
    const onError = (): void => { destroy = true; };
    client.on("error", onError);
    const params = [lease.id, lease.workspaceId, lease.leaseToken, SESSION_CLEANUP_JOB_TYPE];
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query("SET LOCAL lock_timeout='2s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout='10s'");
      const locked = await client.query(
        `SELECT id FROM jobs WHERE id=$1 AND workspace_id=$2 AND lease_token=$3
           AND job_type=$4 AND status='running' AND lease_until > clock_timestamp()
           AND credential_owner_user_id IS NULL AND payload='{}'::jsonb FOR UPDATE`, params,
      );
      if (locked.rowCount !== 1) throw new LostJobLeaseError(lease.id);
      // Recheck wall time after any lock wait; keep that job lock through DELETE + COMMIT.
      // Session locks are SKIP LOCKED so a concurrent switch/revoke owns its row first.
      const result = await client.query<{ lease_valid: boolean; deleted_count: number }>(
        `WITH authorized AS MATERIALIZED (
          SELECT id FROM jobs WHERE id=$1 AND workspace_id=$2 AND lease_token=$3
            AND job_type=$4 AND status='running' AND lease_until > clock_timestamp()
            AND credential_owner_user_id IS NULL AND payload='{}'::jsonb
        ), candidates AS MATERIALIZED (
          SELECT session.id FROM auth_sessions AS session
          WHERE session.active_workspace_id=$2 AND EXISTS(SELECT 1 FROM authorized)
            AND (session.expires_at < CURRENT_TIMESTAMP - interval '720 hours'
              OR session.revoked_at < CURRENT_TIMESTAMP - interval '720 hours')
          ORDER BY LEAST(session.expires_at, session.revoked_at), session.id
          LIMIT ${SESSION_CLEANUP_BATCH_SIZE} FOR UPDATE OF session SKIP LOCKED
        ), deleted AS (
          DELETE FROM auth_sessions AS session USING candidates
          WHERE session.id=candidates.id AND session.active_workspace_id=$2
          RETURNING 1
        ) SELECT EXISTS(SELECT 1 FROM authorized) AS lease_valid,
                 (SELECT count(*)::int FROM deleted) AS deleted_count`, params,
      );
      const row = result.rows[0];
      if (result.rows.length !== 1 || !row || typeof row.lease_valid !== "boolean") throw new SessionCleanupError();
      if (!row.lease_valid) throw new LostJobLeaseError(lease.id);
      if (!Number.isInteger(row.deleted_count) || row.deleted_count < 0 || row.deleted_count > SESSION_CLEANUP_BATCH_SIZE) throw new SessionCleanupError();
      if (destroy) throw new SessionCleanupError();
      await client.query("COMMIT");
      if (destroy) throw new SessionCleanupError();
      return { deletedCount: row.deleted_count };
    } catch (error) {
      if (!destroy) { try { await client.query("ROLLBACK"); } catch { destroy = true; } }
      throw error instanceof LostJobLeaseError ? error : new SessionCleanupError();
    } finally {
      client.removeListener("error", onError); client.release(destroy);
    }
  }
}
