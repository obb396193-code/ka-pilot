import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { JobRepository } from "./job-repository.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validUuid(value: unknown): value is string { return typeof value === "string" && uuid.test(value); }
function fail(): never { throw new Error("T1 source or scope is not valid"); }
function jobId(workspaceId: string, changeSetId: string, itemId: number): string {
  const h = createHash("sha256").update(JSON.stringify(["ka/t1-recycle/v1", workspaceId, changeSetId, itemId])).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Durable enqueue only. A consumer must recheck credentials and settlement maturity. */
export class PersistentChangeSetFollowUps {
  private readonly delayMs: number;
  private readonly jobs: JobRepository;
  constructor(private readonly pool: Pool, policy: { firstCheckDelayMs: number }) {
    const delay = policy.firstCheckDelayMs;
    if (!Number.isSafeInteger(delay) || delay <= 0 || delay > 31 * 86_400_000) throw new Error("Invalid T1 first-check delay");
    this.delayMs = delay;
    this.jobs = new JobRepository(pool);
  }

  async scheduleT1(input: { workspaceId: string; changeSetId: string; successfulItemIds: number[] }): Promise<void> {
    if (!validUuid(input.workspaceId) || !validUuid(input.changeSetId) || !Array.isArray(input.successfulItemIds) ||
      input.successfulItemIds.length > 10_000 || Array.from(input.successfulItemIds).some((id) => !Number.isSafeInteger(id) || id <= 0) ||
      new Set(input.successfulItemIds).size !== input.successfulItemIds.length) fail();
    const workspaceId = input.workspaceId.toLowerCase(), changeSetId = input.changeSetId.toLowerCase();
    const ids = [...input.successfulItemIds].sort((a, b) => a - b);
    if (ids.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const rows = await client.query(`SELECT c.id,c.workspace_id,c.media,c.account_id,c.status,c.initiator,c.credential_owner_user_id,c.executed_at,w.kind
        FROM changesets c JOIN workspaces w ON w.id=c.workspace_id WHERE c.workspace_id=$1 AND c.id=$2 FOR UPDATE OF c FOR SHARE OF w`, [workspaceId, changeSetId]);
      const c = rows.rows[0];
      if (rows.rows.length !== 1 || c.id !== changeSetId || c.workspace_id !== workspaceId || c.kind !== "personal" ||
        !["success", "partial", "rolled_back"].includes(c.status) || typeof c.media !== "string" || !c.media ||
        typeof c.account_id !== "string" || !c.account_id || !validUuid(c.initiator) || !validUuid(c.credential_owner_user_id) ||
        !(c.executed_at instanceof Date) || !Number.isFinite(c.executed_at.getTime())) fail();
      const actors = [...new Set([c.initiator, c.credential_owner_user_id])].sort();
      const users = await client.query("SELECT id FROM users WHERE workspace_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE", [workspaceId, actors]);
      if (users.rowCount !== actors.length) fail();
      // Queue the original credential owner even if later revoked; never substitute another identity.
      const found = await client.query("SELECT id,workspace_id,media,account_id,item_status FROM changeset_items WHERE changeset_id=$1 AND id=ANY($2::bigint[]) ORDER BY id FOR SHARE", [changeSetId, ids]);
      if (found.rows.length !== ids.length || found.rows.some((row, index) => Number(row.id) !== ids[index] ||
        row.workspace_id !== workspaceId || row.media !== c.media || row.account_id !== c.account_id || row.item_status !== "success")) fail();
      const runAfter = new Date(c.executed_at.getTime() + this.delayMs);
      if (!Number.isFinite(runAfter.getTime())) fail();
      for (const itemId of ids) {
        await this.jobs.enqueue({ id: jobId(workspaceId, changeSetId, itemId), workspaceId, jobType: "t1_recycle",
          credentialOwnerUserId: c.credential_owner_user_id, runAfter,
          payload: { workspaceId, changeSetId, itemId, initiatorUserId: c.initiator, credentialOwnerUserId: c.credential_owner_user_id,
            media: c.media, accountId: c.account_id, executedAt: c.executed_at.toISOString() },
        }, client);
      }
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* preserve the original failure */ }
      throw error;
    } finally { client.release(); }
  }
}
