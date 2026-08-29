import {
  authSessionSnapshotSchema,
  resolveApprovedAuthContext,
  type AuthResolution,
  type AuthRole,
  type AuthSessionSnapshot,
} from "@ka/domain";
import type { Pool, PoolClient, QueryResultRow } from "pg";

interface AuthSessionRow {
  session_id: string;
  identity_id: string;
  active_workspace_id: string;
  workspace_kind: "personal" | "team";
  active_personal_workspace_ids: string[];
  active_workspace_member_count: string | number;
  expires_at: Date;
  revoked_at: Date | null;
  identity_active: boolean;
  membership_workspace_id: string | null;
  membership_identity_id: string | null;
  membership_user_id: string | null;
  membership_role: AuthRole | null;
  membership_active: boolean | null;
  user_workspace_id: string | null;
  user_id: string | null;
  user_active: boolean | null;
  grants: unknown;
}

const tokenHashPattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Queryable = Pick<Pool | PoolClient, "query">;

export interface CreateSessionForIdentityInput {
  identityId: string;
  tokenHash: string;
  now: Date;
  expiresAt: Date;
}

export interface SwitchSessionWorkspaceInput {
  tokenHash: string;
  nextTokenHash: string;
  targetWorkspaceId: string;
  now: Date;
}

function rejected(
  httpStatus: 401 | 403,
  reason: Extract<AuthResolution, { status: "rejected" }>["reason"],
): AuthResolution {
  return { status: "rejected", httpStatus, reason };
}

function toSnapshot(row: AuthSessionRow): AuthSessionSnapshot {
  return authSessionSnapshotSchema.parse({
    sessionId: row.session_id,
    identityId: row.identity_id,
    activeWorkspaceId: row.active_workspace_id,
    workspaceKind: row.workspace_kind,
    activePersonalWorkspaceIds: row.active_personal_workspace_ids,
    activeWorkspaceMemberCount: Number(row.active_workspace_member_count),
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    identityActive: row.identity_active,
    membershipWorkspaceId: row.membership_workspace_id,
    membershipIdentityId: row.membership_identity_id,
    membershipUserId: row.membership_user_id,
    membershipRole: row.membership_role,
    membershipActive: row.membership_active,
    userWorkspaceId: row.user_workspace_id,
    userId: row.user_id,
    userActive: row.user_active,
    grants: row.grants,
  });
}

export class AuthSessionRepository {
  constructor(private readonly pool: Pool) {}

