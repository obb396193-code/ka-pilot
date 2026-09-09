import { capabilityCategorySchema, capabilitySchema, type ApprovedWorkspaceAuthContext, type Capability } from "@ka/domain";
import type { Pool } from "pg";

import { R014RepositoryError, approveAuth } from "./workspace-authority.js";

// v1.5 5.7：capabilities 是**全局**注册表（key 主键、无 workspace_id），不按空间切分；
// 但仍要求调用方已通过 Session，未授权的人不该看到我们有哪些写能力。
// 录入/停用没有公开端点（R-010 的 MAPI 录入是 Codex 的活），本仓储只读。
const COLUMNS = "key, name, category, form_schema, permission, version, status, executor, media";

function mapRow(row: Record<string, unknown>): Capability {
  const parsed = capabilitySchema.safeParse({
    key: row.key, name: row.name, category: row.category, form_schema: row.form_schema,
    permission: row.permission, version: row.version, status: row.status,
    executor: row.executor, media: row.media,
  });
  if (!parsed.success) throw new R014RepositoryError("INVALID_RESULT");
  return parsed.data;
}

export class CapabilityRepository {
  constructor(private readonly pool: Pool) {}

  async list(auth: ApprovedWorkspaceAuthContext, category?: string): Promise<Capability[]> {
    approveAuth(auth);
    if (category !== undefined && !capabilityCategorySchema.safeParse(category).success) {
      throw new R014RepositoryError("INVALID_INPUT");
    }
    const result = await this.pool.query(
      `SELECT ${COLUMNS} FROM capabilities WHERE ($1::text IS NULL OR category=$1) ORDER BY category, key`,
      [category ?? null],
    );
    return result.rows.map((row) => mapRow(row as Record<string, unknown>));
  }

  async get(auth: ApprovedWorkspaceAuthContext, key: string): Promise<Capability> {
    approveAuth(auth);
    if (typeof key !== "string" || key.length === 0 || key.length > 120) throw new R014RepositoryError("INVALID_INPUT");
    const result = await this.pool.query(`SELECT ${COLUMNS} FROM capabilities WHERE key=$1`, [key]);
    if (result.rows.length !== 1) throw new R014RepositoryError("NOT_FOUND");
    return mapRow(result.rows[0] as Record<string, unknown>);
  }
}
