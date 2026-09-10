import { approvedWorkspaceAuthContextSchema, etlRunIdSchema, etlRunRerunDataSchema,
  type EtlRunRerunData } from "@ka/domain";
import type { Pool } from "pg";
import { JobRepository } from "./job-repository.js";
import { lockWorkspaceMembership, R014RepositoryError } from "./r014/workspace-authority.js";

export class EtlRunRerunError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_REQUEST" | "NOT_FOUND" | "INVALID_STATE" | "CONFLICT" |
    "UPSTREAM_INVALID_RESPONSE" | "SOURCE_TRUNCATED" | "SOURCE_UNAVAILABLE" | "UPSTREAM_TIMEOUT", readonly jobId?: string) {
    super(`ETL rerun: ${code}`);
  }
}
const types: Record<string, string> = { full: "etl_full", incr: "etl_incr", backfill_coordinator: "backfill_historical",
  backfill_day: "backfill_day", canonical: "canonical_merge", quality: "data_quality_check" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function invalid(): never { throw new EtlRunRerunError("UPSTREAM_INVALID_RESPONSE"); }
const MAX_BYTES = 16 * 1024 * 1024;

/** Queue only; never consumes a job, substitutes credentials or mutates the source run.
 * Caller supplies server Session context. Live membership and the source row are
 * locked in READ COMMITTED so a waiting duplicate sees the preceding audit commit.
 */
export class EtlRunRerunRepository {
  constructor(private readonly pool: Pool) {}

  async rerun(rawAuth: unknown, rawId: unknown): Promise<{ workspaceId: string; data: EtlRunRerunData }> {
    const approved = approvedWorkspaceAuthContextSchema.safeParse(rawAuth), id = etlRunIdSchema.safeParse(rawId);
    if (!approved.success || approved.data.role !== "admin") throw new EtlRunRerunError("FORBIDDEN");
    if (!id.success) throw new EtlRunRerunError("INVALID_REQUEST");
    const auth = approved.data, sourceRunId = id.data;
    const client = await this.pool.connect().catch(() => { throw new EtlRunRerunError("SOURCE_UNAVAILABLE"); });
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await client.query("SET LOCAL statement_timeout='10s'");
      await client.query("SET LOCAL lock_timeout='3s'");
      await lockWorkspaceMembership(client, auth);
      const rows = (await client.query(`/* etl-rerun-source */
        SELECT r.id::text AS run_id,r.workspace_id AS run_workspace,r.status AS run_status,r.run_kind,
          j.id AS job_id,j.workspace_id,j.job_type,j.status,j.credential_owner_user_id,j.priority,j.max_attempts,
          octet_length(j.payload::text) AS payload_bytes,
          CASE WHEN octet_length(j.payload::text)<$3 THEN j.payload END AS payload
        FROM etl_runs r JOIN jobs j ON j.id=r.job_id
        WHERE r.workspace_id=$1 AND r.id=$2::bigint FOR UPDATE OF r,j`, [auth.workspaceId, sourceRunId, MAX_BYTES])).rows;
      if (rows.length === 0) throw new EtlRunRerunError("NOT_FOUND");
      if (rows.length !== 1) return invalid();
      const source = rows[0];
      if (source.run_id !== sourceRunId || source.run_workspace !== auth.workspaceId || source.workspace_id !== auth.workspaceId ||
        !isUuid(source.job_id) || typeof source.run_kind !== "string" || !Object.hasOwn(types, source.run_kind) ||
        types[source.run_kind] !== source.job_type) return invalid();
      if (!Number.isSafeInteger(source.payload_bytes) || source.payload_bytes < 1) return invalid();
      if (source.payload_bytes >= MAX_BYTES) throw new EtlRunRerunError("SOURCE_TRUNCATED");
      if (!record(source.payload) || source.payload.workspaceId !== auth.workspaceId ||
        !Number.isInteger(source.priority) || !Number.isInteger(source.max_attempts) || source.max_attempts < 1 ||
        !(source.credential_owner_user_id === null || isUuid(source.credential_owner_user_id))) return invalid();
      if (!["done", "failed", "blocked_auth"].includes(source.status) || !["done", "failed"].includes(source.run_status))
        throw new EtlRunRerunError("INVALID_STATE");
      // The payload remains byte-for-byte JSON-equivalent. Only check explicit
      // identity bindings; never replace its scope with the clicking admin's.
      if (Object.hasOwn(source.payload, "credentialOwnerUserId") && source.payload.credentialOwnerUserId !== source.credential_owner_user_id) return invalid();
      if (Object.hasOwn(source.payload, "authorizationSnapshot") && (!record(source.payload.authorizationSnapshot) ||
        source.payload.authorizationSnapshot.workspaceId !== auth.workspaceId ||
        source.payload.authorizationSnapshot.userId !== source.credential_owner_user_id)) return invalid();
      const actors = [source.credential_owner_user_id, source.payload.initiatorUserId].filter(value => value !== undefined && value !== null);
      if (actors.some(value => !isUuid(value))) return invalid();
      if (actors.length > 0) {
        const unique = [...new Set(actors)];
        const owners = (await client.query("SELECT id FROM users WHERE workspace_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE", [auth.workspaceId, unique])).rows;
        if (owners.length !== unique.length || owners.some(row => !unique.includes(row.id))) return invalid();
      }
      const active = (await client.query(`/* etl-rerun-active */
        SELECT j.id,j.workspace_id,j.job_type,a.detail
        FROM audit_log a JOIN jobs j ON j.id::text=a.detail->>'jobId'
        WHERE a.workspace_id=$1 AND a.action='etl_run.rerun' AND a.object_type='etl_run' AND a.object_id=$2
          AND j.status IN ('queued','leased','running') ORDER BY a.id DESC LIMIT 2 FOR SHARE OF j`, [auth.workspaceId, sourceRunId])).rows;
      if (active.length > 1) return invalid();
      if (active.length === 1) {
        const existing = active[0];
        if (!isUuid(existing.id) || existing.workspace_id !== auth.workspaceId || existing.job_type !== source.job_type ||
          !record(existing.detail) || Object.keys(existing.detail).length !== 2 || existing.detail.sourceJobId !== source.job_id ||
          existing.detail.jobId !== existing.id) return invalid();
        throw new EtlRunRerunError("CONFLICT", existing.id);
      }
      const jobId = await new JobRepository(this.pool).enqueue({ workspaceId: auth.workspaceId, jobType: source.job_type,
        payload: source.payload, credentialOwnerUserId: source.credential_owner_user_id,
        priority: source.priority, maxAttempts: source.max_attempts }, client);
      const data = etlRunRerunDataSchema.safeParse({ jobId, sourceRunId });
      if (!data.success || jobId === source.job_id) return invalid();
      await client.query(`/* etl-rerun-audit */
        INSERT INTO audit_log(workspace_id,user_id,action,object_type,object_id,detail)
        VALUES($1,$2,'etl_run.rerun','etl_run',$3,$4)`,
      [auth.workspaceId, auth.userId, sourceRunId, { sourceJobId: source.job_id, jobId }]);
      await client.query("COMMIT");
      return { workspaceId: auth.workspaceId, data: data.data };
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* Only the typed safe error leaves the repository. */ }
      if (error instanceof EtlRunRerunError) throw error;
      if (error instanceof R014RepositoryError) throw new EtlRunRerunError("FORBIDDEN");
      if (record(error) && (error.code === "57014" || error.code === "55P03")) throw new EtlRunRerunError("UPSTREAM_TIMEOUT");
      throw new EtlRunRerunError("SOURCE_UNAVAILABLE");
    } finally { client.release(); }
  }
}
