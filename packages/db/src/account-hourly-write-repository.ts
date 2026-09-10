import { accountHourlyStorageBatchSchema, etlBatchAccountIdsSchema, type AccountHourlyStorageBatch } from "@ka/domain";
import type { Pool, PoolClient } from "pg";

const MAX_BYTES = 16 * 1024 * 1024;
const message = "Account hourly sample could not be stored";
function fail(): never { throw new Error(message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function serialize(value: unknown): string {
  const json = JSON.stringify(value, (_key, field: unknown) => {
    if (typeof field === "number" && !Number.isFinite(field)) fail();
    if (["bigint", "function", "symbol", "undefined"].includes(typeof field)) fail();
    return field;
  });
  if (json === undefined || Buffer.byteLength(json) >= MAX_BYTES) fail();
  return json;
}
function validateScope(input: AccountHourlyStorageBatch, row: Record<string, unknown>): void {
  const payload = object(row.payload), scope = object(row.scope), execution = object(scope.execution);
  const accounts = etlBatchAccountIdsSchema.parse(payload.accountIds), runAccounts = etlBatchAccountIdsSchema.parse(scope.accountIds);
  if (payload.workspaceId !== input.workspaceId || scope.workspaceId !== input.workspaceId || payload.media !== input.media ||
      payload.ds !== input.ds || scope.ds !== input.ds || !Number.isInteger(payload.hh) ||
      (payload.hh as number) < 0 || (payload.hh as number) > 24 || ![payload.hh, (payload.hh as number) - 1].includes(input.hh) ||
      accounts.length !== runAccounts.length || accounts.some(id => !runAccounts.includes(id)) ||
      input.accountIds.some(id => !accounts.includes(id)) || execution.version !== "etl-attempt/v1" ||
      execution.workspaceId !== input.workspaceId || execution.jobId !== input.jobId || execution.jobType !== "etl_incr" ||
      !Number.isSafeInteger(row.attempts) || (row.attempts as number) < 1 || execution.attempt !== row.attempts) fail();
}

/** Local persistence only: live job + run fencing, not browser authority. Raw
 * evidence and snapshot are one transaction; missing source rows create no zeros.
 * Each call is <=50 accounts. No network requests or queue/consumer startup.
 */
export class AccountHourlyWriteRepository {
  constructor(private readonly pool: Pool) {}
  async persist(raw: unknown): Promise<{ rawRows: number; writtenRows: number }> {
    let client: PoolClient | undefined, destroy = false;
    try {
      // Take a bounded JSON snapshot before await; caller mutation cannot change SQL.
      const input = accountHourlyStorageBatchSchema.parse(JSON.parse(serialize(raw)));
      client = await this.pool.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      const row = (await client.query(`SELECT j.attempts,j.credential_owner_user_id,
          CASE WHEN octet_length(j.payload::text)<$5 THEN j.payload ELSE NULL END payload,
          CASE WHEN octet_length(r.scope::text)<$5 THEN r.scope ELSE NULL END scope
        FROM etl_runs r JOIN jobs j ON j.id=r.job_id AND j.workspace_id=r.workspace_id
        JOIN workspaces w ON w.id=j.workspace_id AND w.kind='personal' AND w.is_active=true
        JOIN users u ON u.id=j.credential_owner_user_id AND u.workspace_id=j.workspace_id AND u.is_active=true
        WHERE r.id=$1 AND r.workspace_id=$2 AND j.id=$3 AND j.lease_token=$4
          AND r.run_kind='incr' AND r.status='running' AND j.job_type='etl_incr'
          AND j.status IN ('leased','running') AND j.lease_until>clock_timestamp()
        FOR UPDATE OF r,j FOR SHARE OF w,u`, [input.runId, input.workspaceId, input.jobId, input.leaseToken, MAX_BYTES])).rows[0];
      if (!row) fail();
      validateScope(input, row);
      const result = await writeSample(client, input, row.credential_owner_user_id as string);
      const live = await client.query(`SELECT id FROM jobs WHERE id=$1 AND workspace_id=$2 AND lease_token=$3
        AND status IN ('leased','running') AND lease_until>clock_timestamp()`, [input.jobId, input.workspaceId, input.leaseToken]);
      if (live.rowCount !== 1) fail();
      await client.query("COMMIT");
      return result;
    } catch {
      if (client) { try { await client.query("ROLLBACK"); } catch { destroy = true; } }
      throw new Error(message); // Never leak SQL, upstream bodies or credential identity.
    } finally { client?.release(destroy); }
  }
}

async function writeSample(client: PoolClient, input: AccountHourlyStorageBatch, owner: string) {
  if (input.rows.length === 0) return { rawRows: 0, writtenRows: 0 };
  const rawResult = await client.query(`INSERT INTO metrics_raw
    (workspace_id,media,account_id,ds,resource,source,request_params,payload,fetched_by_user,fetched_at)
    SELECT $1,$2,v.account_id,$3::date,'account_realtime','realtime',$4::jsonb,v.payload,$6,$7::timestamptz
    FROM jsonb_to_recordset($5::jsonb) AS v(account_id text,payload jsonb)`,
  [input.workspaceId, input.media, input.ds,
    serialize({ media: input.media, ds: input.ds.replaceAll("-", ""), hh: input.hh, accountIds: input.accountIds }),
    serialize(input.rawRows.map(row => ({ account_id: String(row.account_id), payload: row }))), owner, input.sampledAt]);
  if (rawResult.rowCount !== input.rawRows.length) fail();
  const result = await client.query(`INSERT INTO account_metrics_hourly AS h
    (workspace_id,media,account_id,ds,hh,cost,exposure,click,conversion,real_conversion,budget,last_sync_time,sampled_at,complete,source_run_id)
    SELECT $1,$2,v.account_id,$3::date,$4,v.cost,v.exposure,v.click,v.conversion,v.real_conversion,v.budget,v.last_sync_time,$6::timestamptz,v.complete,$7::bigint
    FROM jsonb_to_recordset($5::jsonb) AS v(account_id text,cost numeric,exposure bigint,click bigint,conversion bigint,
      real_conversion bigint,budget numeric,last_sync_time timestamptz,complete boolean)
    ORDER BY v.account_id COLLATE "C"
    ON CONFLICT (workspace_id,media,account_id,ds,hh) DO UPDATE SET
      cost=EXCLUDED.cost,exposure=EXCLUDED.exposure,click=EXCLUDED.click,conversion=EXCLUDED.conversion,
      real_conversion=EXCLUDED.real_conversion,budget=EXCLUDED.budget,last_sync_time=EXCLUDED.last_sync_time,
      sampled_at=EXCLUDED.sampled_at,complete=EXCLUDED.complete,source_run_id=EXCLUDED.source_run_id
    WHERE EXCLUDED.sampled_at>h.sampled_at AND EXCLUDED.last_sync_time>=h.last_sync_time`,
  [input.workspaceId, input.media, input.ds, input.hh,
    serialize(input.rows.map(row => ({ account_id: row.accountId, cost: row.cost, exposure: row.exposure, click: row.click,
      conversion: row.conversion, real_conversion: row.realConversion, budget: row.budget, last_sync_time: row.lastSyncTime, complete: row.complete }))),
    input.sampledAt, input.runId]);
  if (result.rowCount === null || result.rowCount < 0 || result.rowCount > input.rows.length) fail();
  return { rawRows: rawResult.rowCount, writtenRows: result.rowCount };
}
