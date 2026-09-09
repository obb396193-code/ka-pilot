import type { Pool, PoolClient } from "pg";

export interface WorkerOnceDiagnosticSnapshot {
  workspace: { exists: boolean; active: boolean; kind: "personal" | "team" | null };
  actors: { activeLinked: number; missingQihangIdentity: number; missingGrants: number };
  queue: { total: number; queuedDue: number; queuedWaiting: number; blockedIdentity: number; blockedOther: number; exhausted: number; leasedActive: number; leaseExpired: number; done: number; failed: number; unclassified: number };
}
function count(value: unknown): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error("Invalid diagnostic count");
  const n = Number(value); if (!Number.isSafeInteger(n)) throw new Error("Invalid diagnostic count"); return n;
}
/** Deployment-only aggregate diagnostics. Never reads credential values or mutates queue state. */
export class WorkerOnceDiagnosticsRepository {
  constructor(private readonly pool: Pool) {}
  async read(workspaceId: string, media: string): Promise<WorkerOnceDiagnosticSnapshot> {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(workspaceId) || !/^[A-Z0-9_]{1,32}$/.test(media)) throw new Error("Invalid diagnostic scope");
    let client: PoolClient | undefined, destroy = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='5s'");
      const ws = (await client.query("SELECT kind,is_active FROM workspaces WHERE id=$1", [workspaceId])).rows[0];
      if (ws && ((ws.kind !== "personal" && ws.kind !== "team") || typeof ws.is_active !== "boolean")) throw new Error("Invalid diagnostic workspace");
      const actors = (await client.query(`SELECT count(*)::text AS active,
        count(*) FILTER(WHERE actor.qihang_user_id IS NULL OR btrim(actor.qihang_user_id)='')::text AS missing_identity,
        count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM account_access_grants g
          JOIN accounts a ON a.workspace_id=g.workspace_id AND a.media=g.media AND a.account_id=g.account_id
          WHERE g.workspace_id=actor.workspace_id AND g.identity_id=m.identity_id AND g.media=$2
            AND (to_jsonb(g)->>'revoked_at') IS NULL))::text AS missing_grants
        FROM users actor JOIN workspaces w ON w.id=actor.workspace_id AND w.kind='personal' AND w.is_active
        JOIN workspace_memberships m ON m.workspace_id=actor.workspace_id AND m.user_id=actor.id AND m.is_active
        JOIN auth_identities i ON i.id=m.identity_id AND i.is_active
        WHERE actor.workspace_id=$1 AND actor.is_active`, [workspaceId, media])).rows[0];
      const q = (await client.query(`SELECT count(*)::text AS total,
        count(*) FILTER(WHERE status='queued' AND attempts<max_attempts AND run_after<=now())::text AS due,
        count(*) FILTER(WHERE status='queued' AND attempts<max_attempts AND run_after>now())::text AS waiting,
        count(*) FILTER(WHERE status='blocked_auth' AND attempts<max_attempts AND last_error IN ('QIHANG_IDENTITY_MISSING','Credential owner has no usable Qihang identity'))::text AS blocked_identity,
        count(*) FILTER(WHERE status='blocked_auth' AND attempts<max_attempts AND COALESCE(last_error,'') NOT IN ('QIHANG_IDENTITY_MISSING','Credential owner has no usable Qihang identity'))::text AS blocked_other,
        count(*) FILTER(WHERE status IN ('queued','blocked_auth') AND attempts>=max_attempts)::text AS exhausted,
        count(*) FILTER(WHERE status IN ('leased','running') AND lease_until>=now())::text AS leased,
        count(*) FILTER(WHERE status IN ('leased','running') AND lease_until<now())::text AS expired,
        count(*) FILTER(WHERE status='done')::text AS done, count(*) FILTER(WHERE status='failed')::text AS failed
        FROM jobs WHERE workspace_id=$1 AND payload->>'media'=$2 AND job_type IN ('etl_full','etl_incr')`, [workspaceId, media])).rows[0];
      const queue = { total: count(q?.total), queuedDue: count(q?.due), queuedWaiting: count(q?.waiting), blockedIdentity: count(q?.blocked_identity), blockedOther: count(q?.blocked_other),
        exhausted: count(q?.exhausted), leasedActive: count(q?.leased), leaseExpired: count(q?.expired), done: count(q?.done), failed: count(q?.failed), unclassified: 0 };
      queue.unclassified = queue.total - Object.entries(queue).filter(([key]) => key !== "total").reduce((sum, [, n]) => sum + n, 0);
      if (queue.unclassified < 0) throw new Error("Invalid diagnostic queue");
      const result = { workspace: { exists: !!ws, active: ws?.is_active ?? false, kind: ws?.kind ?? null },
        actors: { activeLinked: count(actors?.active), missingQihangIdentity: count(actors?.missing_identity), missingGrants: count(actors?.missing_grants) }, queue };
      await client.query("COMMIT"); return result;
    } catch {
      if (client) try { await client.query("ROLLBACK"); } catch { destroy = true; }
      throw new Error("Worker diagnostics database read failed");
    } finally { client?.release(destroy); }
  }
}
