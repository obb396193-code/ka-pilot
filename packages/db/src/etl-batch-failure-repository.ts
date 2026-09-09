import { etlBatchAccountIdsSchema, etlBatchFailureEvidenceSchema, etlBatchScopeSchema,
  recordEtlBatchFailureSchema, type EtlBatchFailureEvidence } from "@ka/domain";
import type { Pool, PoolClient } from "pg";

const MAX_BYTES = 16 * 1024 * 1024, MAX_FAILURES = 10_000;
const message = "ETL batch failure could not be recorded";
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}
function canonical(evidence: EtlBatchFailureEvidence): string {
  return JSON.stringify([evidence.code, evidence.resource, evidence.ds, [...evidence.accountIds].sort(), evidence.media,
    evidence.filters?.hh ?? 24, [...(evidence.filters?.adIds ?? [])].sort()]);
}

/** Additive ledger only. Runtime must not enable partial success until canonical
 * and reader missing/coverage fences consume this evidence. No media writes.
 */
export class EtlBatchFailureRepository {
  constructor(private readonly pool: Pool) {}
  async record(raw: unknown): Promise<{ recorded: boolean }> {
    let client: PoolClient | undefined, destroy = false;
    try {
      const input = recordEtlBatchFailureSchema.parse(raw);
      client = await this.pool.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='10s'");
      const row = (await client.query(`SELECT
          CASE WHEN octet_length(r.scope::text) < $5 THEN r.scope ELSE NULL END AS scope,
          j.attempts, j.job_type, j.payload->>'media' AS media, j.payload->'accountIds' AS account_ids,
          clock_timestamp() AS failed_at
        FROM etl_runs r JOIN jobs j ON j.id=r.job_id AND j.workspace_id=r.workspace_id
        WHERE r.id=$1 AND r.workspace_id=$2 AND j.id=$3 AND j.lease_token=$4
          AND j.status IN ('leased','running') AND j.lease_until > clock_timestamp()
          AND r.status='running' AND ((r.run_kind='full' AND j.job_type='etl_full') OR (r.run_kind='incr' AND j.job_type='etl_incr'))
        FOR UPDATE OF r,j`, [input.runId, input.workspaceId, input.jobId, input.leaseToken, MAX_BYTES])).rows[0];
      if (!row) throw new Error(message);
      const scope = object(row.scope), execution = object(scope.execution);
      const batch = etlBatchScopeSchema.parse(scope.batchScope);
      const parentAccounts = new Set(etlBatchAccountIdsSchema.parse(row.account_ids));
      if (scope.workspaceId !== input.workspaceId || batch.workspaceId !== input.workspaceId || batch.media !== row.media ||
        execution.version !== "etl-attempt/v1" || execution.workspaceId !== input.workspaceId || execution.jobId !== input.jobId ||
        execution.jobType !== row.job_type || !Number.isSafeInteger(row.attempts) || row.attempts < 1 || execution.attempt !== row.attempts ||
        batch.accountIds.some(id => !parentAccounts.has(id)) || input.warning.accountIds.some(id => !batch.accountIds.includes(id)) ||
        input.warning.ds < batch.dateFrom || input.warning.ds > batch.dateTo) throw new Error(message);
      const existing = scope.batchFailures === undefined ? [] : scope.batchFailures;
      if (!Array.isArray(existing) || existing.length > MAX_FAILURES) throw new Error(message);
      const entries = existing.map(value => etlBatchFailureEvidenceSchema.parse(value));
      if (new Set(entries.map(value => value.fingerprint)).size !== entries.length || entries.some(value =>
        value.media !== batch.media || value.ds < batch.dateFrom || value.ds > batch.dateTo || value.accountIds.some(id => !batch.accountIds.includes(id)))) throw new Error(message);
      if (!(row.failed_at instanceof Date) || !Number.isFinite(row.failed_at.valueOf())) throw new Error(message);
      const next = etlBatchFailureEvidenceSchema.parse({ ...input.warning, accountIds: [...input.warning.accountIds].sort(),
        media: batch.media, failedAt: row.failed_at.toISOString(),
        ...(input.filters === undefined ? {} : { filters: input.filters }) });
      const previous = entries.find(value => value.fingerprint === next.fingerprint);
      if (previous) {
        if (canonical(previous) !== canonical(next)) throw new Error(message);
        await client.query("COMMIT"); return { recorded: false };
      }
      entries.push(next);
      if (entries.length > MAX_FAILURES || Buffer.byteLength(JSON.stringify({ ...scope, batchFailures: entries })) >= MAX_BYTES) throw new Error(message);
      const result = await client.query(`UPDATE etl_runs SET scope=jsonb_set(scope,'{batchFailures}',$3::jsonb,true)
        WHERE id=$1 AND workspace_id=$2 AND status='running'
          AND octet_length(jsonb_set(scope,'{batchFailures}',$3::jsonb,true)::text) < $4
          AND EXISTS(SELECT 1 FROM jobs j WHERE j.id=$5 AND j.workspace_id=$2 AND j.lease_token=$6
            AND j.status IN ('leased','running') AND j.lease_until > clock_timestamp())`,
        [input.runId, input.workspaceId, JSON.stringify(entries), MAX_BYTES, input.jobId, input.leaseToken]);
      if (result.rowCount !== 1) throw new Error(message);
      await client.query("COMMIT"); return { recorded: true };
    } catch {
      if (client) { try { await client.query("ROLLBACK"); } catch { destroy = true; } }
      throw new Error(message);
    } finally { client?.release(destroy); }
  }
}
