import { InboundEventRepository } from "./inbound-event-repository.js";

export interface GatewayIdentity {
  userId: string;
  qihangUserId: string | null;
  hasMulticaCredential: boolean;
}

export class GatewayRepository extends InboundEventRepository {
  async resolveIdentity(
    workspaceId: string,
    provider: string,
    externalId: string,
  ): Promise<GatewayIdentity | null> {
    const result = await this.pool.query<{
      user_id: string;
      qihang_user_id: string | null;
      multica_pat_ref: string | null;
    }>(
      `SELECT identity.user_id, account.qihang_user_id, account.multica_pat_ref
       FROM identity_mappings AS identity
       JOIN users AS account
         ON account.id = identity.user_id
        AND account.workspace_id = identity.workspace_id
        AND account.is_active = true
       WHERE identity.workspace_id = $1
         AND identity.provider = $2
         AND identity.external_id = $3`,
      [workspaceId, provider, externalId],
    );
    const row = result.rows[0];
    return row
      ? {
          userId: row.user_id,
          qihangUserId: row.qihang_user_id,
          hasMulticaCredential: row.multica_pat_ref !== null,
        }
      : null;
  }
}
