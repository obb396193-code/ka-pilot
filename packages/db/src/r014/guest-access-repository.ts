import { createHash } from "node:crypto";

import type { Pool } from "pg";

/**
 * v1.9.6/v1.9.12 访客登录的查库侧。
 *
 * 访客落的是**演示空间**：`kind='team'`（天然只读全量）+ `is_demo=true`（migration 023）。
 * 这里的两道硬闸不是形式：
 * 1. 目标空间必须 `is_demo` —— 否则一个配错的 `GUEST_WORKSPACE_ID` 就会把匿名会话
 *    放进真实团队空间，看到真账户和真消耗；
 * 2. 身份必须 `provider='guest'` 且在该空间有 **viewer** 成员行 —— 访客不建 user 行，
 *    这些都是灌数脚本预置的，登录只认不建。
 */
export class GuestAccessRepository {
  constructor(private readonly pool: Pool) {}

  async findGuestIdentity(workspaceId: string): Promise<string | null> {
    if (!/^[0-9a-fA-F-]{36}$/.test(workspaceId)) return null;
    const row = (await this.pool.query(
      `SELECT identity.id
       FROM auth_identities AS identity
       JOIN workspace_memberships AS member
         ON member.identity_id = identity.id AND member.is_active = true
       JOIN workspaces AS workspace
         ON workspace.id = member.workspace_id AND workspace.is_active = true
       WHERE identity.provider = 'guest' AND identity.is_active = true
         AND member.workspace_id = $1
         AND member.role = 'viewer'
         AND workspace.kind = 'team'
         AND workspace.is_demo = true
       LIMIT 2`,
      [workspaceId],
    )).rows as { id: string }[];
    // 两条以上说明预置数据有歧义，宁可不放行也不随便挑一个。
    return row.length === 1 ? String(row[0]!.id) : null;
  }

  /**
   * 给访客建会话。
   *
   * **为什么不复用 `createSessionForIdentity`**：那条路径强制要求身份有且仅有一个
   * `kind='personal'` 空间（没有就 `PERSONAL_WORKSPACE_MISSING`），而访客只有演示空间。
   * 给访客造一个个人空间只会在真库里多出一个没人用、却能被切进去的空间——
   * 所以这里另起一条只服务访客的建会话路径，落点写死成那个演示空间。
   *
   * 仍然逐条核过闸：身份必须是该演示空间的 viewer（`findGuestIdentity` 已核），
   * 这里再确认一次空间还是 `is_demo`，防两次查询之间被人改了标记。
   */
  async issueGuestSession(
    workspaceId: string, identityId: string, token: string, expiresAt: Date,
  ): Promise<boolean> {
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) return false;
    const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
    const inserted = await this.pool.query(
      `INSERT INTO auth_sessions(identity_id, active_workspace_id, token_hash, expires_at)
       SELECT $1, workspace.id, $3, $4
       FROM workspaces AS workspace
       JOIN workspace_memberships AS member
         ON member.workspace_id = workspace.id AND member.identity_id = $1
        AND member.is_active = true AND member.role = 'viewer'
       WHERE workspace.id = $2 AND workspace.is_demo = true AND workspace.kind = 'team'
       RETURNING id`,
      [identityId, workspaceId, tokenHash, expiresAt],
    );
    return inserted.rows.length === 1;
  }
}
