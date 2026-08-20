import type { Pool } from "pg";

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
    accountIds: readonly string[],
  ): Promise<string> {
    if (accountIds.length === 0) {
      throw new Error("Account-scoped job requires at least one account");
    }
    const result = await this.pool.query<{ account_id: string; owner_user_id: string | null }>(
      `SELECT account_id, owner_user_id
       FROM accounts
       WHERE workspace_id = $1 AND account_id = ANY($2::text[])`,
      [workspaceId, accountIds],
    );
    if (result.rows.length !== new Set(accountIds).size) {
      throw new Error("One or more accounts do not belong to the requested workspace");
    }
    const owners = new Set(result.rows.map((row) => row.owner_user_id));
    if (owners.size !== 1 || owners.has(null)) {
      throw new Error("Account-scoped job requires one unambiguous credential owner");
    }
    return [...owners][0] as string;
  }
}
