import type {
  Pool,
  QueryResult,
  QueryResultRow,
} from "pg";

import {
  taskListCalendarDateSchema,
  taskListRequestSchema,
  type TaskListRequest,
} from "@ka/domain";

import { isoTimestamp, nullableNumber } from "./semantic-query-support.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TaskListAccountScope {
  media: string;
  accountId: string;
}

export interface TaskListRepositoryQuery extends Partial<TaskListRequest> {
  workspaceId: string;
  businessDate: string;
  allowedAccounts: readonly TaskListAccountScope[];
}

export interface TaskListRepositoryClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  release(): void;
}

export interface TaskListRepositoryPool {
  connect(): Promise<TaskListRepositoryClient>;
}

export interface TaskListRepositoryWorkItemSummary {
  openCount: number;
  highestSeverity: "P0" | "P1" | "P2" | "opportunity" | null;
  counts: { P0: number; P1: number; P2: number; opportunity: number };
}

export interface TaskListRepositoryRow {
  workspaceId: string;
  taskId: string;
  taskName: string | null;
  bizName: string | null;
  status: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  targetVolume: number | null;
  budget: number | null;
  owner: { userId: string; displayName: string } | null;
  assessmentPrice: { value: number; effectiveDate: string } | null;
  linkedAccountCount: number;
  totalLinkedAccountCount: number;
  completedVolume: number | null;
  spent: number | null;
  recentDailyVolumes: number[];
  workItemSummary: TaskListRepositoryWorkItemSummary;
  latestMetricDate: string | null;
  dataAsOf: string | null;
}

export interface TaskListRepositoryResult {
  rows: TaskListRepositoryRow[];
  page: number;
  pageSize: number;
  total: number;
  coverageComplete: boolean;
}

interface CountRow extends QueryResultRow {
  total: string | number;
  coverage_complete: boolean;
}

interface ListRow extends QueryResultRow {
  workspace_id: string;
  task_id: string;
  task_name: string | null;
  biz_name: string | null;
  status: string | null;
  period_start: string | null;
  period_end: string | null;
  target_volume: string | number | null;
  budget: string | number | null;
  owner_user_id: string | null;
  owner_display_name: string | null;
  assessment_price: string | number | null;
  assessment_effective_date: string | null;
  linked_account_count: string | number;
  total_linked_account_count: string | number;
  completed_volume: string | number | null;
  spent: string | number | null;
  recent_daily_volumes: unknown;
  latest_metric_date: string | null;
  data_as_of: Date | string | null;
  work_item_open_count: string | number;
  work_item_p0: string | number;
  work_item_p1: string | number;
  work_item_p2: string | number;
  work_item_opportunity: string | number;
}

interface NormalizedQuery extends TaskListRequest {
  workspaceId: string;
  businessDate: string;
  allowedAccounts: TaskListAccountScope[];
}

