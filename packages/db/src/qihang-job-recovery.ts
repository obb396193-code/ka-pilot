import { isDeepStrictEqual } from "node:util";
import { approvedScheduledSyncPayload, scheduledSyncAuthorizationSnapshotSchema,
  scheduledQihangRecoveryRequestSchema, type ScheduledSyncAuthorizationSnapshot, type WorkspaceSyncJobType } from "@ka/domain";
import type { Pool, PoolClient } from "pg";
import { loadWorkspaceSyncReadinessBatch } from "./workspace-sync-readiness.js";

const initialReason = "QIHANG_IDENTITY_MISSING";
const executionReason = "Credential owner has no usable Qihang identity";
interface BlockedRow { id: string; job_type: WorkspaceSyncJobType; payload: Record<string, unknown>; attempts: number; last_error: string }

function replacementPayload(row: BlockedRow, current: ScheduledSyncAuthorizationSnapshot, media: string): Record<string, unknown> | null {
  const p = row.payload;
  if (!p || typeof p.businessDate !== "string") return null;
  const initial = { workspaceId: current.workspaceId, media, businessDate: p.businessDate, initiatorUserId: current.userId,
    authorizationSnapshot: { workspaceId: current.workspaceId, userId: current.userId, status: "blocked_auth", reason: initialReason } };
  let snapshot = current;
  if (row.last_error === initialReason) {
    if (row.attempts !== 0 || !isDeepStrictEqual(p, initial)) return null;
  } else {
    const prior = scheduledSyncAuthorizationSnapshotSchema.safeParse(p.authorizationSnapshot);
    if (!prior.success || prior.data.workspaceId !== current.workspaceId || prior.data.userId !== current.userId ||
      prior.data.identityId !== current.identityId || prior.data.role !== current.role ||
      prior.data.allowedAccounts.some(a => !current.allowedAccounts.some(b => isDeepStrictEqual(a, b)))) return null;
    snapshot = prior.data; // Never widen an already frozen job after new grants appear.
  }
  try {
    const next = approvedScheduledSyncPayload(snapshot, row.job_type, media, p.businessDate);
    return row.last_error === initialReason || isDeepStrictEqual(p, next) ? next : null;
  } catch { return null; }
}

