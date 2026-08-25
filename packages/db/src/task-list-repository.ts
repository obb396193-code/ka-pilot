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
import {
  TASK_LIST_COUNT_SQL,
  TASK_LIST_PAGE_SQL,
  TASK_LIST_READINESS_SQL,
} from "./task-list-sql.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TaskListAccountScope {
  media: string;
  accountId: string;
}

export interface TaskListRepositoryQuery extends Partial<TaskListRequest> {
  workspaceId: string;
  requestingUserId: string;
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
  initialFullComplete: boolean;
}

interface CountRow extends QueryResultRow {
  total: string | number;
  coverage_complete: boolean;
}

interface ReadinessRow extends QueryResultRow {
  initial_full_complete: boolean;
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
  requestingUserId: string;
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
  if (!UUID_PATTERN.test(input.requestingUserId)) {
    throw new Error("requestingUserId must be a UUID");
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
    requestingUserId: input.requestingUserId,
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
      const countResult = await client.query<CountRow>(TASK_LIST_COUNT_SQL, values);
      const count = countResult.rows[0];
      if (!count) throw new Error("task list count query returned no row");
      const readinessResult = await client.query<ReadinessRow>(TASK_LIST_READINESS_SQL, [
        query.workspaceId,
        query.requestingUserId,
        values[2],
      ]);
      const readiness = readinessResult.rows[0];
      if (!readiness || typeof readiness.initial_full_complete !== "boolean") {
        throw new Error("task list readiness query returned no row");
      }
      const pageResult = await client.query<ListRow>(TASK_LIST_PAGE_SQL, [
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
        initialFullComplete: readiness.initial_full_complete,
      };
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}
