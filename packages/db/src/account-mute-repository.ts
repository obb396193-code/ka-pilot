import { approvedAccountAccessSchema, approvedWorkspaceAuthContextSchema, type ApprovedWorkspaceAuthContext } from "@ka/domain";
import type { Pool, PoolClient } from "pg";

export interface AccountMuteTarget { media: string; accountId: string }
export interface SetAccountMuteInput extends AccountMuteTarget { mutedUntil: string; reasonChip: string | null }
export interface AccountMuteRecord extends SetAccountMuteInput {
  workspaceId: string;
  mutedBy: string | null;
  createdAt: Date | null;
}
export class AccountMuteRepositoryError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_INPUT" | "INVALID_RESULT") {
    super(`Account mute ${code.toLowerCase()}`);
    this.name = "AccountMuteRepositoryError";
  }
}

type PersonalAuth = Extract<ApprovedWorkspaceAuthContext, { workspaceKind: "personal" }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validReason(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length <= 4096);
}
function validate(auth: ApprovedWorkspaceAuthContext, input: AccountMuteTarget, write: boolean): PersonalAuth {
  const parsed = approvedWorkspaceAuthContextSchema.safeParse(auth);
  if (!parsed.success || parsed.data.workspaceKind !== "personal") throw new AccountMuteRepositoryError("FORBIDDEN");
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new AccountMuteRepositoryError("INVALID_INPUT");
  const keys = write ? ["media", "accountId", "mutedUntil", "reasonChip"] : ["media", "accountId"];
  if (Object.keys(input).length !== keys.length || Object.keys(input).some((key) => !keys.includes(key))) {
    throw new AccountMuteRepositoryError("INVALID_INPUT");
  }
  const target = approvedAccountAccessSchema.safeParse({ media: input.media, accountId: input.accountId, accessLevel: "read" });
  if (!target.success) throw new AccountMuteRepositoryError("INVALID_INPUT");
  if (!parsed.data.scope.accounts.some((grant) => grant.media === input.media && grant.accountId === input.accountId)) {
    throw new AccountMuteRepositoryError("FORBIDDEN");
  }
  if (write && (!validDate((input as SetAccountMuteInput).mutedUntil) || !validReason((input as SetAccountMuteInput).reasonChip))) {
    throw new AccountMuteRepositoryError("INVALID_INPUT");
  }
  return parsed.data;
}

// Scope must originate from Session. Recheck/lock live authority so a revoked
// membership/grant cannot authorize a new storage write using a stale snapshot.
async function lockAuthority(client: PoolClient, auth: PersonalAuth, target: AccountMuteTarget): Promise<void> {
  const result = await client.query(
    `SELECT true AS allowed FROM workspaces AS workspace
     JOIN users AS actor ON actor.workspace_id=workspace.id AND actor.id=$2 AND actor.is_active=true
     JOIN workspace_memberships AS member ON member.workspace_id=workspace.id
       AND member.user_id=actor.id AND member.is_active=true AND member.role=$5
     JOIN auth_identities AS identity ON identity.id=member.identity_id AND identity.is_active=true
     JOIN account_access_grants AS grant_row ON grant_row.workspace_id=workspace.id
       AND grant_row.identity_id=identity.id AND grant_row.media=$3 AND grant_row.account_id=$4
       AND grant_row.access_level IN ('read','preview','execute')
     JOIN accounts AS account ON account.workspace_id=workspace.id
       AND account.media=grant_row.media AND account.account_id=grant_row.account_id
     WHERE workspace.id=$1 AND workspace.kind = 'personal' AND workspace.is_active=true
     LIMIT 2 FOR SHARE OF workspace, actor, member, identity, grant_row, account`,
    [auth.workspaceId, auth.userId, target.media, target.accountId, auth.role],
  );
  if (result.rows.length !== 1 || result.rows[0]?.allowed !== true) throw new AccountMuteRepositoryError("FORBIDDEN");
}

const columns = "workspace_id, media, account_id, to_char(muted_until, 'YYYY-MM-DD') AS muted_until, muted_by, reason_chip, created_at";
function mapRow(row: Record<string, unknown>, auth: PersonalAuth, target: AccountMuteTarget): AccountMuteRecord {
  if (row.workspace_id !== auth.workspaceId || row.media !== target.media || row.account_id !== target.accountId ||
    !validDate(row.muted_until) || !validReason(row.reason_chip) ||
    !(row.muted_by === null || (typeof row.muted_by === "string" && uuid.test(row.muted_by))) ||
    !(row.created_at === null || (row.created_at instanceof Date && Number.isFinite(row.created_at.getTime())))) {
    throw new AccountMuteRepositoryError("INVALID_RESULT");
  }
  return { workspaceId: auth.workspaceId, media: target.media, accountId: target.accountId,
    mutedUntil: row.muted_until, mutedBy: row.muted_by, reasonChip: row.reason_chip, createdAt: row.created_at };
}

/** Internal storage only. Does not calculate days, evaluate suppression, or expose a public write route. */
export class AccountMuteRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(auth: PersonalAuth, target: AccountMuteTarget, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      await lockAuthority(client, auth, target);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve original failure; never log source details. */ }
      throw error;
    } finally { client.release(); }
  }

  async set(auth: ApprovedWorkspaceAuthContext, input: SetAccountMuteInput): Promise<AccountMuteRecord> {
    const approved = validate(auth, input, true);
    const fixed = { ...input }; // Freeze caller input before the first await.
    return this.transaction(approved, fixed, async (client) => {
      const result = await client.query(
        `INSERT INTO account_mutes (workspace_id,media,account_id,muted_until,muted_by,reason_chip)
         VALUES ($1,$2,$3,$4::date,$5,$6)
         ON CONFLICT (workspace_id, media, account_id) DO UPDATE
           SET muted_until=EXCLUDED.muted_until, muted_by=EXCLUDED.muted_by, reason_chip=EXCLUDED.reason_chip
         RETURNING ${columns}`,
        [approved.workspaceId, fixed.media, fixed.accountId, fixed.mutedUntil, approved.userId, fixed.reasonChip],
      );
      if (result.rows.length !== 1) throw new AccountMuteRepositoryError("INVALID_RESULT");
      const row = mapRow(result.rows[0] as Record<string, unknown>, approved, fixed);
      if (row.mutedUntil !== fixed.mutedUntil || row.mutedBy !== approved.userId || row.reasonChip !== fixed.reasonChip) {
        throw new AccountMuteRepositoryError("INVALID_RESULT");
      }
      return row;
    });
  }

  async find(auth: ApprovedWorkspaceAuthContext, input: AccountMuteTarget): Promise<AccountMuteRecord | null> {
    const approved = validate(auth, input, false);
    const fixed = { ...input };
    return this.transaction(approved, fixed, async (client) => {
      const result = await client.query(`SELECT ${columns} FROM account_mutes WHERE workspace_id=$1 AND media=$2 AND account_id=$3`,
        [approved.workspaceId, fixed.media, fixed.accountId]);
      if (result.rows.length > 1) throw new AccountMuteRepositoryError("INVALID_RESULT");
      return result.rows.length === 0 ? null : mapRow(result.rows[0] as Record<string, unknown>, approved, fixed);
    });
  }
}
