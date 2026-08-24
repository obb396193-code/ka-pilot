import type { Pool } from "pg";

export interface AccountCredentialScope {
  media: string;
  accountId: string;
}

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
