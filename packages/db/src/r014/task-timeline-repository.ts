import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, accountScopeClause, accountScopeParams, approveAuth, requireTimestamp,
} from "./workspace-authority.js";

/**
 * v1.5 `GET /tasks/:id/timeline`（八页签之一）。倒序，游标翻页。
 *
 * 契约点名五源：changesets / assessment_price_history / dispatches / work_items /
 * audit_log(action='external_change')。实际能出的只有三源半：
 * - `dispatches` **表还没建**（Codex 的 migration 014）→ 整类缺，调用方要能看到「缺了这一类」
 *   而不是以为「这个任务没有派发」；
 * - `audit_log(action='external_change')` **没有任何写入方**（全仓无人写这个 action），
 *   照字面实现会永远空、看起来像「没有带外变更」。所以外部变更取 `external_changes`
 *   ——那里有真数据。已回抛 arch。
 *
 * 账户维度的源（changesets / external_changes）一律过授权谓词：任务本身过闸不等于
 * 任务下每个账户他都看得见。
 */
export interface TaskTimelineItem {
  at: string;
  kind: "changeset" | "assessment_price" | "work_item" | "external_change";
  actor: { userId: string; name: string | null } | "system" | "external";
  summary: string;
  ref: { type: string; id: string };
}

export interface TaskTimelinePage {
  items: TaskTimelineItem[];
  nextCursor: string | null;
  /** 整类取不到的源，如实报，不静默少一类。 */
  unavailableKinds: string[];
}

const PAGE_MAX = 100;

/** 游标 = `<毫秒>:<ref id>`，两段都要——同一毫秒可能有多条，只按时间翻会漏行也会重复。 */
function encodeCursor(item: TaskTimelineItem): string {
  return `${Date.parse(item.at)}:${item.ref.id}`;
}

function decodeCursor(cursor: string): { at: Date; id: string } {
  const at = cursor.slice(0, cursor.indexOf(":"));
  const id = cursor.slice(cursor.indexOf(":") + 1);
  if (!/^\d{1,15}$/.test(at) || id.length === 0 || id.length > 128) {
    throw new R014RepositoryError("INVALID_INPUT");
  }
  return { at: new Date(Number(at)), id };
}

export class TaskTimelineRepository {
  constructor(private readonly pool: Pool) {}

  async page(
    auth: ApprovedWorkspaceAuthContext,
    taskId: string,
    options: { limit?: number; cursor?: string; kinds?: readonly string[] } = {},
  ): Promise<TaskTimelinePage> {
    const approved = approveAuth(auth);
    if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) throw new R014RepositoryError("INVALID_INPUT");
    const cursor = options.cursor === undefined ? null : decodeCursor(options.cursor);
    const scope = accountScopeParams(approved);
    // 谓词 helper 收的是列表达式，各源直接把自己的列名传进去。
    const allowedChangeset = accountScopeClause("$4", "$5", "change.media", "change.account_id");
    const allowedExternal = accountScopeClause("$4", "$5", "outside.media", "outside.account_id");

    // 四段 UNION 成同一形状；`dispatches` 表不在，整类进 unavailableKinds。
    const rows = (await this.pool.query(
      `WITH timeline AS (
         SELECT change.executed_at AS at, 'changeset' AS kind,
                change.initiator AS actor_user_id, 'user' AS actor_kind,
                COALESCE(change.title, '变更集') AS summary,
                'changeset' AS ref_type, change.id::text AS ref_id
         FROM changesets AS change
         JOIN task_accounts AS link ON link.workspace_id=change.workspace_id
           AND link.media=change.media AND link.account_id=change.account_id AND link.task_id=$2
         WHERE change.workspace_id=$1 AND change.executed_at IS NOT NULL
           AND change.status IN ('success','partial','failed') AND ${allowedChangeset}

         UNION ALL
         SELECT history.created_at AS at, 'assessment_price' AS kind,
                history.changed_by AS actor_user_id, 'user' AS actor_kind,
                '考核价调整为 ' || history.price::text AS summary,
                'assessment_price' AS ref_type, history.id::text AS ref_id
         FROM assessment_price_history AS history
         WHERE history.workspace_id=$1 AND history.task_id=$2

         UNION ALL
         SELECT COALESCE(item.resolved_at, item.created_at) AS at, 'work_item' AS kind,
                item.assignee AS actor_user_id,
                CASE WHEN item.assignee IS NULL THEN 'system' ELSE 'user' END AS actor_kind,
                COALESCE(item.title, '工作项')
                  || CASE WHEN item.resolved_at IS NULL THEN '（新建）' ELSE '（处理完）' END AS summary,
                'work_item' AS ref_type, item.id::text AS ref_id
         FROM work_items AS item
         WHERE item.workspace_id=$1 AND item.task_id=$2

         UNION ALL
         SELECT outside.detected_at AS at, 'external_change' AS kind,
                NULL::uuid AS actor_user_id, 'external' AS actor_kind,
                outside.target_type || ' ' || outside.field || ' 被外部改动' AS summary,
                'external_change' AS ref_type, outside.id::text AS ref_id
         FROM external_changes AS outside
         JOIN task_accounts AS link ON link.workspace_id=outside.workspace_id
           AND link.media=outside.media AND link.account_id=outside.account_id AND link.task_id=$2
         WHERE outside.workspace_id=$1 AND ${allowedExternal}
       )
       SELECT timeline.*, actor.name AS actor_name
       FROM timeline
       LEFT JOIN users AS actor ON actor.workspace_id=$1 AND actor.id=timeline.actor_user_id
       WHERE timeline.at IS NOT NULL
         AND ($6::timestamptz IS NULL
              OR timeline.at < $6
              OR (timeline.at = $6 AND timeline.ref_id < $7))
         AND ($8::text[] IS NULL OR timeline.kind = ANY($8))
       ORDER BY timeline.at DESC, timeline.ref_id DESC
       LIMIT $3`,
      [approved.workspaceId, taskId, limit + 1, scope.kind, scope.allowed,
        cursor?.at ?? null, cursor?.id ?? null,
        options.kinds === undefined || options.kinds.length === 0 ? null : [...options.kinds]],
    )).rows as Record<string, unknown>[];

    const items = rows.slice(0, limit).map((row): TaskTimelineItem => ({
      at: requireTimestamp(row.at).toISOString(),
      kind: String(row.kind) as TaskTimelineItem["kind"],
      actor: row.actor_kind === "external"
        ? "external"
        : row.actor_user_id === null
          ? "system"
          : { userId: String(row.actor_user_id), name: (row.actor_name as string | null) ?? null },
      summary: String(row.summary),
      ref: { type: String(row.ref_type), id: String(row.ref_id) },
    }));

    return {
      items,
      nextCursor: rows.length > limit && items.length > 0 ? encodeCursor(items[items.length - 1]!) : null,
      // 表不在 = 这一类整体取不到。空数组会被当成「查过了，没有派发」，那是两回事。
      unavailableKinds: await this.tableExists("dispatches") ? [] : ["dispatch"],
    };
  }

  private async tableExists(name: string): Promise<boolean> {
    return (await this.pool.query("SELECT to_regclass($1) AS name", [`public.${name}`]))
      .rows[0]?.name !== null;
  }
}
