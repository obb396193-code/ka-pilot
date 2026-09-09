import type { Pool } from "pg";
import { approvedAccountAccessSchema } from "@ka/domain";

export interface AccountCredentialScope {
  media: string;
  accountId: string;
}

const scheduledAccountsSchema = approvedAccountAccessSchema.pick({ media: true, accountId: true }).array().min(1).max(1000);

export class CredentialRepository {
  constructor(private readonly pool: Pool) {}

  async resolveQihangUserId(workspaceId: string, userId: string): Promise<string | null> {
    const result = await this.pool.query<{ qihang_user_id: string | null }>(
      `SELECT qihang_user_id
       FROM users
       WHERE workspace_id = $1 AND id = $2 AND is_active = true`,
      [workspaceId, userId],
    );
    return result.rows[0]?.qihang_user_id ?? null;
  }

  async resolveScheduledQihangUserId(
    workspaceId: string,
    userId: string,
    identityId: string,
    accounts: readonly AccountCredentialScope[],
  ): Promise<string | null> {
    const parsed = scheduledAccountsSchema.safeParse(accounts);
    if (!parsed.success || new Set(parsed.data.map(a => JSON.stringify([a.media, a.accountId]))).size !== parsed.data.length) return null;
    const result = await this.pool.query<{ qihang_user_id: string }>(
      `WITH requested AS (
         SELECT media, account_id FROM jsonb_to_recordset($4::jsonb) AS value(media text, account_id text)
       )
       SELECT actor.qihang_user_id
       FROM users AS actor
       JOIN workspaces AS workspace
         ON workspace.id = actor.workspace_id AND workspace.is_active = true AND workspace.kind = 'personal'
       JOIN workspace_memberships AS membership
         ON membership.workspace_id = actor.workspace_id
        AND membership.user_id = actor.id
        AND membership.identity_id = $3
        AND membership.is_active = true
       JOIN auth_identities AS identity
         ON identity.id = membership.identity_id
        AND identity.is_active = true
       WHERE actor.workspace_id = $1
         AND actor.id = $2
         AND actor.is_active = true
         AND actor.qihang_user_id IS NOT NULL
         AND btrim(actor.qihang_user_id) <> ''
         AND NOT EXISTS (
           SELECT 1 FROM requested WHERE NOT EXISTS (
             SELECT 1 FROM account_access_grants AS grant_row
             JOIN accounts AS account ON account.workspace_id=grant_row.workspace_id
               AND account.media=grant_row.media AND account.account_id=grant_row.account_id
             WHERE grant_row.workspace_id=actor.workspace_id
               AND grant_row.identity_id=membership.identity_id
               AND grant_row.media=requested.media AND grant_row.account_id=requested.account_id
               AND grant_row.access_level IN ('read','preview','execute')
               AND (to_jsonb(grant_row)->>'revoked_at') IS NULL
           )
         ) LIMIT 2`,
      [workspaceId, userId, identityId, JSON.stringify(parsed.data.map(a => ({ media: a.media, account_id: a.accountId })))],
    );
    // One query validates the complete frozen range and returns only its original
    // owner's credential. Never reduce a job scope or substitute another owner.
    const value = result.rows[0]?.qihang_user_id;
    return result.rows.length === 1 && typeof value === "string" && value.trim() !== "" ? value : null;
  }

  async resolveIdeaLabSecretRef(workspaceId: string, userId: string): Promise<string | null> {
    const result = await this.pool.query<{ idealab_ak_ref: string | null }>(
      `SELECT idealab_ak_ref
       FROM users
       WHERE workspace_id = $1 AND id = $2 AND is_active = true`,
      [workspaceId, userId],
    );
    return result.rows[0]?.idealab_ak_ref ?? null;
  }

  async resolveAccountOwner(
    workspaceId: string,
    accounts: readonly AccountCredentialScope[],
  ): Promise<string> {
    if (accounts.length === 0) {
      throw new Error("Account-scoped job requires at least one account");
    }
    const requested = new Map<string, AccountCredentialScope>();
    for (const account of accounts) {
      if (account.media.trim() === "" || account.accountId.trim() === "") {
        throw new Error("Account-scoped job requires media and accountId");
      }
      requested.set(JSON.stringify([account.media, account.accountId]), account);
    }
    if (requested.size !== accounts.length) {
      throw new Error("Account-scoped job contains duplicate account scope");
    }
    const result = await this.pool.query<{
      media: string;
      account_id: string;
      owner_user_id: string | null;
    }>(
      `WITH requested AS (
         SELECT media, account_id
         FROM jsonb_to_recordset($2::jsonb) AS value(media text, account_id text)
       )
       SELECT account.media, account.account_id, account.owner_user_id
       FROM requested
       JOIN accounts AS account
         ON account.workspace_id = $1
        AND account.media = requested.media
        AND account.account_id = requested.account_id`,
      [workspaceId, JSON.stringify(accounts.map((account) => ({
        media: account.media,
        account_id: account.accountId,
      })))],
    );
    if (result.rows.length !== requested.size) {
      throw new Error("One or more accounts do not belong to the requested workspace");
    }
    const owners = new Set(result.rows.map((row) => row.owner_user_id));
    if (owners.size !== 1 || owners.has(null)) {
      throw new Error("Account-scoped job requires one unambiguous credential owner");
    }
    return [...owners][0] as string;
  }
}
