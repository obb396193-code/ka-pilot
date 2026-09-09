import {
  externalChangeFieldSchema, externalChangeSchema, externalChangeTargetTypeSchema, toTimelineItem,
  type ApprovedWorkspaceAuthContext, type ExternalChange, type ExternalChangeTimelineItem,
} from "@ka/domain";
import type { Pool, PoolClient } from "pg";

import {
  R014RepositoryError, approveAuth, requireOwnWorkspace, requireTimestamp,
} from "./workspace-authority.js";

// v1.5 4.3 / 11.7 带外变更。写侧由结构同步（Worker）调用；读侧进账户时间线。
export interface RecordExternalChangeInput {
  workspaceId: string;
  media: string;
  accountId: string;
  targetType: ExternalChange["targetType"];
  targetId: string;
  field: ExternalChange["field"];
  fromValue: unknown;
  toValue: unknown;
  syncRunId: string | null;
}

const COLUMNS = `id, workspace_id, media, account_id, target_type, target_id, field,
  from_value, to_value, detected_at, sync_run_id, linked_work_item_id`;

function mapRow(row: Record<string, unknown>, workspaceId: string): ExternalChange {
  requireOwnWorkspace(row, workspaceId);
  const parsed = externalChangeSchema.safeParse({
    id: String(row.id),
    media: row.media,
    accountId: row.account_id,
    targetType: row.target_type,
    targetId: row.target_id,
    field: row.field,
    fromValue: row.from_value ?? null,
    toValue: row.to_value ?? null,
    detectedAt: requireTimestamp(row.detected_at).toISOString(),
    syncRunId: (row.sync_run_id as string | null) ?? null,
    linkedWorkItemId: (row.linked_work_item_id as string | null) ?? null,
  });
  if (!parsed.success) throw new R014RepositoryError("INVALID_RESULT");
  return parsed.data;
}

/** 读账户级历史前先确认调用方现在真能看这个户；团队空间只读全量，个人空间按 live 授权。 */
async function assertAccountVisible(
  client: Pool | PoolClient,
  auth: ApprovedWorkspaceAuthContext,
  media: string,
  accountId: string,
): Promise<void> {
  const result = auth.workspaceKind === "personal"
    ? await client.query(
      `SELECT true AS allowed FROM account_access_grants AS grant_row
       JOIN workspace_memberships AS member ON member.workspace_id=grant_row.workspace_id
         AND member.identity_id=grant_row.identity_id AND member.is_active=true AND member.user_id=$2
       WHERE grant_row.workspace_id=$1 AND grant_row.media=$3 AND grant_row.account_id=$4
         AND grant_row.revoked_at IS NULL LIMIT 1`,
      [auth.workspaceId, auth.userId, media, accountId],
    )
    : await client.query(
      "SELECT true AS allowed FROM accounts WHERE workspace_id=$1 AND media=$2 AND account_id=$3 LIMIT 1",
      [auth.workspaceId, media, accountId],
    );
  if (result.rows.length !== 1) throw new R014RepositoryError("FORBIDDEN");
}

export class ExternalChangeRepository {
  constructor(private readonly pool: Pool) {}

  /** 结构同步比对出的差异逐条落库。**只记录观测到的事实**，取不到旧值就存 null。 */
  async record(input: RecordExternalChangeInput): Promise<ExternalChange> {
    if (!externalChangeTargetTypeSchema.safeParse(input.targetType).success
      || !externalChangeFieldSchema.safeParse(input.field).success
      || typeof input.media !== "string" || typeof input.accountId !== "string"
      || typeof input.targetId !== "string" || input.targetId.length === 0) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const result = await this.pool.query(
      `INSERT INTO external_changes
         (workspace_id, media, account_id, target_type, target_id, field, from_value, to_value, sync_run_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
       RETURNING ${COLUMNS}`,
      [
        input.workspaceId, input.media, input.accountId, input.targetType, input.targetId, input.field,
        input.fromValue === null || input.fromValue === undefined ? null : JSON.stringify(input.fromValue),
        input.toValue === null || input.toValue === undefined ? null : JSON.stringify(input.toValue),
        input.syncRunId,
      ],
    );
    if (result.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
    return mapRow(result.rows[0] as Record<string, unknown>, input.workspaceId);
  }

  /** 4.3 时间线：倒序，游标是 id（BIGSERIAL 单调），不用时间戳当游标以免同秒漏行。 */
  async listForTimeline(
    auth: ApprovedWorkspaceAuthContext,
    media: string,
    accountId: string,
    options: { from?: string; to?: string; limit?: number; cursor?: string } = {},
  ): Promise<{ items: ExternalChangeTimelineItem[]; nextCursor: string | null }> {
    const approved = approveAuth(auth);
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new R014RepositoryError("INVALID_INPUT");
    if (options.cursor !== undefined && !/^\d+$/.test(options.cursor)) throw new R014RepositoryError("INVALID_INPUT");
    await assertAccountVisible(this.pool, approved, media, accountId);
    const result = await this.pool.query(
      `SELECT ${COLUMNS} FROM external_changes
       WHERE workspace_id=$1 AND media=$2 AND account_id=$3
         AND ($4::timestamptz IS NULL OR detected_at >= $4)
         AND ($5::timestamptz IS NULL OR detected_at <  $5)
         AND ($6::bigint IS NULL OR id < $6)
       ORDER BY id DESC LIMIT $7`,
      [approved.workspaceId, media, accountId, options.from ?? null, options.to ?? null, options.cursor ?? null, limit + 1],
    );
    const rows = result.rows.slice(0, limit).map((row) => mapRow(row as Record<string, unknown>, approved.workspaceId));
    return {
      items: rows.map((change) => toTimelineItem(change)),
      nextCursor: result.rows.length > limit ? rows[rows.length - 1]!.id : null,
    };
  }
}
