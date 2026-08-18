import type { Pool } from "pg";

export interface GatewayIdentity {
  userId: string;
  qihangUserId: string | null;
  hasMulticaCredential: boolean;
}

export class GatewayRepository {
  constructor(private readonly pool: Pool) {}

  async claimInbound(
    provider: string,
    externalEventId: string,
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO inbound_events
         (provider, external_event_id, kind, payload, processed)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT (external_event_id) DO NOTHING`,
      [provider, externalEventId, kind, payload],
    );
    return result.rowCount === 1;
  }

  async markInboundProcessed(externalEventId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE inbound_events SET processed = true
       WHERE external_event_id = $1 AND processed = false`,
      [externalEventId],
    );
    if (result.rowCount !== 1) {
      throw new Error(`Inbound event ${externalEventId} is missing or already processed`);
    }
  }

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
