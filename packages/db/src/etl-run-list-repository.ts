import { approvedWorkspaceAuthContextSchema, etlRunListDataSchema, etlRunListRequestSchema,
  etlRunListRowSchema, type EtlRunListData, type EtlRunListRow } from "@ka/domain";
import type { Pool } from "pg";
import { withSemanticReadSnapshot } from "./semantic-read-snapshot.js";

export class EtlRunListError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_REQUEST" | "UPSTREAM_INVALID_RESPONSE" | "SOURCE_TRUNCATED" | "SOURCE_UNAVAILABLE" | "UPSTREAM_TIMEOUT") {
    super(`ETL run list: ${code}`);
  }
}
export interface EtlRunListSnapshot { workspaceId: string; data: EtlRunListData; dataAsOf: string | null }
const invalid = (): never => { throw new EtlRunListError("UPSTREAM_INVALID_RESPONSE"); };
const MAX_BYTES = 16 * 1024 * 1024;
const jobTypes: Record<string, EtlRunListRow["jobType"]> = {
  full: "etl_full", incr: "etl_incr", backfill_coordinator: "backfill_historical", backfill_day: "backfill_day",
  canonical: "canonical_merge", quality: "data_quality_check",
};
function stamp(value: unknown): string | null {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.valueOf())) return invalid();
  return value.toISOString();
}
function count(value: unknown): number {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) return invalid();
  return Number(value);
}
function mapRow(row: Record<string, unknown>, workspaceId: string): EtlRunListRow {
  if (row.workspace_id !== workspaceId || row.scope_valid !== true || row.warnings_valid !== true ||
    typeof row.run_kind !== "string" || !Object.hasOwn(jobTypes, row.run_kind)) return invalid();
  const jobType = jobTypes[row.run_kind]!;
  if (typeof row.has_execution !== "boolean" || !Array.isArray(row.warnings)) return invalid();
  if (row.has_execution && (row.execution_version !== "etl-attempt/v1" || row.execution_workspace !== workspaceId ||
    row.execution_job !== row.job_id || row.execution_type !== jobType || row.execution_attempt === null)) return invalid();
  const warnings = row.has_execution ? row.warnings : [...row.warnings, { code: "LEGACY_NO_ATTEMPT" }];
  // failRun does not persist progressive counts; its initial zero is not observed success.
  const rows = row.status !== "done" || row.run_kind === "quality" ? null : row.run_kind === "canonical"
    ? { raw: null, canonical: row.rows_ingested } : { raw: row.rows_ingested, canonical: null };
  const parsed = etlRunListRowSchema.safeParse({ runId: row.id, jobId: row.job_id, jobType,
    attempt: row.has_execution ? row.execution_attempt : null, status: row.status,
    businessDate: row.business_date, startedAt: stamp(row.started_at), finishedAt: stamp(row.finished_at), rows, warnings,
    ...(row.step_failed === null ? {} : { failedStage: row.step_failed }) });
  if (!parsed.success) return invalid();
  return parsed.data;
}

