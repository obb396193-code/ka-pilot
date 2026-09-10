import {
  approvedAccountAccessSchema, approvedWorkspaceAuthContextSchema,
  assertWorkItemTransition, workItemCommandSchema, WORK_ITEM_STATUSES, type WorkItemStatus,
} from "@ka/domain";
import type { Pool } from "pg";
import { accountScopeClause, accountScopeParams } from "./r014/workspace-authority.js";

export class WorkItemCommandError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATE" |
    "INVALID_RESULT" | "SOURCE_UNAVAILABLE") {
    super(`Work item command ${code.toLowerCase()}`);
    this.name = "WorkItemCommandError";
  }
}

/** Local workflow mutation only. No public DTO, media client, queue or auto-execution. */
export class WorkItemCommandRepository {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async apply(rawAuth: unknown, rawCommand: unknown) {
    const authorization = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!authorization.success || authorization.data.workspaceKind !== "personal" || authorization.data.scope.accounts.length === 0)
      throw new WorkItemCommandError("FORBIDDEN");
    const parsed = workItemCommandSchema.safeParse(rawCommand);
    if (!parsed.success) throw new WorkItemCommandError("INVALID_INPUT");
    // Both parse calls produce private copies before any await.
    const auth = authorization.data, command = parsed.data;
    const scope = accountScopeParams(auth);
    const client = await this.pool.connect().catch(() => { throw new WorkItemCommandError("SOURCE_UNAVAILABLE"); });
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '10s'");
      await client.query("SET LOCAL lock_timeout = '3s'");
      const selected = await client.query(`/* authorized-work-item-lock */
        SELECT id, workspace_id, media, account_id, status FROM work_items
        WHERE workspace_id=$1::uuid AND id=$2::uuid
          AND ${accountScopeClause("$3", "$4", "work_items.media", "work_items.account_id")} FOR UPDATE`,
      [auth.workspaceId, command.workItemId, scope.kind, scope.allowed]);
      if (selected.rows.length === 0) {
        const exists = await client.query("SELECT id FROM work_items WHERE workspace_id=$1 AND id=$2", [auth.workspaceId, command.workItemId]);
        throw new WorkItemCommandError(exists.rows.length === 0 ? "NOT_FOUND" : "FORBIDDEN");
      }
      if (selected.rows.length !== 1) throw new WorkItemCommandError("INVALID_RESULT");
      const item = selected.rows[0]!;
      if (item.id !== command.workItemId || item.workspace_id !== auth.workspaceId || !WORK_ITEM_STATUSES.includes(item.status))
        throw new WorkItemCommandError("INVALID_RESULT");
      const target = approvedAccountAccessSchema.safeParse({ media: item.media, accountId: item.account_id, accessLevel: "read" });
      if (!target.success || !auth.scope.accounts.some(a => a.media === target.data.media && a.accountId === target.data.accountId))
        throw new WorkItemCommandError("FORBIDDEN");
      const authority = await client.query(`/* authorized-work-item-authority */
        SELECT true AS allowed FROM workspaces w
        JOIN users u ON u.workspace_id=w.id AND u.id=$2 AND u.is_active=true
        JOIN workspace_memberships m ON m.workspace_id=w.id AND m.user_id=u.id AND m.is_active=true AND m.role=$5
        JOIN auth_identities i ON i.id=m.identity_id AND i.is_active=true
        JOIN account_access_grants g ON g.workspace_id=w.id AND g.identity_id=i.id
          AND g.media=$3 AND g.account_id=$4 AND g.access_level IN ('read','preview','execute')
        JOIN accounts a ON a.workspace_id=w.id AND a.media=g.media AND a.account_id=g.account_id
        WHERE w.id=$1 AND w.kind='personal' AND w.is_active=true
          AND (to_jsonb(g)->>'revoked_at') IS NULL
        LIMIT 2 FOR SHARE OF w,u,m,i,g,a`, [auth.workspaceId, auth.userId, target.data.media, target.data.accountId, auth.role]);
      // Before migration018, revocation deletes grants; after018 the same check
      // also honors soft revocation, without assuming that column already exists.
      if (authority.rows.length !== 1 || authority.rows[0]?.allowed !== true) throw new WorkItemCommandError("FORBIDDEN");
      let next: WorkItemStatus;
      try { next = assertWorkItemTransition(item.status, command.action); }
      catch { throw new WorkItemCommandError("INVALID_STATE"); }
      const terminal = next === "ignored" || next === "rejected";
      const updated = await client.query(`/* authorized-work-item-update */
        UPDATE work_items SET status=$3,
          ignore_reason=CASE WHEN $3='ignored' THEN $4 ELSE ignore_reason END,
          reject_reason=CASE WHEN $3='rejected' THEN $4 ELSE reject_reason END,
          resolved_at=CASE WHEN $5::boolean THEN now() ELSE NULL END
        WHERE workspace_id=$1 AND id=$2 AND status=$6 AND media=$7 AND account_id=$8
        RETURNING id,status,resolved_at`, [auth.workspaceId, command.workItemId, next,
          "reason" in command ? command.reason ?? null : null, terminal, item.status, target.data.media, target.data.accountId]);
      const result = updated.rows[0];
      if (updated.rows.length !== 1 || result?.id !== command.workItemId || result.status !== next ||
        (terminal ? !(result.resolved_at instanceof Date && Number.isFinite(result.resolved_at.valueOf())) : result.resolved_at !== null))
        throw new WorkItemCommandError("INVALID_RESULT");
      await client.query(`/* authorized-work-item-audit */
        INSERT INTO audit_log(workspace_id,user_id,action,object_type,object_id,detail)
        VALUES($1,$2,$3,'work_item',$4,$5::jsonb)`, [auth.workspaceId, auth.userId,
          `work_item.${command.action}`, command.workItemId, JSON.stringify({from:item.status,to:next})]);
      await client.query("COMMIT");
      return { workspaceId: auth.workspaceId, workItemId: command.workItemId,
        media: target.data.media, accountId: target.data.accountId, status: next, resolvedAt: result.resolved_at as Date | null };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve only the safe primary error. */ }
      if (error instanceof WorkItemCommandError) throw error;
      throw new WorkItemCommandError("SOURCE_UNAVAILABLE");
    } finally { client.release(); }
  }
}