/** Deployment scheduler only. No general retry/unblock API; original owner is immutable. */
export async function recoverQihangIdentityJobs(pool: Pool, value: unknown): Promise<string[]> {
  const parsed = scheduledQihangRecoveryRequestSchema.safeParse(value);
  if (!parsed.success || parsed.data.snapshot.allowedAccounts.length === 0 ||
    parsed.data.snapshot.allowedAccounts.some(a => a.media !== parsed.data.media)) throw new Error("Invalid Qihang recovery scope");
  const { snapshot, media } = parsed.data;
  let client: PoolClient | undefined, destroy = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL lock_timeout='5s'");
    // Lock the same live identity and grants until status+audit commit; no private qid leaves SQL.
    const actor = await client.query(`SELECT actor.id FROM users actor
      JOIN workspaces workspace ON workspace.id=actor.workspace_id AND workspace.kind='personal' AND workspace.is_active
      JOIN workspace_memberships membership ON membership.workspace_id=actor.workspace_id AND membership.user_id=actor.id
        AND membership.identity_id=$3 AND membership.role=$4 AND membership.is_active
      JOIN auth_identities identity ON identity.id=membership.identity_id AND identity.is_active
      WHERE actor.workspace_id=$1 AND actor.id=$2 AND actor.is_active
        AND actor.qihang_user_id IS NOT NULL AND btrim(actor.qihang_user_id)<>''
      LIMIT 2 FOR SHARE OF actor,workspace,membership,identity`, [snapshot.workspaceId, snapshot.userId, snapshot.identityId, snapshot.role]);
    if (actor.rows.length !== 1) { await client.query("COMMIT"); return []; }
    const grants = await client.query<{ media: string; accountId: string; accessLevel: string }>(`
      SELECT grant_row.media,grant_row.account_id AS "accountId",grant_row.access_level AS "accessLevel"
      FROM account_access_grants grant_row
      JOIN accounts account ON account.workspace_id=grant_row.workspace_id AND account.media=grant_row.media AND account.account_id=grant_row.account_id
      WHERE grant_row.workspace_id=$1 AND grant_row.identity_id=$2 AND grant_row.media=$3
        AND (to_jsonb(grant_row)->>'revoked_at') IS NULL
      ORDER BY grant_row.account_id COLLATE "C" LIMIT 1001 FOR SHARE OF grant_row,account`, [snapshot.workspaceId, snapshot.identityId, media]);
    if (grants.rows.length > 1000) throw new Error("Recovery scope overflow");
    if (snapshot.allowedAccounts.some(a => !grants.rows.some(b => isDeepStrictEqual(a, b)))) { await client.query("COMMIT"); return []; }
    const jobs = await client.query<BlockedRow>(`SELECT id,job_type,payload,attempts,last_error FROM jobs
      WHERE workspace_id=$1 AND credential_owner_user_id=$2 AND payload->>'media'=$3
        AND job_type IN ('etl_full','etl_incr') AND status='blocked_auth'
        AND last_error IN ($4,$5) AND attempts>=0 AND attempts<max_attempts
        AND lease_token IS NULL AND lease_until IS NULL
      ORDER BY created_at,id LIMIT 1001 FOR UPDATE`, [snapshot.workspaceId, snapshot.userId, media, initialReason, executionReason]);
    if (jobs.rows.length > 1000 || Buffer.byteLength(JSON.stringify(jobs.rows)) >= 16 * 1024 * 1024) throw new Error("Recovery result overflow");
    const replacements = jobs.rows.flatMap(row => {
      const payload = replacementPayload(row, snapshot, media);
      return payload === null ? [] : [{ row, payload }];
    });
    const incremental = replacements.filter(entry => entry.row.job_type === "etl_incr");
    // replacementPayload proved the exact approved scheduled shape (including ds,
    // offlineReconcileDays and prior grant subset). Never use today's wider scope/date.
    const readiness = await loadWorkspaceSyncReadinessBatch(client, incremental.map(({ payload }) => {
      const frozen = scheduledSyncAuthorizationSnapshotSchema.parse(payload.authorizationSnapshot);
      const dateTo = payload.ds as string;
      const dateFrom = new Date(Date.parse(dateTo) - (payload.offlineReconcileDays as number) * 86_400_000).toISOString().slice(0, 10);
      return { workspaceId: frozen.workspaceId, requestingUserId: frozen.userId,
        allowedAccounts: frozen.allowedAccounts, dateFrom, dateTo };
    }));
    const readyIds = new Set(incremental.filter((_, i) => readiness[i]).map(entry => entry.row.id));
    const entries: Array<{ id: string; payload: Record<string, unknown>; detail: Record<string, unknown> }> = [];
    let batchBytes = 2;
    for (const { row, payload } of replacements) {
      if (row.job_type === "etl_incr" && !readyIds.has(row.id)) continue;
      const entry = { id: row.id, payload, detail: {
        previousReason: row.last_error, attempts: row.attempts, businessDate: payload.businessDate,
        media, identityId: snapshot.identityId, previousAuthorizationSnapshot: row.payload.authorizationSnapshot,
      } };
      batchBytes += Buffer.byteLength(JSON.stringify(entry)) + (entries.length ? 1 : 0);
      if (batchBytes >= 16 * 1024 * 1024) throw new Error("Recovery result overflow");
      entries.push(entry);
    }
    if (entries.length) {
      // Two bounded bulk statements, not two round trips for each of 1000 jobs.
      const updated = await client.query(`UPDATE jobs job SET status='queued',payload=entry.payload,run_after=now(),finished_at=NULL
        FROM jsonb_to_recordset($1::jsonb) entry(id uuid,payload jsonb) WHERE job.id=entry.id RETURNING job.id`, [JSON.stringify(entries)]);
      if (updated.rowCount !== entries.length) throw new Error("Recovery update mismatch");
      await client.query(`INSERT INTO audit_log(workspace_id,user_id,action,object_type,object_id,detail)
        SELECT $1,$2,'job.qihang_identity_recovered','job',entry.id,entry.detail
        FROM jsonb_to_recordset($3::jsonb) entry(id text,detail jsonb)`, [snapshot.workspaceId, snapshot.userId, JSON.stringify(entries)]);
    }
    await client.query("COMMIT"); return entries.map(entry => entry.id);
  } catch {
    if (client) try { await client.query("ROLLBACK"); } catch { destroy = true; }
    throw new Error("Qihang identity recovery failed");
  } finally { client?.release(destroy); }
}
