import { readinessDimensionSchema, type ApprovedWorkspaceAuthContext, type ReadinessOverride } from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, lockWorkspaceMembership, requireOwnWorkspace,
} from "./workspace-authority.js";

// v1.5.1 ②：就绪度六段里系统推不出来的（策略/商品等），人工勾。
// 只存 ready 与留痕；ratio / missing 永远是系统算的，不由人工写入。
export interface ReadinessOverrideRecord extends ReadinessOverride {
  note: string | null;
  markedBy: string | null;
  markedAt: string | null;
}

const COLUMNS = "workspace_id, task_id, dimension, ready, note, marked_by, marked_at";

function mapRow(row: Record<string, unknown>, workspaceId: string): ReadinessOverrideRecord {
  requireOwnWorkspace(row, workspaceId);
  const dimension = readinessDimensionSchema.safeParse(row.dimension);
  if (!dimension.success || typeof row.ready !== "boolean") throw new R014RepositoryError("INVALID_RESULT");
  return {
    dimension: dimension.data,
    ready: row.ready,
    note: (row.note as string | null) ?? null,
    markedBy: (row.marked_by as string | null) ?? null,
    markedAt: row.marked_at instanceof Date ? row.marked_at.toISOString() : null,
  };
}

export class TaskReadinessRepository {
  constructor(private readonly pool: Pool) {}

  async list(auth: ApprovedWorkspaceAuthContext, taskId: string): Promise<ReadinessOverrideRecord[]> {
    const approved = approveAuth(auth);
    if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const result = await this.pool.query(
      `SELECT ${COLUMNS} FROM task_readiness_overrides WHERE workspace_id=$1 AND task_id=$2 ORDER BY dimension`,
      [approved.workspaceId, taskId],
    );
    return result.rows.map((row) => mapRow(row as Record<string, unknown>, approved.workspaceId));
  }

  async put(
    auth: ApprovedWorkspaceAuthContext,
    taskId: string,
    dimension: string,
    ready: boolean,
    note: string | null = null,
  ): Promise<ReadinessOverrideRecord> {
    const approved = approveAuth(auth);
    const parsedDimension = readinessDimensionSchema.safeParse(dimension);
    if (!parsedDimension.success || typeof ready !== "boolean"
      || typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128
      || !(note === null || (typeof note === "string" && note.length <= 4096))) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const fixed = { taskId, dimension: parsedDimension.data, ready, note }; // Freeze before the first await.
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      // 任务必须属于本空间：FK 已经保证，这里先查是为了把 23503 变成明确的 NOT_FOUND。
      const task = await client.query(
        "SELECT 1 FROM tasks WHERE workspace_id=$1 AND task_id=$2 FOR SHARE",
        [approved.workspaceId, fixed.taskId],
      );
      if (task.rows.length !== 1) throw new R014RepositoryError("NOT_FOUND");
      const result = await client.query(
        `INSERT INTO task_readiness_overrides (workspace_id, task_id, dimension, ready, note, marked_by, marked_at)
         VALUES ($1,$2,$3,$4,$5,$6,now())
         ON CONFLICT (workspace_id, task_id, dimension) DO UPDATE
           SET ready=EXCLUDED.ready, note=EXCLUDED.note, marked_by=EXCLUDED.marked_by, marked_at=now()
         RETURNING ${COLUMNS}`,
        [approved.workspaceId, fixed.taskId, fixed.dimension, fixed.ready, fixed.note, approved.userId],
      );
      if (result.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
      const saved = mapRow(result.rows[0] as Record<string, unknown>, approved.workspaceId);
      if (saved.ready !== fixed.ready || saved.markedBy !== approved.userId) {
        throw new R014RepositoryError("INVALID_RESULT");
      }
      return saved;
    });
  }
}