  private async findSnapshot(
    queryable: Queryable,
    tokenHash: string,
  ): Promise<AuthSessionSnapshot | null> {
    if (!tokenHashPattern.test(tokenHash)) return null;
    const result = await queryable.query<AuthSessionRow>(
      `SELECT
         session.id AS session_id,
         session.identity_id,
         session.active_workspace_id,
         workspace.kind AS workspace_kind,
         ARRAY(
           SELECT personal_membership.workspace_id::text
           FROM workspace_memberships AS personal_membership
           JOIN workspaces AS personal_workspace
             ON personal_workspace.id = personal_membership.workspace_id
            AND personal_workspace.kind = 'personal'
           JOIN users AS personal_actor
             ON personal_actor.workspace_id = personal_membership.workspace_id
            AND personal_actor.id = personal_membership.user_id
            AND personal_actor.is_active = true
           WHERE personal_membership.identity_id = session.identity_id
             AND personal_membership.is_active = true
           ORDER BY personal_membership.workspace_id::text COLLATE "C"
         ) AS active_personal_workspace_ids,
         (
           SELECT count(*)
           FROM workspace_memberships AS workspace_member
           JOIN users AS workspace_actor
             ON workspace_actor.workspace_id = workspace_member.workspace_id
            AND workspace_actor.id = workspace_member.user_id
            AND workspace_actor.is_active = true
           WHERE workspace_member.workspace_id = session.active_workspace_id
             AND workspace_member.is_active = true
         ) AS active_workspace_member_count,
         session.expires_at,
         session.revoked_at,
         identity.is_active AS identity_active,
         membership.workspace_id AS membership_workspace_id,
         membership.identity_id AS membership_identity_id,
         membership.user_id AS membership_user_id,
         membership.role AS membership_role,
         membership.is_active AS membership_active,
         actor.workspace_id AS user_workspace_id,
         actor.id AS user_id,
         actor.is_active AS user_active,
         COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'workspaceId', access_grant.workspace_id,
               'identityId', access_grant.identity_id,
               'media', access_grant.media,
               'accountId', access_grant.account_id,
               'accessLevel', access_grant.access_level
             ) ORDER BY access_grant.media, access_grant.account_id
           ) FILTER (WHERE access_grant.account_id IS NOT NULL),
           '[]'::jsonb
         ) AS grants
       FROM auth_sessions AS session
       JOIN auth_identities AS identity
         ON identity.id = session.identity_id
       JOIN workspaces AS workspace
         ON workspace.id = session.active_workspace_id
       LEFT JOIN workspace_memberships AS membership
         ON membership.workspace_id = session.active_workspace_id
        AND membership.identity_id = session.identity_id
       LEFT JOIN users AS actor
         ON actor.workspace_id = membership.workspace_id
        AND actor.id = membership.user_id
       LEFT JOIN account_access_grants AS access_grant
         ON access_grant.workspace_id = membership.workspace_id
        AND access_grant.identity_id = membership.identity_id
       WHERE session.token_hash = $1
       GROUP BY
         session.id,
         workspace.kind,
         identity.is_active,
         membership.workspace_id,
         membership.identity_id,
         membership.user_id,
         membership.role,
         membership.is_active,
         actor.workspace_id,
         actor.id,
         actor.is_active`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    if (result.rows.length !== 1) throw new Error("Auth session lookup returned multiple rows");
    return toSnapshot(row);
  }

  async findSnapshotByTokenHash(tokenHash: string): Promise<AuthSessionSnapshot | null> {
    return this.findSnapshot(this.pool, tokenHash);
  }

  async resolveApprovedAuthContext(
    tokenHash: string,
    now: Date,
    expectedWorkspaceId?: string,
  ): Promise<AuthResolution> {
    return resolveApprovedAuthContext(
      await this.findSnapshotByTokenHash(tokenHash),
      now,
      expectedWorkspaceId,
    );
  }

  async createSessionForIdentity(input: CreateSessionForIdentityInput): Promise<AuthResolution> {
    if (
      !uuidPattern.test(input.identityId) ||
      !tokenHashPattern.test(input.tokenHash) ||
      !Number.isFinite(input.now.getTime()) ||
      !Number.isFinite(input.expiresAt.getTime()) ||
      input.expiresAt.getTime() <= input.now.getTime()
    ) {
      return rejected(403, "INVALID_AUTH_STATE");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const identity = await client.query<{ is_active: boolean }>(
        "SELECT is_active FROM auth_identities WHERE id = $1 FOR UPDATE",
        [input.identityId],
      );
      if (identity.rows[0] === undefined) {
        await client.query("ROLLBACK");
        return rejected(403, "IDENTITY_INACTIVE");
      }
      if (!identity.rows[0].is_active) {
        await client.query("ROLLBACK");
        return rejected(403, "IDENTITY_INACTIVE");
      }
      const personal = await client.query<{ workspace_id: string }>(
        `SELECT membership.workspace_id
         FROM workspace_memberships AS membership
         JOIN workspaces AS workspace
           ON workspace.id = membership.workspace_id
          AND workspace.kind = 'personal'
         JOIN users AS actor
           ON actor.workspace_id = membership.workspace_id
          AND actor.id = membership.user_id
          AND actor.is_active = true
         WHERE membership.identity_id = $1
           AND membership.is_active = true
         ORDER BY membership.workspace_id::text COLLATE "C"
         FOR UPDATE OF membership`,
        [input.identityId],
      );
      if (personal.rows.length === 0) {
        await client.query("ROLLBACK");
        return rejected(403, "PERSONAL_WORKSPACE_MISSING");
      }
      if (personal.rows.length !== 1) {
        await client.query("ROLLBACK");
        return rejected(403, "PERSONAL_WORKSPACE_AMBIGUOUS");
      }
      const activeWorkspaceId = personal.rows[0]!.workspace_id;
      const memberCount = await client.query<{ count: string }>(
        `SELECT count(*)
         FROM workspace_memberships AS membership
         JOIN users AS actor
           ON actor.workspace_id = membership.workspace_id
          AND actor.id = membership.user_id
          AND actor.is_active = true
         WHERE membership.workspace_id = $1 AND membership.is_active = true`,
        [activeWorkspaceId],
      );
      if (Number(memberCount.rows[0]?.count) !== 1) {
        await client.query("ROLLBACK");
        return rejected(403, "PERSONAL_WORKSPACE_SHARED");
      }
      await client.query(
        `INSERT INTO auth_sessions (
           identity_id, active_workspace_id, token_hash, expires_at, created_at, last_seen_at
         ) VALUES ($1, $2, $3, $4, $5, $5)`,
        [input.identityId, activeWorkspaceId, input.tokenHash, input.expiresAt, input.now],
      );
      const resolution = resolveApprovedAuthContext(
        await this.findSnapshot(client, input.tokenHash),
        input.now,
        activeWorkspaceId,
      );
      if (resolution.status !== "approved") {
        await client.query("ROLLBACK");
        return resolution;
      }
      await client.query("COMMIT");
      return resolution;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async switchSessionWorkspace(input: SwitchSessionWorkspaceInput): Promise<AuthResolution> {
    if (
      !tokenHashPattern.test(input.tokenHash) ||
      !tokenHashPattern.test(input.nextTokenHash) ||
      input.tokenHash === input.nextTokenHash ||
      !uuidPattern.test(input.targetWorkspaceId) ||
      !Number.isFinite(input.now.getTime())
    ) {
      return rejected(403, "INVALID_AUTH_STATE");
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<QueryResultRow>(
        "SELECT id FROM auth_sessions WHERE token_hash = $1 FOR UPDATE",
        [input.tokenHash],
      );
      if (locked.rows.length !== 1) {
        await client.query("ROLLBACK");
        return rejected(401, "SESSION_NOT_FOUND");
      }
      const current = resolveApprovedAuthContext(
        await this.findSnapshot(client, input.tokenHash),
        input.now,
      );
      if (current.status !== "approved") {
        await client.query("ROLLBACK");
        return current;
      }
      const updated = await client.query(
        `UPDATE auth_sessions AS session
         SET active_workspace_id = $2,
             token_hash = $3,
             last_seen_at = $4
         WHERE session.token_hash = $1
           AND session.revoked_at IS NULL
           AND session.expires_at > $4
           AND EXISTS (
             SELECT 1
             FROM auth_identities AS identity
             JOIN workspace_memberships AS membership
               ON membership.identity_id = identity.id
              AND membership.workspace_id = $2
              AND membership.is_active = true
             JOIN users AS actor
               ON actor.workspace_id = membership.workspace_id
              AND actor.id = membership.user_id
              AND actor.is_active = true
             WHERE identity.id = session.identity_id
               AND identity.is_active = true
           )`,
        [input.tokenHash, input.targetWorkspaceId, input.nextTokenHash, input.now],
      );
      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        return rejected(403, "MEMBERSHIP_MISSING");
      }
      const resolution = resolveApprovedAuthContext(
        await this.findSnapshot(client, input.nextTokenHash),
        input.now,
        input.targetWorkspaceId,
      );
      if (resolution.status !== "approved") {
        await client.query("ROLLBACK");
        return resolution;
      }
      await client.query("COMMIT");
      return resolution;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
