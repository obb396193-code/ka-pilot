import {
  ACTIVE_WORK_ITEM_STATUSES, countUnread, notificationReadStateSchema,
  type ApprovedWorkspaceAuthContext, type MeCountsParts, type NotificationCandidate, type NotificationReadState,
} from "@ka/domain";
import type { Pool, PoolClient } from "pg";

import { R014RepositoryError, approveAuth } from "./workspace-authority.js";

/**
 * v1.7.1 me/counts + v1.7.4 G9 me/workload + v1.7.8 G10 通知投影的读侧。
 *
 * 这三个端点要读的表分属好几个批次：`approvals`/`dispatches`（migration 014，Codex R-012）、
 * 值班表（未定义）现在都不存在。**缺源一律回 null，绝不回 0**——
 * 侧栏显示「0 待办」会让人不去处理，是最坏的一种假数据。
 */
export interface MeWorkloadParts {
  tasks: { owned: number; participating: number };
  accounts: { owned: number; watching: number };
  pending: {
    workItems: number;
    approvals: number | null;
    dispatches: number | null;
    runsWaitingConfirmation: number;
  };
  oncall: { today: boolean; next: { at: string; role: string } | null } | null;
}

export interface NotificationSources {
  candidates: NotificationCandidate[];
  /** 还拿不到的投影源；调用方据此判断 unread 是否可信。 */
  unavailable: string[];
}

async function tableExists(client: Pool | PoolClient, name: string): Promise<boolean> {
  const result = await client.query("SELECT to_regclass($1) AS name", [`public.${name}`]);
  return result.rows[0]?.name !== null;
}

function count(result: { rows: { n?: unknown }[] }): number {
  const n = result.rows[0]?.n;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) throw new R014RepositoryError("INVALID_RESULT");
  return n;
}

