import {
  savedViewCreateSchema, savedViewPatchSchema, savedViewSchema,
  type ApprovedWorkspaceAuthContext, type SavedView, type SavedViewCreate, type SavedViewPatch,
} from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, lockWorkspaceMembership,
  requireOwnWorkspace, requireTimestamp, requireUuid,
} from "./workspace-authority.js";

// v1.5 3.10 个人视图。`/me/views` = 本人的视图；is_shared 只是"可被共享"的标记，
// 本端点不返回别人共享的视图（fixture 项里没有 owner 字段，无法区分归属）——
// 共享读路径等公共资产（v1.5.1 ⑤）定义后再接，此处不自造。
const COLUMNS = "id, workspace_id, page, name, config, is_shared, updated_at";

function mapRow(row: Record<string, unknown>, workspaceId: string): SavedView {
  requireOwnWorkspace(row, workspaceId);
  const parsed = savedViewSchema.safeParse({
    id: row.id,
    page: row.page,
    name: row.name,
    config: row.config,
    isShared: row.is_shared,
    updatedAt: requireTimestamp(row.updated_at).toISOString(),
  });
  if (!parsed.success) throw new R014RepositoryError("INVALID_RESULT");
  return parsed.data;
}

export class SavedViewRepository {
  constructor(private readonly pool: Pool) {}

  async list(auth: ApprovedWorkspaceAuthContext, page?: string): Promise<SavedView[]> {
    const approved = approveAuth(auth);
    if (page !== undefined && !savedViewSchema.shape.page.safeParse(page).success) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const result = await this.pool.query(
      `SELECT ${COLUMNS} FROM saved_views
       WHERE workspace_id=$1 AND owner_user_id=$2 AND ($3::text IS NULL OR page=$3)
       ORDER BY updated_at DESC, id`,
      [approved.workspaceId, approved.userId, page ?? null],
    );
    return result.rows.map((row) => mapRow(row as Record<string, unknown>, approved.workspaceId));
  }

  async create(auth: ApprovedWorkspaceAuthContext, input: SavedViewCreate): Promise<SavedView> {
    const approved = approveAuth(auth);
    const parsed = savedViewCreateSchema.safeParse(input);
    if (!parsed.success) throw new R014RepositoryError("INVALID_INPUT");
    const fixed = parsed.data; // Freeze caller input before the first await.
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      const result = await client.query(
        `INSERT INTO saved_views (workspace_id, owner_user_id, page, name, config, is_shared, updated_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,now())
         ON CONFLICT (workspace_id, owner_user_id, page, name) DO NOTHING
         RETURNING ${COLUMNS}`,
        [approved.workspaceId, approved.userId, fixed.page, fixed.name, JSON.stringify(fixed.config), fixed.isShared ?? false],
      );
      // 同名同页已存在 → 409，不静默覆盖用户已有的视图。
      if (result.rows.length === 0) throw new R014RepositoryError("CONFLICT");
      return mapRow(result.rows[0] as Record<string, unknown>, approved.workspaceId);
    });
  }

  async patch(auth: ApprovedWorkspaceAuthContext, id: string, input: SavedViewPatch): Promise<SavedView> {
    const approved = approveAuth(auth);
    const viewId = requireUuid(id);
    const parsed = savedViewPatchSchema.safeParse(input);
    if (!parsed.success) throw new R014RepositoryError("INVALID_INPUT");
    const fixed = parsed.data; // Freeze caller input before the first await.
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      const result = await client.query(
        `UPDATE saved_views SET
           name = COALESCE($4, name),
           config = COALESCE($5::jsonb, config),
           is_shared = COALESCE($6, is_shared),
           updated_at = now()
         WHERE id=$3 AND workspace_id=$1 AND owner_user_id=$2
         RETURNING ${COLUMNS}`,
        [
          approved.workspaceId, approved.userId, viewId,
          fixed.name ?? null,
          fixed.config === undefined ? null : JSON.stringify(fixed.config),
          fixed.isShared ?? null,
        ],
      );
      // 别人的视图 / 不存在 → 一律 NOT_FOUND，不泄露"存在但不是你的"。
      if (result.rows.length !== 1) throw new R014RepositoryError("NOT_FOUND");
      return mapRow(result.rows[0] as Record<string, unknown>, approved.workspaceId);
    });
  }

  async remove(auth: ApprovedWorkspaceAuthContext, id: string): Promise<void> {
    const approved = approveAuth(auth);
    const viewId = requireUuid(id);
    await inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      const result = await client.query(
        "DELETE FROM saved_views WHERE id=$3 AND workspace_id=$1 AND owner_user_id=$2 RETURNING id",
        [approved.workspaceId, approved.userId, viewId],
      );
      if (result.rows.length !== 1) throw new R014RepositoryError("NOT_FOUND");
    });
  }
}
