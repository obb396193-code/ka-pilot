import type {
  AccountAccessLevel,
  AuthRole,
  WorkspaceSyncBlockedReason,
} from "@ka/domain";
import type { Pool, PoolClient } from "pg";

export interface WorkspaceSyncAccountGrant {
  media: string;
  accountId: string;
  accessLevel: AccountAccessLevel;
}

export interface WorkspaceSyncCandidate {
  workspaceId: string;
  userId: string;
  userActive: boolean;
  identityId: string | null;
  identityActive: boolean | null;
  membershipActive: boolean | null;
  membershipRole: AuthRole | null;
  hasQihangIdentity: boolean;
  allowedAccounts: WorkspaceSyncAccountGrant[];
  hasSuccessfulFull: boolean;
}

export interface WorkspaceSyncTickSnapshot {
  workspaceId: string;
  workspaceActive: boolean | null;
  candidates: WorkspaceSyncCandidate[];
}

interface WorkspaceRow {
  is_active: boolean;
}

interface CandidateRow {
  workspace_id: string;
  user_id: string;
  user_active: boolean;
  identity_id: string | null;
  identity_active: boolean | null;
  membership_active: boolean | null;
  membership_role: AuthRole | null;
  has_qihang_identity: boolean;
  grants: unknown;
  has_successful_full: boolean;
}

interface RawGrant {
  media: unknown;
  accountId: unknown;
  accessLevel: unknown;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCESS_LEVELS = new Set<AccountAccessLevel>(["read", "preview", "execute"]);

function mapGrants(input: unknown): WorkspaceSyncAccountGrant[] {
  if (!Array.isArray(input)) throw new Error("Workspace sync grants are invalid");
  const seen = new Set<string>();
  return input.map((value) => {
    if (typeof value !== "object" || value === null) {
      throw new Error("Workspace sync grant is invalid");
    }
    const grant = value as RawGrant;
    if (
      typeof grant.media !== "string" ||
      typeof grant.accountId !== "string" ||
      typeof grant.accessLevel !== "string" ||
      !ACCESS_LEVELS.has(grant.accessLevel as AccountAccessLevel)
    ) {
      throw new Error("Workspace sync grant is invalid");
    }
    const key = `${grant.media}\u0000${grant.accountId}`;
    if (seen.has(key)) throw new Error("Workspace sync grant is duplicated");
    seen.add(key);
    return {
      media: grant.media,
      accountId: grant.accountId,
      accessLevel: grant.accessLevel as AccountAccessLevel,
    };
  });
}

function mapCandidate(row: CandidateRow): WorkspaceSyncCandidate {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    userActive: row.user_active,
    identityId: row.identity_id,
    identityActive: row.identity_active,
    membershipActive: row.membership_active,
    membershipRole: row.membership_role,
    hasQihangIdentity: row.has_qihang_identity,
    allowedAccounts: mapGrants(row.grants),
    hasSuccessfulFull: row.has_successful_full,
  };
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original read error.
  }
}

export function candidateBlockedReason(
  snapshot: WorkspaceSyncTickSnapshot,
  candidate: WorkspaceSyncCandidate,
): WorkspaceSyncBlockedReason | null {
  if (snapshot.workspaceActive !== true) return "WORKSPACE_INACTIVE";
  if (!candidate.userActive) return "USER_INACTIVE";
  if (candidate.identityId === null) return "IDENTITY_MISSING";
  if (candidate.membershipActive === null || candidate.membershipRole === null) {
    return "MEMBERSHIP_MISSING";
  }
  if (!candidate.membershipActive) return "MEMBERSHIP_INACTIVE";
  if (candidate.identityActive !== true) return "IDENTITY_INACTIVE";
  if (!candidate.hasQihangIdentity) return "QIHANG_IDENTITY_MISSING";
  return null;
}

export class WorkspaceSyncRepository {
  constructor(private readonly pool: Pool) {}

  async loadTickSnapshot(
    workspaceId: string,
    media: string,
  ): Promise<WorkspaceSyncTickSnapshot> {
    if (!UUID_PATTERN.test(workspaceId)) throw new Error("workspaceId must be a UUID");
    if (!/^[A-Z0-9_]{1,32}$/.test(media)) throw new Error("media is invalid");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const workspace = await client.query<WorkspaceRow>(
        "SELECT is_active FROM workspaces WHERE id = $1",
        [workspaceId],
      );
      const candidates = await client.query<CandidateRow>(
        `SELECT
           actor.workspace_id,
           actor.id AS user_id,
           actor.is_active AS user_active,
           membership.identity_id,
           identity.is_active AS identity_active,
           membership.is_active AS membership_active,
           membership.role AS membership_role,
           (actor.qihang_user_id IS NOT NULL AND btrim(actor.qihang_user_id) <> '')
             AS has_qihang_identity,
           COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'media', access_grant.media,
                 'accountId', access_grant.account_id,
                 'accessLevel', access_grant.access_level
               ) ORDER BY access_grant.media, access_grant.account_id
             ) FILTER (WHERE access_grant.account_id IS NOT NULL),
             '[]'::jsonb
           ) AS grants,
           EXISTS (
             SELECT 1
             FROM jobs AS completed_job
             JOIN etl_runs AS completed_run
               ON completed_run.job_id = completed_job.id
              AND completed_run.workspace_id = completed_job.workspace_id
             WHERE completed_job.workspace_id = actor.workspace_id
               AND completed_job.credential_owner_user_id = actor.id
               AND completed_job.job_type = 'etl_full'
               AND completed_job.payload->>'media' = $2
               AND completed_run.run_kind = 'full'
               AND completed_run.status = 'done'
           ) AS has_successful_full
         FROM users AS actor
         LEFT JOIN workspace_memberships AS membership
           ON membership.workspace_id = actor.workspace_id
          AND membership.user_id = actor.id
         LEFT JOIN auth_identities AS identity
           ON identity.id = membership.identity_id
         LEFT JOIN account_access_grants AS access_grant
           ON access_grant.workspace_id = membership.workspace_id
          AND access_grant.identity_id = membership.identity_id
          AND access_grant.media = $2
         WHERE actor.workspace_id = $1
         GROUP BY
           actor.workspace_id,
           actor.id,
           actor.is_active,
           actor.qihang_user_id,
           membership.identity_id,
           membership.is_active,
           membership.role,
           identity.is_active
         ORDER BY actor.id`,
        [workspaceId, media],
      );
      await client.query("COMMIT");
      return {
        workspaceId,
        workspaceActive: workspace.rows[0]?.is_active ?? null,
        candidates: candidates.rows.map(mapCandidate),
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}
