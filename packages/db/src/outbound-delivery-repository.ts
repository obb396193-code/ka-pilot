import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { deliveryOutcomeSchema, nextOutboundDeliveryState, outboundInstantSchema,
  prepareOutboundBusinessIdentity, type OutboundDeliveryState, outboundWorkspaceSchema,
  durableOutboundClaimSchema as claimSchema, outboundStoredRowSchema as dbRowSchema,
  type DurableOutboundClaim, type OutboundStoredRow as DeliveryRow } from "@ka/domain";
const fields = `o.id,o.workspace_id,o.channel,
  CASE WHEN octet_length(o.target)<=8192 THEN o.target ELSE NULL END AS target,
  CASE WHEN octet_length(o.kind)<=8192 THEN o.kind ELSE NULL END AS kind,o.status,o.attempts,o.consecutive_unknown,
  o.dedupe_key,o.sent_at,o.created_at,clock_timestamp() AS db_now,
  CASE WHEN j.payload->'businessDate' IS NULL OR j.payload->'businessDate'='null'::jsonb THEN NULL
    WHEN octet_length((j.payload->'businessDate')::text)<=12 THEN j.payload->'businessDate' ELSE '"INVALID_DATE"'::jsonb END AS job_date,
  CASE WHEN r.run_date IS NULL OR r.run_date='null'::jsonb THEN NULL
    WHEN octet_length(r.run_date::text)<=12 THEN r.run_date ELSE '"INVALID_DATE"'::jsonb END AS run_date`;
// Date hints are joined within the same tenant. No casts of arbitrary payload IDs.
const joins = `LEFT JOIN jobs j ON j.workspace_id=o.workspace_id AND j.id::text=o.payload->>'jobId'
  LEFT JOIN LATERAL (SELECT CASE WHEN scope ? 'businessDate' THEN scope->'businessDate'
    WHEN run_kind='full' THEN scope->'asOfDate'
    WHEN run_kind IN ('incr','quality','backfill_day') THEN scope->'ds' ELSE NULL END AS run_date
    FROM etl_runs WHERE workspace_id=o.workspace_id AND job_id::text=o.payload->>'jobId'
      AND started_at<=o.created_at ORDER BY id DESC LIMIT 1) r ON true`;
// Conservative bound includes both opaque strings and all fixed metadata, not
// just JSON payload. Suppress oversized payloads in SQL before PG serializes them.
const rowBytes = `(octet_length(o.payload::text)::bigint+octet_length(o.target)+octet_length(o.kind)+1024)`;

function businessKey(row: DeliveryRow): string {
  return row.dedupe_key ?? prepareOutboundBusinessIdentity({ workspaceId: row.workspace_id, kind: row.kind,
    target: row.target, payload: row.payload, createdAt: row.created_at.toISOString(),
    jobBusinessDate: row.job_date ?? null, runBusinessDate: row.run_date ?? null }).dedupeKey;
}

/** Server-only bounded repository. Caller must additionally hold workerOnceLock
 * for the entire pass; HTTP transport never runs in these short transactions. */
