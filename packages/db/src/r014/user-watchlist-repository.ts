import {
  dedupeWatchlistItems, normalizeWatchlistItems, watchlistItemSchema,
  type ApprovedWorkspaceAuthContext, type WatchlistItem,
} from "@ka/domain";
import type { Pool, PoolClient } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, lockWorkspaceMembership,
  requireOwnWorkspace, requireTimestamp,
} from "./workspace-authority.js";

// v1.5 3.5 盯盘名单 + v1.7.4 G2（items 升 account|task 两型）。items 是 JSONB，表结构不动。
export interface WatchlistRecord { items: WatchlistItem[]; updatedAt: string | null }

const EMPTY: WatchlistRecord = { items: [], updatedAt: null };

function mapRow(row: Record<string, unknown>, workspaceId: string): WatchlistRecord {
  requireOwnWorkspace(row, workspaceId);
  if (!Array.isArray(row.items)) throw new R014RepositoryError("INVALID_RESULT");
  return {
    items: normalizeWatchlistItems(row.items),
    updatedAt: row.updated_at === null ? null : requireTimestamp(row.updated_at).toISOString(),
  };
}

/**
 * 关注的东西必须是这个人现在真能看的东西。个人空间按 live 授权逐户核；
 * 团队空间是只读全量，核账户是否属于本空间即可。核不过就整批拒绝，不静默丢项。
 */
async function assertItemsVisible(
  client: PoolClient,
  auth: ApprovedWorkspaceAuthContext,
  items: readonly WatchlistItem[],
): Promise<void> {
  const accounts = items.filter((item): item is Extract<WatchlistItem, { type: "account" }> => item.type === "account");
  const tasks = items.filter((item): item is Extract<WatchlistItem, { type: "task" }> => item.type === "task");
  if (accounts.length > 0) {
    const media = accounts.map((item) => item.media);
    const ids = accounts.map((item) => item.accountId);
    const visible = auth.workspaceKind === "personal"
      ? await client.query(
        `SELECT count(*)::int AS n FROM (
           SELECT DISTINCT grant_row.media, grant_row.account_id
           FROM account_access_grants AS grant_row
           JOIN workspace_memberships AS member ON member.workspace_id=grant_row.workspace_id
             AND member.identity_id=grant_row.identity_id AND member.is_active=true AND member.user_id=$2
           JOIN accounts AS account ON account.workspace_id=grant_row.workspace_id
             AND account.media=grant_row.media AND account.account_id=grant_row.account_id
           WHERE grant_row.workspace_id=$1 AND grant_row.revoked_at IS NULL
             AND (grant_row.media, grant_row.account_id) IN (
               SELECT * FROM unnest($3::text[], $4::text[]))
         ) AS granted`,
        [auth.workspaceId, auth.userId, media, ids],
      )
      : await client.query(
        `SELECT count(*)::int AS n FROM (
           SELECT DISTINCT media, account_id FROM accounts
           WHERE workspace_id=$1 AND (media, account_id) IN (SELECT * FROM unnest($2::text[], $3::text[]))
         ) AS visible`,
        [auth.workspaceId, media, ids],
      );
    const distinct = new Set(accounts.map((item) => `${item.media}:${item.accountId}`)).size;
    if (visible.rows[0]?.n !== distinct) throw new R014RepositoryError("FORBIDDEN");
  }
  if (tasks.length > 0) {
    const taskIds = tasks.map((item) => item.taskId);
    const found = await client.query(
      "SELECT count(DISTINCT task_id)::int AS n FROM tasks WHERE workspace_id=$1 AND task_id = ANY($2::text[])",
      [auth.workspaceId, taskIds],
    );
    if (found.rows[0]?.n !== new Set(taskIds).size) throw new R014RepositoryError("FORBIDDEN");
  }
}

export class UserWatchlistRepository {
  constructor(private readonly pool: Pool) {}

  async get(auth: ApprovedWorkspaceAuthContext): Promise<WatchlistRecord> {
    const approved = approveAuth(auth);
    const result = await this.pool.query(
      "SELECT workspace_id, items, updated_at FROM user_watchlists WHERE workspace_id=$1 AND user_id=$2",
      [approved.workspaceId, approved.userId],
    );
    if (result.rows.length === 0) return EMPTY;
    if (result.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
    return mapRow(result.rows[0] as Record<string, unknown>, approved.workspaceId);
  }

  /** PUT 语义：整表替换。校验 → 去重 → 落库，顺序保持用户提交的先后。 */
  async put(auth: ApprovedWorkspaceAuthContext, items: readonly unknown[]): Promise<WatchlistRecord> {
    const approved = approveAuth(auth);
    if (!Array.isArray(items) || items.length > 500) throw new R014RepositoryError("INVALID_INPUT");
    let parsed: WatchlistItem[];
    try {
      parsed = dedupeWatchlistItems(items.map((item) => watchlistItemSchema.parse(
        item !== null && typeof item === "object" && !Array.isArray(item)
          && (item as Record<string, unknown>).type === undefined
          ? { type: "account", ...(item as Record<string, unknown>) }
          : item,
      )));
    } catch {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const fixed = [...parsed]; // Freeze caller input before the first await.
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      await assertItemsVisible(client, approved, fixed);
      const result = await client.query(
        `INSERT INTO user_watchlists (workspace_id, user_id, items, updated_at)
         VALUES ($1,$2,$3::jsonb,now())
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET items=EXCLUDED.items, updated_at=now()
         RETURNING workspace_id, items, updated_at`,
        [approved.workspaceId, approved.userId, JSON.stringify(fixed)],
      );
      if (result.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
      const saved = mapRow(result.rows[0] as Record<string, unknown>, approved.workspaceId);
      if (saved.items.length !== fixed.length) throw new R014RepositoryError("INVALID_RESULT");
      return saved;
    });
  }
}