function nonnegativeInteger(value: string | number, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${field} returned an invalid count`);
  }
  return parsed;
}

function normalizeRecentVolumes(value: unknown): number[] {
  if (value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("recentDailyVolumes returned an invalid value");
  }
  return value.map((item) => {
    const parsed = Number(item);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error("recentDailyVolumes returned a non-finite value");
    }
    return parsed;
  });
}

function normalizeQuery(input: TaskListRepositoryQuery): NormalizedQuery {
  if (!UUID_PATTERN.test(input.workspaceId)) {
    throw new Error("workspaceId must be a UUID");
  }
  const businessDate = taskListCalendarDateSchema.parse(input.businessDate);
  const parsed = taskListRequestSchema.parse({
    page: input.page,
    pageSize: input.pageSize,
    q: input.q,
    status: input.status,
    ownerUserId: input.ownerUserId,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    hasOpenWorkItems: input.hasOpenWorkItems,
  });
  const seen = new Set<string>();
  const allowedAccounts = input.allowedAccounts.map((account) => {
    const media = account.media.trim();
    const accountId = account.accountId.trim();
    if (media === "" || accountId === "") {
      throw new Error("allowedAccounts require media and accountId");
    }
    const key = JSON.stringify([media, accountId]);
    if (seen.has(key)) throw new Error("allowedAccounts contain a duplicate tuple");
    seen.add(key);
    return { media, accountId };
  });
  return {
    ...parsed,
    workspaceId: input.workspaceId,
    businessDate,
    allowedAccounts,
  };
}

function commonValues(query: NormalizedQuery): unknown[] {
  return [
    query.workspaceId,
    query.businessDate,
    JSON.stringify(query.allowedAccounts.map((account) => ({
      media: account.media,
      account_id: account.accountId,
    }))),
    query.q === undefined || query.q === "" ? null : query.q,
    query.status ?? null,
    query.ownerUserId ?? null,
    query.periodFrom ?? null,
    query.periodTo ?? null,
    query.hasOpenWorkItems ?? null,
  ];
}

const FILTERED_TASKS_CTE = `
  allowed_scope AS (
    SELECT allowed.media, allowed.account_id
    FROM jsonb_to_recordset($3::jsonb)
      AS allowed(media text, account_id text)
  ),
  filtered_tasks AS (
    SELECT task.*
    FROM tasks AS task
    WHERE task.workspace_id = $1::uuid
      AND ($4::text IS NULL
        OR strpos(lower(COALESCE(task.task_name, '')), lower($4::text)) > 0
        OR strpos(lower(COALESCE(task.biz_name, '')), lower($4::text)) > 0)
      AND ($5::text IS NULL OR task.status = $5::text)
      AND ($6::uuid IS NULL OR task.owner_user_id = $6::uuid)
      AND ($7::date IS NULL OR task.period_end >= $7::date)
      AND ($8::date IS NULL OR task.period_start <= $8::date)
      AND (
        $9::boolean IS NULL
        OR $9::boolean = EXISTS (
          SELECT 1
          FROM work_items AS filtered_item
          WHERE filtered_item.workspace_id = task.workspace_id
            AND filtered_item.task_id = task.task_id
            AND filtered_item.status IN ('open', 'processing', 'escalated')
            AND filtered_item.media IS NOT NULL
            AND filtered_item.account_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM allowed_scope AS allowed
              WHERE allowed.media = filtered_item.media
                AND allowed.account_id = filtered_item.account_id
            )
        )
      )
  )`;

const COUNT_SQL = `
  WITH ${FILTERED_TASKS_CTE}
  /* task-list-total */
  SELECT
    count(*) AS total,
    NOT EXISTS (
      SELECT 1
      FROM filtered_tasks AS task
      JOIN task_accounts AS relation
        ON relation.workspace_id = task.workspace_id
       AND relation.task_id = task.task_id
       AND relation.valid_from <= $2::date
       AND (relation.valid_to IS NULL OR relation.valid_to >= $2::date)
      WHERE NOT EXISTS (
        SELECT 1 FROM allowed_scope AS allowed
        WHERE allowed.media = relation.media
          AND allowed.account_id = relation.account_id
      )
    ) AS coverage_complete
  FROM filtered_tasks`;

const LIST_SQL = `
  WITH ${FILTERED_TASKS_CTE}
  SELECT
    task.workspace_id,
    task.task_id,
    task.task_name,
    task.biz_name,
    task.status,
    to_char(task.period_start, 'YYYY-MM-DD') AS period_start,
    to_char(task.period_end, 'YYYY-MM-DD') AS period_end,
    task.target_volume,
    task.budget,
    task.owner_user_id,
    owner.name AS owner_display_name,
    assessment.price AS assessment_price,
    assessment.effective_date AS assessment_effective_date,
    COALESCE(linked.authorized_count, 0) AS linked_account_count,
    COALESCE(linked.total_count, 0) AS total_linked_account_count,
    metric.completed_volume,
    metric.spent,
    COALESCE(metric.recent_daily_volumes, '[]'::jsonb) AS recent_daily_volumes,
    metric.latest_metric_date,
    metric.data_as_of,
    COALESCE(items.open_count, 0) AS work_item_open_count,
    COALESCE(items.p0, 0) AS work_item_p0,
    COALESCE(items.p1, 0) AS work_item_p1,
    COALESCE(items.p2, 0) AS work_item_p2,
    COALESCE(items.opportunity, 0) AS work_item_opportunity
  FROM filtered_tasks AS task
  LEFT JOIN users AS owner
    ON owner.workspace_id = task.workspace_id
   AND owner.id = task.owner_user_id
  LEFT JOIN LATERAL (
    SELECT history.price,
           to_char(history.effective_date, 'YYYY-MM-DD') AS effective_date
    FROM assessment_price_history AS history
    WHERE history.workspace_id = task.workspace_id
      AND history.task_id = task.task_id
      AND history.effective_date <= $2::date
    ORDER BY history.effective_date DESC, history.id DESC
    LIMIT 1
  ) AS assessment ON true
  LEFT JOIN LATERAL (
    SELECT
      count(DISTINCT (relation.media, relation.account_id)) AS total_count,
      count(DISTINCT (relation.media, relation.account_id)) FILTER (WHERE EXISTS (
        SELECT 1 FROM allowed_scope AS allowed
        WHERE allowed.media = relation.media
          AND allowed.account_id = relation.account_id
      )) AS authorized_count
    FROM task_accounts AS relation
    WHERE relation.workspace_id = task.workspace_id
      AND relation.task_id = task.task_id
      AND relation.valid_from <= $2::date
      AND (relation.valid_to IS NULL OR relation.valid_to >= $2::date)
  ) AS linked ON true
  LEFT JOIN LATERAL (
    SELECT
      sum(daily.real_conversion) AS completed_volume,
      sum(daily.cost) AS spent,
      jsonb_agg(daily.real_conversion ORDER BY daily.ds)
        FILTER (
          WHERE daily.ds >= $2::date - 6
            AND daily.real_conversion IS NOT NULL
        ) AS recent_daily_volumes,
      to_char(max(daily.ds), 'YYYY-MM-DD') AS latest_metric_date,
      max(daily.computed_at) AS data_as_of
    FROM (
      SELECT
        metric.ds,
        sum(metric.real_conversion) AS real_conversion,
        sum(metric.cost) AS cost,
        max(metric.computed_at) AS computed_at
      FROM account_metrics_daily AS metric
      WHERE metric.workspace_id = task.workspace_id
        AND task.period_start IS NOT NULL
        AND task.period_end IS NOT NULL
        AND metric.ds BETWEEN task.period_start AND LEAST(task.period_end, $2::date)
        AND EXISTS (
          SELECT 1 FROM allowed_scope AS allowed
          WHERE allowed.media = metric.media
            AND allowed.account_id = metric.account_id
        )
        AND EXISTS (
          SELECT 1
          FROM task_accounts AS effective_relation
          WHERE effective_relation.workspace_id = metric.workspace_id
            AND effective_relation.task_id = task.task_id
            AND effective_relation.media = metric.media
            AND effective_relation.account_id = metric.account_id
            AND effective_relation.valid_from <= metric.ds
            AND (
              effective_relation.valid_to IS NULL
              OR effective_relation.valid_to >= metric.ds
            )
        )
      GROUP BY metric.ds
    ) AS daily
  ) AS metric ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS open_count,
      count(*) FILTER (WHERE item.severity = 'P0') AS p0,
      count(*) FILTER (WHERE item.severity = 'P1') AS p1,
      count(*) FILTER (WHERE item.severity = 'P2') AS p2,
      count(*) FILTER (WHERE item.severity = 'opportunity') AS opportunity
    FROM work_items AS item
    WHERE item.workspace_id = task.workspace_id
      AND item.task_id = task.task_id
      AND item.status IN ('open', 'processing', 'escalated')
      AND item.media IS NOT NULL
      AND item.account_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM allowed_scope AS allowed
        WHERE allowed.media = item.media
          AND allowed.account_id = item.account_id
      )
  ) AS items ON true
  ORDER BY
    CASE task.status WHEN 'active' THEN 0 WHEN 'preparing' THEN 1 WHEN 'ended' THEN 2 ELSE 3 END,
    task.period_end ASC NULLS LAST,
    task.task_id ASC
  LIMIT $10 OFFSET $11`;

function highestSeverity(counts: TaskListRepositoryWorkItemSummary["counts"]): TaskListRepositoryWorkItemSummary["highestSeverity"] {
  if (counts.P0 > 0) return "P0";
  if (counts.P1 > 0) return "P1";
  if (counts.P2 > 0) return "P2";
  if (counts.opportunity > 0) return "opportunity";
  return null;
}

function mapListRow(row: ListRow): TaskListRepositoryRow {
  const counts = {
    P0: nonnegativeInteger(row.work_item_p0, "workItemSummary.P0"),
    P1: nonnegativeInteger(row.work_item_p1, "workItemSummary.P1"),
    P2: nonnegativeInteger(row.work_item_p2, "workItemSummary.P2"),
    opportunity: nonnegativeInteger(
      row.work_item_opportunity,
      "workItemSummary.opportunity",
    ),
  };
  const openCount = nonnegativeInteger(row.work_item_open_count, "workItemSummary.openCount");
  if (openCount !== counts.P0 + counts.P1 + counts.P2 + counts.opportunity) {
    throw new Error("workItemSummary returned an unsupported severity");
  }
  const assessmentValue = nullableNumber(row.assessment_price);
  return {
    workspaceId: row.workspace_id,
    taskId: row.task_id,
    taskName: row.task_name,
    bizName: row.biz_name,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    targetVolume: nullableNumber(row.target_volume),
    budget: nullableNumber(row.budget),
    owner: row.owner_user_id === null || row.owner_display_name === null
      ? null
      : { userId: row.owner_user_id, displayName: row.owner_display_name },
    assessmentPrice: assessmentValue === null || row.assessment_effective_date === null
      ? null
      : { value: assessmentValue, effectiveDate: row.assessment_effective_date },
    linkedAccountCount: nonnegativeInteger(
      row.linked_account_count,
      "linkedAccountCount",
    ),
    totalLinkedAccountCount: nonnegativeInteger(
      row.total_linked_account_count,
      "totalLinkedAccountCount",
    ),
    completedVolume: nullableNumber(row.completed_volume),
    spent: nullableNumber(row.spent),
    recentDailyVolumes: normalizeRecentVolumes(row.recent_daily_volumes),
    workItemSummary: { openCount, highestSeverity: highestSeverity(counts), counts },
    latestMetricDate: row.latest_metric_date,
    dataAsOf: row.data_as_of === null ? null : isoTimestamp(row.data_as_of),
  };
}

async function rollback(client: TaskListRepositoryClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original query error.
  }
}

export class TaskListRepository {
  private readonly pool: TaskListRepositoryPool;

  constructor(pool: Pool | TaskListRepositoryPool) {
    this.pool = pool;
  }

  async list(input: TaskListRepositoryQuery): Promise<TaskListRepositoryResult> {
    const query = normalizeQuery(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const values = commonValues(query);
      const countResult = await client.query<CountRow>(COUNT_SQL, values);
      const count = countResult.rows[0];
      if (!count) throw new Error("task list count query returned no row");
      const pageResult = await client.query<ListRow>(LIST_SQL, [
        ...values,
        query.pageSize,
        (query.page - 1) * query.pageSize,
      ]);
      await client.query("COMMIT");
      return {
        rows: pageResult.rows.map(mapListRow),
        page: query.page,
        pageSize: query.pageSize,
        total: nonnegativeInteger(count.total, "total"),
        coverageComplete: count.coverage_complete,
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}
