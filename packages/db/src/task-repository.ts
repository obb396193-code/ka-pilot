import type { Pool, PoolClient } from "pg";

import { queryMetricTrend } from "./semantic-query-metrics.js";
import type { MetricTrendRow } from "./semantic-query-types.js";
import { isoTimestamp, nullableNumber } from "./semantic-query-support.js";
import { assessmentPriceEffectiveSql } from "./assessment-price-selection.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface TaskRecord {
  workspaceId: string;
  taskId: string;
  taskName: string | null;
  bizName: string | null;
  rtaFlag: boolean | null;
  deliveryMode: string | null;
  placementPref: string | null;
  conversionMetric: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  targetVolume: number | null;
  budget: number | null;
  ownerUserId: string | null;
  status: string | null;
  createdAt: string | null;
}

export interface AssignTaskAccountInput {
  workspaceId: string;
  taskId: string;
  media: string;
  accountId: string;
  validFrom: string;
  validTo: string | null;
}

export interface TaskAccountRecord extends AssignTaskAccountInput {
  id: number;
}

export interface AppendAssessmentPriceInput {
  workspaceId: string;
  taskId: string;
  price: number;
  effectiveDate: string;
  changedBy: string;
  evidenceUrl: string | null;
}

export interface AssessmentPriceRecord {
  id: number;
  workspaceId: string;
  taskId: string;
  price: number;
  effectiveDate: string;
  changedBy: string | null;
  evidenceUrl: string | null;
  createdAt: string | null;
}

export interface TaskMetricQuery {
  workspaceId: string;
  taskId: string;
  dateFrom: string;
  dateTo: string;
}

interface TaskRow {
  workspace_id: string;
  task_id: string;
  task_name: string | null;
  biz_name: string | null;
  rta_flag: boolean | null;
  delivery_mode: string | null;
  placement_pref: string | null;
  conversion_metric: string | null;
  period_start: string | null;
  period_end: string | null;
  target_volume: string | number | null;
  budget: string | number | null;
  owner_user_id: string | null;
  status: string | null;
  created_at: Date | string | null;
}

interface TaskAccountRow {
  id: string | number;
  workspace_id: string;
  task_id: string;
  media: string;
  account_id: string;
  valid_from: string;
  valid_to: string | null;
}

interface AssessmentPriceRow {
  id: string | number;
  workspace_id: string;
  task_id: string;
  price: string | number;
  effective_date: string;
  changed_by: string | null;
  evidence_url: string | null;
  created_at: Date | string | null;
}

export class TaskAccountOverlapError extends Error {
  readonly code = "TASK_ACCOUNT_OVERLAP";
  readonly statusCode = 409;
  constructor(
    readonly taskId: string,
    readonly accountId: string,
  ) {
    super("Account is already assigned to a task during this period");
    this.name = "TaskAccountOverlapError";
  }
}

