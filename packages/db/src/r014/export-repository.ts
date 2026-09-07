import {
  exportCreateSchema, exportQueuedSchema, exportStatusSchema,
  type ApprovedWorkspaceAuthContext, type ExportCreate, type ExportQueued, type ExportStatus,
} from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, lockWorkspaceMembership,
  requireOwnWorkspace, requireTimestamp, requireUuid,
} from "./workspace-authority.js";

/**
 * v1.5 7.4 导出任务。仓储只管排队与状态；**不生成签名 URL**——
 * 签名要存储层的签名器，本层只存 file_ref/bytes/expires_at，URL 由服务层签。
 * 编一个 URL 出来会让前端拿到打不开的链接。
 */
export interface ExportStorageRecord {
  exportId: string;
  status: ExportStatus;
  kind: ExportCreate["kind"];
  format: ExportCreate["format"];
  fileRef: string | null;
  bytes: number | null;
  expiresAt: string | null;
  error: string | null;
  /** 文件已过签名有效期：服务层据此回 410，而不是给一条过期链接。 */
  fileExpired: boolean;
}

const COLUMNS = "id, workspace_id, kind, format, status, file_ref, bytes, error, expires_at";

function mapRow(row: Record<string, unknown>, workspaceId: string, now: Date): ExportStorageRecord {
  requireOwnWorkspace(row, workspaceId);
  const status = exportStatusSchema.safeParse(row.status);
  if (!status.success || typeof row.id !== "string") throw new R014RepositoryError("INVALID_RESULT");
  const expiresAt = row.expires_at === null ? null : requireTimestamp(row.expires_at);
  const bytes = row.bytes === null ? null : Number(row.bytes);
  if (bytes !== null && !Number.isInteger(bytes)) throw new R014RepositoryError("INVALID_RESULT");
  return {
    exportId: row.id,
    status: status.data,
    kind: row.kind as ExportCreate["kind"],
    format: row.format as ExportCreate["format"],
    fileRef: (row.file_ref as string | null) ?? null,
    bytes,
    expiresAt: expiresAt === null ? null : expiresAt.toISOString(),
    error: (row.error as string | null) ?? null,
    fileExpired: expiresAt !== null && expiresAt.getTime() <= now.getTime(),
  };
}

export class ExportRepository {
  constructor(private readonly pool: Pool) {}

  async create(auth: ApprovedWorkspaceAuthContext, input: ExportCreate): Promise<ExportQueued> {
    const approved = approveAuth(auth);
    const parsed = exportCreateSchema.safeParse(input);
    if (!parsed.success) throw new R014RepositoryError("INVALID_INPUT");
    const fixed = parsed.data; // Freeze caller input before the first await.
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      const result = await client.query(
        `INSERT INTO exports (workspace_id, user_id, kind, ref, format, status)
         VALUES ($1,$2,$3,$4::jsonb,$5,'queued')
         RETURNING id, status, kind, format`,
        [approved.workspaceId, approved.userId, fixed.kind, JSON.stringify(fixed.ref), fixed.format],
      );
      if (result.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
      const row = result.rows[0] as Record<string, unknown>;
      return exportQueuedSchema.parse({
        exportId: row.id, status: row.status, kind: row.kind, format: row.format,
      });
    });
  }

  /** 只查得到自己发起的导出：别人的导出连"存在"都不该露。 */
  async get(auth: ApprovedWorkspaceAuthContext, exportId: string, now: Date = new Date()): Promise<ExportStorageRecord> {
    const approved = approveAuth(auth);
    const id = requireUuid(exportId);
    const result = await this.pool.query(
      `SELECT ${COLUMNS} FROM exports WHERE id=$3 AND workspace_id=$1 AND user_id=$2`,
      [approved.workspaceId, approved.userId, id],
    );
    if (result.rows.length !== 1) throw new R014RepositoryError("NOT_FOUND");
    return mapRow(result.rows[0] as Record<string, unknown>, approved.workspaceId, now);
  }
}