export class OutboundDeliveryRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect(); await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='2s'");
      const result = await action(client); await client.query("COMMIT"); return result;
    } catch {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      throw new Error("OUTBOUND_STORE_FAILED");
    } finally { client?.release(); }
  }

  async claim(workspaceId: string): Promise<DurableOutboundClaim | { maintenanceLimit: true } | null> {
    return this.transaction(async client => {
      const ws = outboundWorkspaceSchema.parse(workspaceId);
      for (let scanned = 0; scanned < 100; scanned++) {
        const result = await client.query(`SELECT ${fields},
          CASE WHEN ${rowBytes}<16777216 THEN o.payload ELSE NULL END AS payload FROM outbound_messages o ${joins}
          WHERE o.workspace_id=$1 AND o.channel='dingtalk' AND
          ((o.status='queued' AND COALESCE(o.run_after,o.created_at)<=clock_timestamp()) OR
           (o.status='sending' AND (o.lease_until IS NULL OR o.lease_until<=clock_timestamp())))
          ORDER BY COALESCE(o.run_after,o.created_at),o.id FOR UPDATE OF o SKIP LOCKED LIMIT 1`, [ws]);
        if (result.rows.length === 0) return null;
        const raw = result.rows[0];
        let row: DeliveryRow, key: string;
        try {
          row = dbRowSchema.parse(raw); key = businessKey(row);
          if(row.sent_at !== null || row.consecutive_unknown>row.attempts ||
            (row.status==='sending' && (row.attempts<1 || row.attempts>5 || row.consecutive_unknown>=2))) throw new Error();
        }
        catch {
          await client.query(`UPDATE outbound_messages SET status='failed',fail_reason='UNSUPPORTED_MESSAGE',
            lease_token=NULL,lease_until=NULL,claimed_at=NULL,run_after=NULL WHERE workspace_id=$1 AND id=$2`, [ws, raw.id]);
          continue;
        }
        if (row.attempts >= 5 && row.status !== "sending") {
          await client.query("UPDATE outbound_messages SET status='failed',fail_reason='ATTEMPTS_EXHAUSTED',run_after=NULL WHERE workspace_id=$1 AND id=$2", [ws,row.id]); continue;
        }
        if (row.status === "sending") {
          const state = nextOutboundDeliveryState({ attempts: row.attempts,
            consecutiveUnknown: row.consecutive_unknown, observedAt: row.db_now.toISOString() }, { kind: "unknown" });
          await this.writeState(client, row.id, ws, state); continue;
        }
        if (row.consecutive_unknown >= 2) {
          await client.query("UPDATE outbound_messages SET status='failed',fail_reason='UNKNOWN_OUTCOME',run_after=NULL WHERE workspace_id=$1 AND id=$2", [ws,row.id]); continue;
        }
        const leaseToken = randomUUID();
        await client.query(`UPDATE outbound_messages SET status='sending',attempts=attempts+1,dedupe_key=$3,
          lease_token=$4,claimed_at=clock_timestamp(),lease_until=clock_timestamp()+interval '60 seconds',
          run_after=NULL,fail_reason=NULL WHERE workspace_id=$1 AND id=$2`, [ws,row.id,key,leaseToken]);
        return claimSchema.parse({ id: row.id, workspaceId: ws, channel: "dingtalk", leaseToken,
          target: row.target, kind: row.kind, payload: row.payload, dedupeKey: key,
          attempts: row.attempts+1, consecutiveUnknown: row.consecutive_unknown, sentAt: null });
      }
      return { maintenanceLimit: true };
    });
  }

  private async owned(client: PoolClient, input: DurableOutboundClaim): Promise<DurableOutboundClaim> {
    const c = claimSchema.parse(input);
    const result = await client.query(`SELECT id FROM outbound_messages WHERE workspace_id=$1 AND id=$2
      AND status='sending' AND lease_token=$3 AND lease_until>clock_timestamp() AND channel='dingtalk'
      AND dedupe_key=$4 AND attempts=$5 AND consecutive_unknown=$6 AND kind=$7 AND target=$8 FOR UPDATE`,
    [c.workspaceId,c.id,c.leaseToken,c.dedupeKey,c.attempts,c.consecutiveUnknown,c.kind,c.target]);
    if(result.rowCount !== 1) throw new Error("Lost outbound lease");
    return c;
  }

  private async recent(client: PoolClient, c: DurableOutboundClaim) {
    const result = await client.query(`SELECT ${fields},COUNT(*) OVER() AS total,
      CASE WHEN SUM(${rowBytes}) OVER()<16777216 THEN o.payload ELSE NULL END AS payload,
      SUM(${rowBytes}) OVER() AS total_bytes
      FROM outbound_messages o ${joins} WHERE o.workspace_id=$1 AND o.channel='dingtalk' AND o.status='sent'
      AND o.sent_at BETWEEN clock_timestamp()-interval '24 hours' AND clock_timestamp()
      AND o.kind=$2 AND o.target=$3 AND (o.dedupe_key=$4 OR o.dedupe_key IS NULL)
      ORDER BY o.sent_at,o.id LIMIT 1001`, [c.workspaceId,c.kind,c.target,c.dedupeKey]);
    if (result.rows.length>1000 || (result.rows[0] && Number(result.rows[0].total_bytes)>=16777216)) throw new Error("Outbound evidence overflow");
    for (const raw of result.rows) {
      const row = dbRowSchema.parse(raw);
      if (businessKey(row)===c.dedupeKey) return row;
    }
    return null;
  }

  async findRecentSent(input: DurableOutboundClaim, now: string): Promise<unknown> {
    return this.transaction(async client => {
      outboundInstantSchema.parse(now);
      const c = await this.owned(client,input), row = await this.recent(client,c);
      return row ? { workspaceId: c.workspaceId, dedupeKey: c.dedupeKey, sentAt: row.sent_at!.toISOString() } : null;
    });
  }

  async markDeduplicated(input: DurableOutboundClaim): Promise<void> {
    return this.transaction(async client => {
      const c = await this.owned(client,input), row = await this.recent(client,c);
      if (!row) throw new Error("No sent evidence");
      const updated = await client.query(`UPDATE outbound_messages SET status='deduplicated',dedupe_of=$3,sent_at=NULL,fail_reason=NULL,
        lease_token=NULL,claimed_at=NULL,lease_until=NULL,run_after=NULL WHERE workspace_id=$1 AND id=$2
        AND status='sending' AND lease_token=$4 AND lease_until>clock_timestamp()
        AND EXISTS(SELECT 1 FROM outbound_messages evidence WHERE evidence.workspace_id=$1 AND evidence.id=$3
          AND evidence.status='sent' AND evidence.sent_at BETWEEN clock_timestamp()-interval '24 hours' AND clock_timestamp())`,
      [c.workspaceId,c.id,row.id,c.leaseToken]);
      if(updated.rowCount !== 1) throw new Error("Lost outbound evidence or lease");
    });
  }

  async finish(input: DurableOutboundClaim, state: OutboundDeliveryState): Promise<void> {
    return this.transaction(async client => {
      const c = await this.owned(client,input);
      const observedAt = (await client.query("SELECT clock_timestamp() AS at")).rows[0].at.toISOString();
      const outcome = state.status === "sent" ? { kind: "acknowledged" } :
        state.failReason === "UNKNOWN_OUTCOME" || (state.failReason === "ATTEMPTS_EXHAUSTED" && state.consecutiveUnknown===1) ? { kind: "unknown" } :
        ["REMOTE_RATE_LIMITED","REMOTE_UNAVAILABLE","ATTEMPTS_EXHAUSTED"].includes(state.failReason ?? "") ?
          { kind: "retryable_failure", reason: state.failReason === "REMOTE_RATE_LIMITED" ? state.failReason : "REMOTE_UNAVAILABLE" } :
          { kind: "permanent_failure", reason: state.failReason };
      const verified = nextOutboundDeliveryState({ attempts: c.attempts, consecutiveUnknown: c.consecutiveUnknown, observedAt }, deliveryOutcomeSchema.parse(outcome));
      if(state.status!==verified.status || state.failReason!==verified.failReason || state.consecutiveUnknown!==verified.consecutiveUnknown ||
        (state.sentAt===null)!==(verified.sentAt===null) || (state.runAfter===null)!==(verified.runAfter===null)) throw new Error("Invalid delivery state");
      if(state.sentAt!==null) outboundInstantSchema.parse(state.sentAt);
      if(state.runAfter!==null) outboundInstantSchema.parse(state.runAfter);
      await this.writeState(client,c.id,c.workspaceId,verified,c.leaseToken);
    });
  }

  private async writeState(client: PoolClient, id: string, workspace: string, state: OutboundDeliveryState, leaseToken: string | null = null): Promise<void> {
    const updated = await client.query(`UPDATE outbound_messages SET status=$3,sent_at=$4,run_after=$5,consecutive_unknown=$6,fail_reason=$7,
      lease_token=NULL,claimed_at=NULL,lease_until=NULL WHERE workspace_id=$1 AND id=$2
      AND ($8::uuid IS NULL OR (status='sending' AND lease_token=$8 AND lease_until>clock_timestamp()))`,
    [workspace,id,state.status,state.sentAt,state.runAfter,state.consecutiveUnknown,state.failReason,leaseToken]);
    if(updated.rowCount !== 1) throw new Error("Lost outbound lease");
  }
}
