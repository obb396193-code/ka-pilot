import {
  DEFAULT_DECISION_POLICY, decisionPolicySchema,
  type ApprovedWorkspaceAuthContext, type DecisionPolicy,
} from "@ka/domain";
import type { Pool } from "pg";

import {
  R014RepositoryError, approveAuth, inTransaction, lockWorkspaceMembership,
  requireOwnWorkspace, requireTimestamp,
} from "./workspace-authority.js";

// v1.5 10.11：每 workspace 一行阈值。这行决定系统在什么条件下敢自动改价改预算，
// 因此写侧限 lead|admin——契约未写权限，此处取保守值并已回抛 arch。
const WRITE_ROLES = new Set(["lead", "admin"]);

export interface DecisionPolicyRecord {
  policy: DecisionPolicy;
  updatedBy: { userId: string; name: string } | null;
  updatedAt: string | null;
}

const DEFAULT_RECORD: DecisionPolicyRecord = {
  policy: DEFAULT_DECISION_POLICY,
  updatedBy: null,
  updatedAt: null,
};

function mapRow(row: Record<string, unknown>, workspaceId: string): DecisionPolicyRecord {
  requireOwnWorkspace(row, workspaceId);
  const parsed = decisionPolicySchema.safeParse(row.policy);
  // 存量 JSONB 解析不了就退回默认，并把 updatedAt 保留——不把坏阈值当有效阈值放行。
  if (!parsed.success) {
    return { ...DEFAULT_RECORD, updatedAt: row.updated_at === null ? null : requireTimestamp(row.updated_at).toISOString() };
  }
  const userId = row.updated_by;
  return {
    policy: parsed.data,
    updatedBy: userId === null || userId === undefined
      ? null
      : { userId: String(userId), name: typeof row.updated_by_name === "string" ? row.updated_by_name : "" },
    updatedAt: row.updated_at === null ? null : requireTimestamp(row.updated_at).toISOString(),
  };
}

const SELECT = `SELECT policy.workspace_id, policy.policy, policy.updated_by, policy.updated_at,
    actor.name AS updated_by_name
  FROM decision_policies AS policy
  LEFT JOIN users AS actor ON actor.workspace_id=policy.workspace_id AND actor.id=policy.updated_by
  WHERE policy.workspace_id=$1`;

export class DecisionPolicyRepository {
  constructor(private readonly pool: Pool) {}

  /** 没配过 → 返回 api.md 10.11 点名的保守默认，不建行。 */
  async get(auth: ApprovedWorkspaceAuthContext): Promise<DecisionPolicyRecord> {
    const approved = approveAuth(auth);
    const result = await this.pool.query(SELECT, [approved.workspaceId]);
    if (result.rows.length === 0) return DEFAULT_RECORD;
    if (result.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
    return mapRow(result.rows[0] as Record<string, unknown>, approved.workspaceId);
  }

  async put(auth: ApprovedWorkspaceAuthContext, policy: DecisionPolicy): Promise<DecisionPolicyRecord> {
    const approved = approveAuth(auth);
    if (!WRITE_ROLES.has(approved.role)) throw new R014RepositoryError("FORBIDDEN");
    const parsed = decisionPolicySchema.safeParse(policy);
    if (!parsed.success) throw new R014RepositoryError("INVALID_INPUT");
    const fixed = parsed.data; // Freeze caller input before the first await.
    return inTransaction(this.pool, async (client) => {
      await lockWorkspaceMembership(client, approved);
      await client.query(
        `INSERT INTO decision_policies (workspace_id, policy, updated_by, updated_at)
         VALUES ($1,$2::jsonb,$3,now())
         ON CONFLICT (workspace_id) DO UPDATE
           SET policy=EXCLUDED.policy, updated_by=EXCLUDED.updated_by, updated_at=now()`,
        [approved.workspaceId, JSON.stringify(fixed), approved.userId],
      );
      const result = await client.query(SELECT, [approved.workspaceId]);
      if (result.rows.length !== 1) throw new R014RepositoryError("INVALID_RESULT");
      const saved = mapRow(result.rows[0] as Record<string, unknown>, approved.workspaceId);
      if (saved.updatedBy?.userId !== approved.userId) throw new R014RepositoryError("INVALID_RESULT");
      return saved;
    });
  }
}
