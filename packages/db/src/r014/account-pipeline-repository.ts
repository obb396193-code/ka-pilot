import {
  buildAccountPipeline, metricValue, poolStatusSchema, poolStatusSourceSchema,
  type AccountPipeline, type ApprovedWorkspaceAuthContext, type PoolStatus,
} from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, lockWorkspaceMembership, requireOwnWorkspace,
} from "./workspace-authority.js";

// v1.5.1 ① 账户池：九态分布 + 人工覆盖（PATCH/DELETE pool-status）。
export interface PoolStatusRecord {
  media: string;
  accountId: string;
  poolStatus: PoolStatus;
  poolStatusSource: "system" | "manual";
  poolStatusChangedAt: string | null;
}

/** 个人空间只统计有 live 授权的户；团队空间只读全量，统计本空间全部户。 */
function visibleAccountsSql(auth: ApprovedWorkspaceAuthContext): { sql: string; params: string[] } {
  return auth.workspaceKind === "personal"
    ? {
      sql: `FROM accounts AS account
            JOIN account_access_grants AS grant_row ON grant_row.workspace_id=account.workspace_id
              AND grant_row.media=account.media AND grant_row.account_id=account.account_id
            JOIN workspace_memberships AS member ON member.workspace_id=grant_row.workspace_id
              AND member.identity_id=grant_row.identity_id AND member.is_active=true AND member.user_id=$2
            WHERE account.workspace_id=$1`,
      params: [auth.workspaceId, auth.userId],
    }
    : {
      sql: "FROM accounts AS account WHERE account.workspace_id=$1",
      params: [auth.workspaceId],
    };
}

export class AccountPipelineRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * `deltaVsYesterday` 一律 missing：库里没有 pool_status 的历史快照，
   * `pool_status_changed_at` 只记最后一次变更，反推不出昨天的分布。
   * 补 0 会让页面显示「昨天到今天没变」——那是编的。已回抛 arch（Q-004）。
   */
  async pipeline(auth: ApprovedWorkspaceAuthContext, media?: string): Promise<AccountPipeline> {
    const approved = approveAuth(auth);
    if (media !== undefined && !/^[A-Z0-9_]{1,32}$/.test(media)) throw new R014RepositoryError("INVALID_INPUT");
    const visible = visibleAccountsSql(approved);
    const mediaIndex = visible.params.length + 1;
    const result = await this.pool.query(
      `SELECT account.pool_status AS pool_status, count(DISTINCT (account.media, account.account_id))::int AS n
       ${visible.sql} AND ($${mediaIndex}::text IS NULL OR account.media=$${mediaIndex})
       GROUP BY account.pool_status`,
      [...visible.params, media ?? null],
    );
    const counts: Partial<Record<PoolStatus, number>> = {};
    for (const row of result.rows as { pool_status: unknown; n: number }[]) {
      const status = poolStatusSchema.safeParse(row.pool_status);
      // 库里出现九态之外的值说明迁移或写入出了问题，宁可报错也不悄悄丢掉一批户。
      if (!status.success) throw new R014RepositoryError("INVALID_RESULT");
      counts[status.data] = row.n;
    }
    return buildAccountPipeline(counts, new Date().toISOString(), () => metricValue(null));
  }

  /** 人工置态：写 pool_status_source='manual'，此后系统推导不再覆盖它。 */
  async overridePoolStatus(
    auth: ApprovedWorkspaceAuthContext,
    media: string,
    accountId: string,
    poolStatus: string,
  ): Promise<PoolStatusRecord> {
    const approved = approveAuth(auth);
    const status = poolStatusSchema.safeParse(poolStatus);
    if (!status.success) throw new R014RepositoryError("INVALID_INPUT");
    return this.write(approved, media, accountId, status.data, "manual");
  }

  /** 清除人工覆盖，交回系统推导；系统推导本身在 ETL 侧，这里只把标记复位。 */
  async clearPoolStatusOverride(
    auth: ApprovedWorkspaceAuthContext,
    media: string,
    accountId: string,
  ): Promise<PoolStatusRecord> {
    const approved = approveAuth(auth);
    return this.write(approved, media, accountId, null, "system");
  }

  private async write(
    auth: ApprovedWorkspaceAuthContext,
    media: string,
    accountId: string,
    poolStatus: PoolStatus | null,
    source: "system" | "manual",
  ): Promise<PoolStatusRecord> {
    if (!/^[A-Z0-9_]{1,32}$/.test(media) || !/^[A-Za-z0-9_-]{1,128}$/.test(accountId)) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const fixed = { media, accountId, poolStatus, source }; // Freeze before the first await.
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, auth);
      if (auth.workspaceKind === "personal") {
        const granted = await client.query(
          `SELECT true AS allowed FROM account_access_grants AS grant_row
           JOIN workspace_memberships AS member ON member.workspace_id=grant_row.workspace_id
             AND member.identity_id=grant_row.identity_id AND member.is_active=true AND member.user_id=$2
           WHERE grant_row.workspace_id=$1 AND grant_row.media=$3 AND grant_row.account_id=$4 LIMIT 1`,
          [auth.workspaceId, auth.userId, fixed.media, fixed.accountId],
        );
        if (granted.rows.length !== 1) throw new R014RepositoryError("FORBIDDEN");
      }
      const result = await client.query(
        `UPDATE accounts SET
           pool_status = COALESCE($4, pool_status),
           pool_status_source = $5,
           pool_status_overridden_by = CASE WHEN $5='manual' THEN $6::uuid ELSE NULL END,
           pool_status_changed_at = now()
         WHERE workspace_id=$1 AND media=$2 AND account_id=$3
         RETURNING workspace_id, media, account_id, pool_status, pool_status_source, pool_status_changed_at`,
        [auth.workspaceId, fixed.media, fixed.accountId, fixed.poolStatus, fixed.source, auth.userId],
      );
      if (result.rows.length !== 1) throw new R014RepositoryError("NOT_FOUND");
      const row = result.rows[0] as Record<string, unknown>;
      requireOwnWorkspace(row, auth.workspaceId);
      const status = poolStatusSchema.safeParse(row.pool_status);
      const rowSource = poolStatusSourceSchema.safeParse(row.pool_status_source);
      if (!status.success || !rowSource.success) throw new R014RepositoryError("INVALID_RESULT");
      return {
        media: fixed.media,
        accountId: fixed.accountId,
        poolStatus: status.data,
        poolStatusSource: rowSource.data,
        poolStatusChangedAt: row.pool_status_changed_at instanceof Date ? row.pool_status_changed_at.toISOString() : null,
      };
    });
  }
}
