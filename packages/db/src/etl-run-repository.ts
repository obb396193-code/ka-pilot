import type { Pool } from "pg";

export class EtlRunRepository {
  constructor(private readonly pool: Pool) {}

  async startRun(
    jobId: string,
    runKind: "full" | "incr" | "backfill_coordinator" | "backfill_day" | "canonical" | "quality",
    scope: Record<string, unknown>,
  ): Promise<number> {
    const workspaceId =
      typeof scope.workspaceId === "string" ? scope.workspaceId : null;
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO etl_runs (
         workspace_id, job_id, run_kind, scope, started_at, status, rows_ingested
       ) VALUES ($4, $1, $2, $3, now(), 'running', 0)
       RETURNING id`,
      [jobId, runKind, scope, workspaceId],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) {
      throw new Error("Failed to create ETL run");
    }
    return Number(id);
  }

  async finishRun(runId: number, rowsIngested: number): Promise<void> {
    const result = await this.pool.query(
      `UPDATE etl_runs
       SET status = 'done', rows_ingested = $2, finished_at = now(),
           step_failed = NULL, error_summary = NULL
       WHERE id = $1 AND status = 'running'`,
      [runId, rowsIngested],
    );
    if (result.rowCount !== 1) {
      throw new Error(`ETL run ${runId} is not running`);
    }
  }

  async failRun(runId: number, stepFailed: string, errorSummary: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE etl_runs
       SET status = 'failed', step_failed = $2, error_summary = $3, finished_at = now()
       WHERE id = $1 AND status = 'running'`,
      [runId, stepFailed.slice(0, 200), errorSummary.slice(0, 2_000)],
    );
    if (result.rowCount !== 1) {
      throw new Error(`ETL run ${runId} is not running`);
    }
  }
}
