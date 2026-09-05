import type { Pool } from "pg";

export interface InboundLease {
  id: string;
  workspaceId: string;
  provider: string;
  externalEventId: string;
  attempts: number;
  payload: Record<string, unknown>;
}
export type InboundFailureCode = "PROCESSING_FAILED" | "INVALID_PAYLOAD";

function boundedJson(value: Record<string, unknown>): string {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) >= 262_144) throw new Error("Inbound payload exceeds limit");
  return json;
}
function seconds(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 3600) throw new Error("Invalid inbound duration");
}

/** attempts is the fencing generation; exhausted failures carry the frozen dead sentinel. */
export class InboundEventRepository {
  constructor(protected readonly pool: Pool) {}

  async receiveInbound(workspaceId: string, provider: string, externalEventId: string,
    kind: string, payload: Record<string, unknown>): Promise<boolean> {
    const inserted = await this.pool.query(
      `INSERT INTO inbound_events (workspace_id,provider,external_event_id,kind,payload,processed)
       VALUES ($1,$2,$3,$4,$5,false) ON CONFLICT (external_event_id) DO NOTHING`,
      [workspaceId, provider, externalEventId, kind, boundedJson(payload)],
    );
    if (inserted.rowCount === 1) return true;
    // The frozen key is global. Never ACK an event belonging to another workspace/provider.
    const existing = await this.pool.query(
      `SELECT 1 FROM inbound_events WHERE workspace_id=$1 AND provider=$2 AND external_event_id=$3 AND kind=$4`,
      [workspaceId, provider, externalEventId, kind],
    );
    if (existing.rowCount !== 1) throw new Error("Inbound event scope collision");
    return false;
  }

  async leaseInbound(workspaceId: string, provider: string, leaseSeconds: number): Promise<InboundLease | null> {
    seconds(leaseSeconds);
    if (leaseSeconds === 0) throw new Error("Invalid inbound lease duration");
    await this.pool.query(
      `UPDATE inbound_events SET last_error='ATTEMPTS_EXHAUSTED'
       WHERE workspace_id=$1 AND provider=$2 AND kind='robot_message' AND processed=false AND attempts>=max_attempts
         AND (lease_until IS NULL OR lease_until<=clock_timestamp())
         AND last_error IS DISTINCT FROM 'ATTEMPTS_EXHAUSTED'`, [workspaceId, provider],
    );
    const result = await this.pool.query(
      `WITH candidate AS (
         SELECT id FROM inbound_events WHERE workspace_id=$1 AND provider=$2 AND kind='robot_message' AND processed=false
           AND attempts>=0 AND attempts<max_attempts
           AND (lease_until IS NULL OR lease_until<=clock_timestamp())
         ORDER BY received_at,id FOR UPDATE SKIP LOCKED LIMIT 1
       ) UPDATE inbound_events e SET attempts=e.attempts+1,
           lease_until=clock_timestamp()+make_interval(secs=>$3)
         FROM candidate WHERE e.id=candidate.id
         RETURNING e.id,e.workspace_id,e.provider,e.external_event_id,e.attempts,e.payload`,
      [workspaceId, provider, leaseSeconds],
    );
    const row = result.rows[0];
    return row ? { id: row.id, workspaceId: row.workspace_id, provider: row.provider,
      externalEventId: row.external_event_id, attempts: row.attempts, payload: row.payload } : null;
  }

  private async mutate(lease: InboundLease, sql: string, value: unknown = null): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const lock = await client.query(
        `SELECT id FROM inbound_events WHERE id=$1 AND workspace_id=$2 AND provider=$3
          AND external_event_id=$4 AND attempts=$5 AND processed=false FOR UPDATE`,
        [lease.id, lease.workspaceId, lease.provider, lease.externalEventId, lease.attempts],
      );
      // Check clock AFTER obtaining row lock, never statement_timestamp from before lock wait.
      const live = await client.query(
        "SELECT 1 FROM inbound_events WHERE id=$1 AND lease_until>clock_timestamp()", [lease.id],
      );
      if (lock.rowCount !== 1 || live.rowCount !== 1) throw new Error("Inbound lease lost");
      await client.query(sql, [lease.id, value]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async checkpointInbound(lease: InboundLease, checkpoint: Record<string, unknown>): Promise<void> {
    await this.mutate(lease,
      "UPDATE inbound_events SET payload=jsonb_set(payload,'{checkpoint}',$2::jsonb) WHERE id=$1",
      boundedJson(checkpoint));
  }
  async renewInbound(lease: InboundLease, leaseSeconds: number): Promise<void> {
    seconds(leaseSeconds);
    if (leaseSeconds === 0) throw new Error("Invalid inbound lease duration");
    await this.mutate(lease,
      "UPDATE inbound_events SET lease_until=clock_timestamp()+make_interval(secs=>$2) WHERE id=$1", leaseSeconds);
  }
  async completeInbound(lease: InboundLease): Promise<void> {
    await this.mutate(lease,
      "UPDATE inbound_events SET processed=true,processed_at=clock_timestamp(),lease_until=NULL,last_error=$2 WHERE id=$1");
  }
  async failInbound(lease: InboundLease, code: InboundFailureCode, retrySeconds: number): Promise<void> {
    if (code !== "PROCESSING_FAILED" && code !== "INVALID_PAYLOAD") throw new Error("Invalid inbound failure code");
    seconds(retrySeconds);
    await this.mutate(lease,
      `UPDATE inbound_events SET last_error=CASE WHEN attempts>=max_attempts
         THEN 'ATTEMPTS_EXHAUSTED' ELSE $2::jsonb->>'code' END,
       lease_until=clock_timestamp()+make_interval(secs=>CASE WHEN attempts>=max_attempts
         THEN 0 ELSE ($2::jsonb->>'delay')::int END) WHERE id=$1`,
      JSON.stringify({ code, delay: retrySeconds }));
  }
}
