import {
  authSessionSnapshotSchema,
  resolveApprovedAuthContext,
  type AuthResolution,
  type AuthRole,
  type AuthSessionSnapshot,
} from "@ka/domain";
import type { Pool } from "pg";

interface AuthSessionRow {
  session_id: string;
  identity_id: string;
  active_workspace_id: string;
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

function toSnapshot(row: AuthSessionRow): AuthSessionSnapshot {
  return authSessionSnapshotSchema.parse({
    sessionId: row.session_id,
    identityId: row.identity_id,
    activeWorkspaceId: row.active_workspace_id,
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

  async findSnapshotByTokenHash(tokenHash: string): Promise<AuthSessionSnapshot | null> {
    if (!tokenHashPattern.test(tokenHash)) return null;
    const result = await this.pool.query<AuthSessionRow>(
      `SELECT
         session.id AS session_id,
         session.identity_id,
         session.active_workspace_id,
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
}