export class MeWorkspaceRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * 计数按**空间**而不是按 assignee：未指派的工作项恰恰是最需要有人看的，
   * 按 assignee 过滤会把它们从侧栏藏起来。
   */
  async countsParts(auth: ApprovedWorkspaceAuthContext, readState: NotificationReadState): Promise<MeCountsParts> {
    const approved = approveAuth(auth);
    const workItems = await this.workItemCounts(approved);
    const runsWaitingConfirmation = count(await this.pool.query(
      "SELECT count(*)::int AS n FROM workflow_runs WHERE workspace_id=$1 AND status='waiting_confirmation'",
      [approved.workspaceId],
    ));
    const changesetsDraft = count(await this.pool.query(
      "SELECT count(*)::int AS n FROM changesets WHERE workspace_id=$1 AND status='draft'",
      [approved.workspaceId],
    ));
    const approvalsToApprove = await this.optionalCount(
      "approvals",
      "SELECT count(*)::int AS n FROM approvals WHERE workspace_id=$1 AND status='pending'",
      [approved.workspaceId],
    );
    const dispatchesReceived = await this.optionalCount(
      "dispatches",
      "SELECT count(*)::int AS n FROM dispatches WHERE workspace_id=$1 AND receiver=$2 AND status='open'",
      [approved.workspaceId, approved.userId],
    );
    const sources = await this.notificationSources(approved);
    return {
      workItems,
      approvalsToApprove,
      dispatchesReceived,
      runsWaitingConfirmation,
      // 投影源不齐时未读数是残缺的，宁可回 null 让上层报「暂不可用」，也不给一个偏小的数字。
      notificationsUnread: sources.unavailable.length > 0 ? null : countUnread(sources.candidates, readState),
      changesetsDraft,
    };
  }

  async workloadParts(auth: ApprovedWorkspaceAuthContext): Promise<MeWorkloadParts> {
    const approved = approveAuth(auth);
    const owned = count(await this.pool.query(
      "SELECT count(*)::int AS n FROM tasks WHERE workspace_id=$1 AND owner_user_id=$2",
      [approved.workspaceId, approved.userId],
    ));
    const participating = count(await this.pool.query(
      `SELECT count(DISTINCT task_link.task_id)::int AS n FROM task_accounts AS task_link
       JOIN account_access_grants AS grant_row ON grant_row.workspace_id=task_link.workspace_id
         AND grant_row.media=task_link.media AND grant_row.account_id=task_link.account_id
         AND grant_row.revoked_at IS NULL
       JOIN workspace_memberships AS member ON member.workspace_id=grant_row.workspace_id
         AND member.identity_id=grant_row.identity_id AND member.is_active=true AND member.user_id=$2
       LEFT JOIN tasks AS task ON task.workspace_id=task_link.workspace_id AND task.task_id=task_link.task_id
       WHERE task_link.workspace_id=$1 AND (task.owner_user_id IS NULL OR task.owner_user_id <> $2)`,
      [approved.workspaceId, approved.userId],
    ));
    const accountsOwned = count(await this.pool.query(
      `SELECT count(DISTINCT (grant_row.media, grant_row.account_id))::int AS n
       FROM account_access_grants AS grant_row
       JOIN workspace_memberships AS member ON member.workspace_id=grant_row.workspace_id
         AND member.identity_id=grant_row.identity_id AND member.is_active=true AND member.user_id=$2
       WHERE grant_row.workspace_id=$1 AND grant_row.revoked_at IS NULL`,
      [approved.workspaceId, approved.userId],
    ));
    const watching = count(await this.pool.query(
      `SELECT coalesce((
         SELECT count(*) FROM user_watchlists AS watchlist, jsonb_array_elements(watchlist.items) AS item
         WHERE watchlist.workspace_id=$1 AND watchlist.user_id=$2
           AND coalesce(item->>'type','account')='account'
       ),0)::int AS n`,
      [approved.workspaceId, approved.userId],
    ));
    const workItems = (await this.workItemCounts(approved)).open;
    const runsWaitingConfirmation = count(await this.pool.query(
      "SELECT count(*)::int AS n FROM workflow_runs WHERE workspace_id=$1 AND status='waiting_confirmation'",
      [approved.workspaceId],
    ));
    return {
      tasks: { owned, participating },
      accounts: { owned: accountsOwned, watching },
      pending: {
        workItems,
        approvals: await this.optionalCount(
          "approvals", "SELECT count(*)::int AS n FROM approvals WHERE workspace_id=$1 AND status='pending'",
          [approved.workspaceId],
        ),
        dispatches: await this.optionalCount(
          "dispatches", "SELECT count(*)::int AS n FROM dispatches WHERE workspace_id=$1 AND receiver=$2 AND status='open'",
          [approved.workspaceId, approved.userId],
        ),
        runsWaitingConfirmation,
      },
      // 值班表还没有任何契约定义的落点 → null，不编一个「今天不值班」出来。
      oncall: null,
    };
  }

  /** G10：读时投影，不建表。approvals/dispatches 未落地前如实报告缺源。 */
  async notificationSources(auth: ApprovedWorkspaceAuthContext): Promise<NotificationSources> {
    const approved = approveAuth(auth);
    const candidates: NotificationCandidate[] = [];
    const unavailable: string[] = [];

    const workItems = await this.pool.query(
      `SELECT id, severity, title, coalesce(last_triggered_at, created_at) AS at
       FROM work_items WHERE workspace_id=$1 AND status = ANY($2::text[])
       ORDER BY coalesce(last_triggered_at, created_at) DESC LIMIT 200`,
      [approved.workspaceId, [...ACTIVE_WORK_ITEM_STATUSES]],
    );
    for (const row of workItems.rows as Record<string, unknown>[]) {
      candidates.push({
        id: String(row.id),
        kind: "alert",
        severity: row.severity === "P0" ? "p0" : row.severity === "P1" ? "p1" : row.severity === "P2" ? "p2" : "info",
        title: typeof row.title === "string" && row.title.length > 0 ? row.title : "工作项",
        body: "",
        at: (row.at as Date).toISOString(),
        ref: { type: "work_item", id: String(row.id) },
        href: `/work-items/${String(row.id)}`,
      });
    }

    const runs = await this.pool.query(
      `SELECT id, started_at FROM workflow_runs
       WHERE workspace_id=$1 AND status='waiting_confirmation' ORDER BY started_at DESC LIMIT 200`,
      [approved.workspaceId],
    );
    for (const row of runs.rows as Record<string, unknown>[]) {
      candidates.push({
        id: String(row.id),
        kind: "run",
        severity: "warning",
        title: "工作流运行等待确认",
        body: "",
        at: (row.started_at as Date).toISOString(),
        ref: { type: "workflow_run", id: String(row.id) },
        href: `/workflows/runs/${String(row.id)}`,
      });
    }

    for (const table of ["approvals", "dispatches"]) {
      if (!await tableExists(this.pool, table)) unavailable.push(table);
    }
    return { candidates, unavailable };
  }

  /** 已读态存在 identity_preferences.preferences 里（G10 指定），坏值退回「什么都没读过」。 */
  async readState(identityId: string): Promise<NotificationReadState> {
    const result = await this.pool.query(
      "SELECT preferences FROM identity_preferences WHERE identity_id=$1", [identityId],
    );
    const stored = result.rows[0]?.preferences as Record<string, unknown> | undefined;
    const parsed = notificationReadStateSchema.safeParse({
      notificationsReadAt: stored?.notificationsReadAt ?? null,
      notificationsReadIds: stored?.notificationsReadIds ?? [],
    });
    return parsed.success ? parsed.data : { notificationsReadAt: null, notificationsReadIds: [] };
  }

  /**
   * 已读态与主题偏好共用 identity_preferences.preferences 这一份 JSONB（G10 指定），
   * 所以只能 **合并** 写两个已读键，不能整块替换——替换会把用户的主题设置抹掉。
   */
  async writeReadState(identityId: string, state: NotificationReadState): Promise<void> {
    const parsed = notificationReadStateSchema.parse(state);
    await this.pool.query(
      `INSERT INTO identity_preferences (identity_id, preferences, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (identity_id) DO UPDATE
         SET preferences = identity_preferences.preferences || EXCLUDED.preferences, updated_at = now()`,
      [identityId, JSON.stringify(parsed)],
    );
  }

  private async workItemCounts(auth: ApprovedWorkspaceAuthContext): Promise<NonNullable<MeCountsParts["workItems"]>> {
    const result = await this.pool.query(
      `SELECT count(*)::int AS open,
              count(*) FILTER (WHERE severity='P0')::int AS p0,
              count(*) FILTER (WHERE severity='P1')::int AS p1,
              count(*) FILTER (WHERE severity='opportunity')::int AS opportunity
       FROM work_items WHERE workspace_id=$1 AND status = ANY($2::text[])`,
      [auth.workspaceId, [...ACTIVE_WORK_ITEM_STATUSES]],
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (row === undefined) throw new R014RepositoryError("INVALID_RESULT");
    for (const key of ["open", "p0", "p1", "opportunity"]) {
      if (typeof row[key] !== "number") throw new R014RepositoryError("INVALID_RESULT");
    }
    return { open: row.open as number, p0: row.p0 as number, p1: row.p1 as number, opportunity: row.opportunity as number };
  }

  private async optionalCount(table: string, sql: string, params: unknown[]): Promise<number | null> {
    if (!await tableExists(this.pool, table)) return null;
    return count(await this.pool.query(sql, params));
  }
}