function assertDate(value: string, field: string): void {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${field} must be a valid date`);
  }
}

function assertId(value: string, field: string): void {
  if (value.trim() === "") throw new Error(`${field} is required`);
}

function mapTask(row: TaskRow): TaskRecord {
  return {
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    taskName: row.task_name,
    bizName: row.biz_name,
    rtaFlag: row.rta_flag,
    deliveryMode: row.delivery_mode,
    placementPref: row.placement_pref,
    conversionMetric: row.conversion_metric,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    targetVolume: nullableNumber(row.target_volume),
    budget: nullableNumber(row.budget),
    ownerUserId: row.owner_user_id,
    status: row.status,
    createdAt: row.created_at === null ? null : isoTimestamp(row.created_at),
  };
}

function mapTaskAccount(row: TaskAccountRow): TaskAccountRecord {
  return {
    id: Number(row.id),
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    media: row.media,
    accountId: row.account_id,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  };
}

function mapAssessmentPrice(row: AssessmentPriceRow): AssessmentPriceRecord {
  const price = nullableNumber(row.price);
  if (price === null) throw new Error("assessment price returned a non-numeric value");
  return {
    id: Number(row.id),
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    price,
    effectiveDate: row.effective_date,
    changedBy: row.changed_by,
    evidenceUrl: row.evidence_url,
    createdAt: row.created_at === null ? null : isoTimestamp(row.created_at),
  };
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original error.
  }
}

export class TaskRepository {
  constructor(private readonly pool: Pool) {}

  async getTask(workspaceId: string, taskId: string): Promise<TaskRecord | null> {
    assertId(workspaceId, "workspaceId");
    assertId(taskId, "taskId");
    const result = await this.pool.query<TaskRow>(
      `SELECT workspace_id, task_id, task_name, biz_name, rta_flag,
              delivery_mode, placement_pref, conversion_metric,
              to_char(period_start, 'YYYY-MM-DD') AS period_start,
              to_char(period_end, 'YYYY-MM-DD') AS period_end,
              target_volume, budget, owner_user_id, status, created_at
       FROM tasks WHERE workspace_id=$1 AND task_id=$2`,
      [workspaceId, taskId],
    );
    return result.rows[0] ? mapTask(result.rows[0]) : null;
  }

  async assignAccount(input: AssignTaskAccountInput): Promise<TaskAccountRecord> {
    assertId(input.workspaceId, "workspaceId");
    assertId(input.taskId, "taskId");
    assertId(input.media, "media");
    assertId(input.accountId, "accountId");
    assertDate(input.validFrom, "validFrom");
    if (input.validTo !== null) {
      assertDate(input.validTo, "validTo");
      if (input.validFrom > input.validTo) {
        throw new Error("validFrom must not be after validTo");
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
        input.workspaceId,
        JSON.stringify([input.media, input.accountId]),
      ]);
      const task = await client.query(
        `SELECT task_id FROM tasks
         WHERE workspace_id=$1 AND task_id=$2 FOR KEY SHARE`,
        [input.workspaceId, input.taskId],
      );
      if (task.rowCount === 0) throw new Error("task not found in workspace");
      const account = await client.query(
        `SELECT account_id FROM accounts
         WHERE workspace_id=$1 AND media=$2 AND account_id=$3 FOR KEY SHARE`,
        [input.workspaceId, input.media, input.accountId],
      );
      if (account.rowCount === 0) throw new Error("account not found in workspace");

      const overlap = await client.query(
        `SELECT 1 FROM task_accounts
         WHERE workspace_id=$1 AND media=$2 AND account_id=$3
           AND valid_from <= COALESCE($5::date, 'infinity'::date)
           AND (valid_to IS NULL OR valid_to >= $4::date)
         LIMIT 1`,
        [
          input.workspaceId,
          input.media,
          input.accountId,
          input.validFrom,
          input.validTo,
        ],
      );
      if (overlap.rowCount !== 0) {
        throw new TaskAccountOverlapError(input.taskId, input.accountId);
      }
      const inserted = await client.query<TaskAccountRow>(
        `INSERT INTO task_accounts
           (workspace_id, task_id, media, account_id, valid_from, valid_to)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, workspace_id, task_id, media, account_id,
                   to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
                   to_char(valid_to, 'YYYY-MM-DD') AS valid_to`,
        [
          input.workspaceId,
          input.taskId,
          input.media,
          input.accountId,
          input.validFrom,
          input.validTo,
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("task-account insert returned no row");
      await client.query("COMMIT");
      return mapTaskAccount(row);
    } catch (error) {
      await rollback(client);
      if (error !== null && typeof error === "object" &&
          "code" in error && error.code === "23P01" &&
          "constraint" in error && error.constraint === "task_accounts_account_validity_excl") {
        throw new TaskAccountOverlapError(input.taskId, input.accountId);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async appendAssessmentPrice(
    input: AppendAssessmentPriceInput,
  ): Promise<AssessmentPriceRecord> {
    assertId(input.workspaceId, "workspaceId");
    assertId(input.taskId, "taskId");
    assertId(input.changedBy, "changedBy");
    assertDate(input.effectiveDate, "effectiveDate");
    if (!Number.isFinite(input.price) || input.price <= 0) {
      throw new Error("price must be a finite positive number");
    }

    const result = await this.pool.query<AssessmentPriceRow>(
      `INSERT INTO assessment_price_history
         (workspace_id, task_id, price, effective_date, changed_by, evidence_url)
       SELECT $1,$2,$3,$4,$5,$6
       WHERE EXISTS (
         SELECT 1 FROM tasks WHERE workspace_id=$1 AND task_id=$2
       )
         AND EXISTS (
           SELECT 1 FROM users WHERE workspace_id=$1 AND id=$5
         )
       RETURNING id, workspace_id, task_id, price,
                 to_char(effective_date, 'YYYY-MM-DD') AS effective_date,
                 changed_by, evidence_url, created_at`,
      [
        input.workspaceId,
        input.taskId,
        input.price,
        input.effectiveDate,
        input.changedBy,
        input.evidenceUrl,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("task or actor not found in workspace");
    return mapAssessmentPrice(row);
  }

  async getEffectiveAssessmentPrice(
    workspaceId: string,
    taskId: string,
    onDate: string,
  ): Promise<AssessmentPriceRecord | null> {
    assertDate(onDate, "onDate");
    const result = await this.pool.query<AssessmentPriceRow>(
      `SELECT id, workspace_id, task_id, price,
              to_char(effective_date, 'YYYY-MM-DD') AS effective_date,
              changed_by, evidence_url, created_at
       FROM assessment_price_history AS price
       WHERE price.workspace_id=$1 AND price.task_id=$2
         AND ${assessmentPriceEffectiveSql("price", "$3::date")}
       ORDER BY price.effective_date DESC, price.id DESC LIMIT 1`,
      [workspaceId, taskId, onDate],
    );
    return result.rows[0] ? mapAssessmentPrice(result.rows[0]) : null;
  }

  async listAssessmentPriceHistory(
    workspaceId: string,
    taskId: string,
  ): Promise<AssessmentPriceRecord[]> {
    const result = await this.pool.query<AssessmentPriceRow>(
      `SELECT id, workspace_id, task_id, price,
              to_char(effective_date, 'YYYY-MM-DD') AS effective_date,
              changed_by, evidence_url, created_at
       FROM assessment_price_history
       WHERE workspace_id=$1 AND task_id=$2
       ORDER BY effective_date DESC, id DESC`,
      [workspaceId, taskId],
    );
    return result.rows.map(mapAssessmentPrice);
  }

  async queryDailyMetrics(input: TaskMetricQuery): Promise<MetricTrendRow[]> {
    if (typeof input.taskId !== "string" || input.taskId.trim() === "") {
      throw new Error("taskId is required");
    }
    return queryMetricTrend(this.pool, { workspaceId: input.workspaceId,
      dateFrom: input.dateFrom, dateTo: input.dateTo, filters: { taskId: input.taskId } });
  }
}
