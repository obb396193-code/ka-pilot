import type { Pool, PoolClient } from "pg";

export interface BackfillBatch {
  id: number;
  workspaceId: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
  cursorDate: string | null;
  status: string;
}

export interface NewBackfillBatch {
  workspaceId: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
}

export interface BackfillProgress {
  cursorDate: string | null;
  status: "running" | "done" | "partial_failed";
  terminalDays: number;
  failedDays: number;
  totalDays: number;
}

type BackfillRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  date_from: string;
  date_to: string;
  cursor_date: string | null;
  status: string;
};

function inclusiveDates(dateFrom: string, dateTo: string): string[] {
  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T00:00:00.000Z`);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start > end) {
    throw new Error("Backfill date range is invalid");
  }
  const dates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  if (dates.length > 90) {
    throw new Error("Backfill range cannot exceed 90 days");
  }
  return dates;
}

function mapBatch(row: BackfillRow): BackfillBatch {
  return {
    id: Number(row.id),
    workspaceId: row.workspace_id,
    userId: row.user_id,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    cursorDate: row.cursor_date,
    status: row.status,
  };
}

export class BackfillRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: NewBackfillBatch): Promise<number> {
    inclusiveDates(input.dateFrom, input.dateTo);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO backfill_jobs (
         workspace_id, user_id, date_from, date_to, cursor_date, status
       ) VALUES ($1, $2, $3::date, $4::date, NULL, 'running')
       RETURNING id`,
      [input.workspaceId, input.userId, input.dateFrom, input.dateTo],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) {
      throw new Error("Failed to create backfill batch");
    }
    return Number(id);
  }

  async get(workspaceId: string, id: number): Promise<BackfillBatch> {
    const result = await this.pool.query<BackfillRow>(
      `SELECT id, workspace_id, user_id,
              to_char(date_from, 'YYYY-MM-DD') AS date_from,
              to_char(date_to, 'YYYY-MM-DD') AS date_to,
              to_char(cursor_date, 'YYYY-MM-DD') AS cursor_date,
              status
       FROM backfill_jobs
       WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Backfill batch ${id} was not found in workspace ${workspaceId}`);
    }
    return mapBatch(row);
  }

  async refreshProgress(workspaceId: string, id: number): Promise<BackfillProgress> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const batch = await this.getForUpdate(client, workspaceId, id);
      const dates = inclusiveDates(batch.dateFrom, batch.dateTo);
      const jobs = await client.query<{ ds: string; status: string }>(
        `SELECT payload->>'ds' AS ds, status
         FROM jobs
         WHERE workspace_id = $1
           AND job_type = 'backfill_day'
           AND payload->>'backfillId' = $2`,
        [workspaceId, String(id)],
      );
      const byDate = new Map(jobs.rows.map((row) => [row.ds, row.status]));
      const terminal = new Set(["done", "failed", "blocked_auth"]);
      const failed = new Set(["failed", "blocked_auth"]);
      let cursorDate: string | null = null;
      for (const ds of dates) {
        if (!terminal.has(byDate.get(ds) ?? "")) {
          break;
        }
        cursorDate = ds;
      }
      const terminalDays = dates.filter((ds) => terminal.has(byDate.get(ds) ?? "")).length;
      const failedDays = dates.filter((ds) => failed.has(byDate.get(ds) ?? "")).length;
      const status =
        terminalDays === dates.length
          ? failedDays > 0
            ? "partial_failed"
            : "done"
          : "running";
      await client.query(
        `UPDATE backfill_jobs SET cursor_date = $3::date, status = $4
         WHERE workspace_id = $1 AND id = $2`,
        [workspaceId, id, cursorDate, status],
      );
      await client.query("COMMIT");
      return { cursorDate, status, terminalDays, failedDays, totalDays: dates.length };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async refreshRunningBatches(): Promise<number> {
    const result = await this.pool.query<{ workspace_id: string; id: string }>(
      `SELECT workspace_id, id
       FROM backfill_jobs
       WHERE status = 'running'
       ORDER BY id`,
    );
    for (const row of result.rows) {
      await this.refreshProgress(row.workspace_id, Number(row.id));
    }
    return result.rows.length;
  }

  private async getForUpdate(
    client: PoolClient,
    workspaceId: string,
    id: number,
  ): Promise<BackfillBatch> {
    const result = await client.query<BackfillRow>(
      `SELECT id, workspace_id, user_id,
              to_char(date_from, 'YYYY-MM-DD') AS date_from,
              to_char(date_to, 'YYYY-MM-DD') AS date_to,
              to_char(cursor_date, 'YYYY-MM-DD') AS cursor_date,
              status
       FROM backfill_jobs
       WHERE workspace_id = $1 AND id = $2
       FOR UPDATE`,
      [workspaceId, id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Backfill batch ${id} was not found in workspace ${workspaceId}`);
    }
    return mapBatch(row);
  }
}