/** Governance metadata only; auth must be resolved by server Session. No browser scope or credentials. */
export class EtlRunListRepository {
  constructor(private readonly pool: Pool) {}
  async list(rawAuth: unknown, rawRequest: unknown): Promise<EtlRunListSnapshot> {
    const auth = approvedWorkspaceAuthContextSchema.safeParse(rawAuth);
    if (!auth.success || auth.data.role !== "admin") throw new EtlRunListError("FORBIDDEN");
    const request = etlRunListRequestSchema.safeParse(rawRequest);
    if (!request.success) throw new EtlRunListError("INVALID_REQUEST");
    const { workspaceId } = auth.data, { page, pageSize } = request.data;
    try {
      return await withSemanticReadSnapshot(this.pool, async client => {
        const summary = (await client.query(`/* etl-run-page-summary */
          SELECT count(*)::text AS total, max(finished_at) AS data_as_of
          FROM etl_runs WHERE workspace_id=$1`, [workspaceId])).rows;
        if (summary.length !== 1) return invalid();
        const total = count(summary[0].total), dataAsOf = stamp(summary[0].data_as_of);
        const rows = (await client.query(`/* etl-run-page-items */
          WITH page AS MATERIALIZED (
            SELECT id,workspace_id,job_id,run_kind,scope,started_at,finished_at,status,rows_ingested,step_failed
            FROM etl_runs WHERE workspace_id=$1 ORDER BY started_at DESC,id DESC LIMIT $2 OFFSET $3
          ), bounded AS (
            SELECT page.*, sum(octet_length(COALESCE(scope::text,'')) + octet_length(COALESCE(step_failed,'')) + 512) OVER () >= $4 AS oversized
            FROM page
          ), safe AS (
            SELECT id,workspace_id,job_id,run_kind,started_at,finished_at,status,rows_ingested,oversized,
              CASE WHEN NOT oversized THEN scope END AS scope,
              CASE WHEN NOT oversized THEN step_failed END AS step_failed
            FROM bounded
          )
          SELECT id::text,id AS sort_id,workspace_id,job_id,run_kind,started_at,finished_at,status,rows_ingested,step_failed,oversized,
            (scope IS NULL OR jsonb_typeof(scope)='object') AS scope_valid,
            COALESCE(scope ? 'execution',false) AS has_execution,
            scope->'execution'->>'version' AS execution_version,scope->'execution'->>'workspaceId' AS execution_workspace,
            scope->'execution'->>'jobId' AS execution_job,scope->'execution'->>'jobType' AS execution_type,
            scope->'execution'->'attempt' AS execution_attempt,
            CASE run_kind WHEN 'full' THEN scope->>'asOfDate' WHEN 'incr' THEN scope->>'ds'
              WHEN 'canonical' THEN scope->>'reportDate' ELSE scope->>'dateTo' END AS business_date,
            (NOT COALESCE(scope ? 'batchFailures',false) OR (jsonb_typeof(scope->'batchFailures')='array'
              AND jsonb_array_length(CASE WHEN jsonb_typeof(scope->'batchFailures')='array' THEN scope->'batchFailures' ELSE '[]'::jsonb END)<=10000)) AS warnings_valid,
            (SELECT COALESCE(jsonb_agg(jsonb_build_object('code',failure->'code','resource',failure->'resource','ds',failure->'ds',
              'accountIds',failure->'accountIds','fingerprint',failure->'fingerprint') ORDER BY ordinal),'[]'::jsonb)
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(scope->'batchFailures')='array' THEN scope->'batchFailures' ELSE '[]'::jsonb END)
                WITH ORDINALITY AS entries(failure,ordinal)) AS warnings
          FROM safe ORDER BY started_at DESC,sort_id DESC`, [workspaceId, pageSize, (page - 1) * pageSize, MAX_BYTES])).rows;
        if (rows.some(row => row.oversized === true)) throw new EtlRunListError("SOURCE_TRUNCATED");
        if (rows.some(row => row.oversized !== false)) return invalid();
        const parsed = etlRunListDataSchema.safeParse({ items: rows.map(row => mapRow(row, workspaceId)), total, page, pageSize });
        if (!parsed.success) return invalid();
        // Projection expansion can exceed storage size (repeated JSON key names); exact boundary fails closed.
        if (Buffer.byteLength(JSON.stringify(parsed.data)) >= MAX_BYTES) throw new EtlRunListError("SOURCE_TRUNCATED");
        return { workspaceId, data: parsed.data, dataAsOf };
      });
    } catch (error) {
      if (error instanceof EtlRunListError) throw error;
      if (error && typeof error === "object" && "code" in error && error.code === "57014") throw new EtlRunListError("UPSTREAM_TIMEOUT");
      throw new EtlRunListError("SOURCE_UNAVAILABLE");
    }
  }
}
