import { qihangIdentitySeedSchema, qihangIdentitySeedResultSchema, type QihangIdentitySeedResult } from "@ka/domain";
import type { Pool, PoolClient } from "pg";

export class QihangIdentitySeedError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "FORBIDDEN" | "REQUIRES_FORCE" | "DATABASE_ERROR") {
    super(`Qihang identity seed failed: ${code}`);
  }
}

/** Explicit deployment operation: binds only an existing personal workspace actor.
 * Does not grant accounts, issue sessions, change roles or enqueue/recover jobs.
 */
export class QihangIdentitySeedRepository {
  constructor(private readonly pool: Pool) {}
  async bind(value: unknown, force = false): Promise<QihangIdentitySeedResult> {
    const parsed = qihangIdentitySeedSchema.safeParse(value);
    if (!parsed.success || typeof force !== "boolean") throw new QihangIdentitySeedError("INVALID_INPUT");
    const input = parsed.data;
    let client: PoolClient | undefined, destroy = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='15s'");
      await client.query("SET LOCAL lock_timeout='5s'");
      const result = await client.query<{ id: string; qihang_user_id: string | null }>(`
        SELECT actor.id,actor.qihang_user_id
        FROM users actor
        JOIN workspaces workspace ON workspace.id=actor.workspace_id AND workspace.kind='personal' AND workspace.is_active=true
        JOIN workspace_memberships membership ON membership.workspace_id=actor.workspace_id AND membership.user_id=actor.id AND membership.is_active=true
        JOIN auth_identities identity ON identity.id=membership.identity_id AND identity.is_active=true
        WHERE actor.workspace_id=$1 AND actor.is_active=true
          AND ($2::uuid IS NULL OR actor.id=$2)
          AND ($3::uuid IS NULL OR identity.id=$3)
        ORDER BY actor.id,membership.identity_id LIMIT 2
        FOR UPDATE OF actor,workspace,membership,identity`,
      [input.workspace_id, "user_id" in input ? input.user_id : null, "identity_id" in input ? input.identity_id : null]);
      if (result.rows.length !== 1) throw new QihangIdentitySeedError("FORBIDDEN");
      const actor = result.rows[0]!;
      const current = actor.qihang_user_id;
      if (current !== null && typeof current !== "string") throw new QihangIdentitySeedError("DATABASE_ERROR");
      const hasValue = current !== null && current.trim() !== "";
      const unchanged = current === input.qihang_user_id;
      if (hasValue && !unchanged && !force) throw new QihangIdentitySeedError("REQUIRES_FORCE");
      if (!unchanged) {
        const updated = await client.query("UPDATE users SET qihang_user_id=$3 WHERE workspace_id=$1 AND id=$2", [input.workspace_id, actor.id, input.qihang_user_id]);
        if (updated.rowCount !== 1) throw new QihangIdentitySeedError("DATABASE_ERROR");
      }
      const output = qihangIdentitySeedResultSchema.parse({ workspaceId: input.workspace_id, userId: actor.id,
        status: unchanged ? "unchanged" : hasValue ? "replaced" : "bound" });
      await client.query("COMMIT");
      return output;
    } catch (error) {
      if (client) try { await client.query("ROLLBACK"); } catch { destroy = true; }
      throw error instanceof QihangIdentitySeedError ? error : new QihangIdentitySeedError("DATABASE_ERROR");
    } finally { client?.release(destroy); }
  }
}
