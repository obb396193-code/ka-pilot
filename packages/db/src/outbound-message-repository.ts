import type { Pool } from "pg";

export interface NewOutboundMessage {
  workspaceId: string | null;
  channel: string;
  target: string;
  kind: string;
  payload: Record<string, unknown>;
}

export class OutboundMessageRepository {
  constructor(private readonly pool: Pool) {}

  async enqueue(message: NewOutboundMessage): Promise<void> {
    await this.pool.query(
      `INSERT INTO outbound_messages
         (workspace_id, channel, target, kind, payload, status, attempts)
       VALUES ($1, $2, $3, $4, $5, 'queued', 0)`,
      [
        message.workspaceId,
        message.channel,
        message.target,
        message.kind,
        message.payload,
      ],
    );
  }
}
