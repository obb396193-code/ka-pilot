import type { Pool } from "pg";
import { calendarDateSchema } from "@ka/domain";

import { queryMetricDimension } from "./semantic-query-dimension.js";
import { querySemanticHealth } from "./semantic-query-health.js";
import { queryMetricSummary, queryMetricTrend, EXPECTED_METRIC_CTE } from "./semantic-query-metrics.js";
import {
  buildMetricFilter,
  isoTimestamp,
  normalizeTableQuery,
  nullableNumber,
  tableOrderBy,
  SemanticQueryContractError,
} from "./semantic-query-support.js";
import type {
  RelatedTask,
  SemanticDimensionQuery,
  SemanticDimensionRow,
  SemanticHealthResult,
  MetricSummary,
  MetricTrendRow,
  SemanticQueryScope,
  SemanticTableQuery,
  SemanticTableResult,
  SemanticTableRow,
  SemanticLineageResult,
} from "./semantic-query-types.js";

interface TableDatabaseRow {
  workspace_id: string;
  account_id: string;
  account_name: string | null;
  media: string;
  owner_user_id: string | null;
  ds: string;
  cost: string | number | null;
  exposure: string | number | null;
  click: string | number | null;
  conversion: string | number | null;
  real_conversion: string | number | null;
  real_cpa: string | number | null;
  cash_cost: string | number | null;
  cash_cpa: string | number | null;
  cost_space: string | number | null;
  gap: string | number | null;
  budget: string | number | null;
  budget_usage_rate: string | number | null;
  deduction_rate: string | number | null;
  main_ad_cost_proportion: string | number | null;
  assessment_price_snapshot: string | number | null;
  wake_uv: string | number | null;
  potential_uv: string | number | null;
  data_anomaly: boolean;
  computed_at: string | Date;
  tasks: RelatedTask[];
}

function mapTableRow(row: TableDatabaseRow): SemanticTableRow {
  return {
    workspaceId: row.workspace_id,
    accountId: row.account_id,
    accountName: row.account_name,
    media: row.media,
    ownerUserId: row.owner_user_id,
    ds: row.ds,
    cost: nullableNumber(row.cost),
    exposure: nullableNumber(row.exposure),
    click: nullableNumber(row.click),
    conversion: nullableNumber(row.conversion),
    realConversion: nullableNumber(row.real_conversion),
    realCpa: nullableNumber(row.real_cpa),
    cashCost: nullableNumber(row.cash_cost),
    cashCpa: nullableNumber(row.cash_cpa),
    costSpace: nullableNumber(row.cost_space),
    gap: nullableNumber(row.gap),
    budget: nullableNumber(row.budget),
    budgetUsageRate: nullableNumber(row.budget_usage_rate),
    deductionRate: nullableNumber(row.deduction_rate),
    mainAdCostProportion: nullableNumber(row.main_ad_cost_proportion),
    assessmentPriceSnapshot: nullableNumber(row.assessment_price_snapshot),
    wakeUv: nullableNumber(row.wake_uv),
    potentialUv: nullableNumber(row.potential_uv),
    dataAnomaly: row.data_anomaly,
    computedAt: isoTimestamp(row.computed_at),
    tasks: row.tasks,
  };
}

export class SemanticQueryRepository {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  async queryTable(input: SemanticTableQuery): Promise<SemanticTableResult> {
    const query = normalizeTableQuery(input);
    const filter = buildMetricFilter(query);
    const countResult = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total
       FROM account_metrics_daily AS metric
       JOIN accounts AS account
         ON account.workspace_id = metric.workspace_id
        AND account.media = metric.media
        AND account.account_id = metric.account_id
       WHERE ${filter.whereSql}`,
      filter.values,
    );
    const offset = (query.page - 1) * query.pageSize;
    const values = [...filter.values, query.pageSize, offset];
    const rows = await this.pool.query<TableDatabaseRow>(
      `SELECT
         metric.workspace_id, metric.account_id, account.account_name,
         metric.media, account.owner_user_id, to_char(metric.ds, 'YYYY-MM-DD') AS ds,
         metric.cost, metric.exposure, metric.click, metric.conversion,
         metric.real_conversion, metric.real_cpa, metric.cash_cost, metric.cash_cpa,
         metric.cost_space, metric.gap, metric.budget, metric.budget_usage_rate,
         metric.deduction_rate, metric.main_ad_cost_proportion,
         metric.assessment_price_snapshot, metric.wake_uv, metric.potential_uv,
         metric.data_anomaly, metric.computed_at, related.tasks
       FROM account_metrics_daily AS metric
       JOIN accounts AS account
         ON account.workspace_id = metric.workspace_id
        AND account.media = metric.media
        AND account.account_id = metric.account_id
       LEFT JOIN LATERAL (
         SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'taskId', relation.task_id,
               'taskName', task.task_name,
               'bizName', task.biz_name
             ) ORDER BY relation.task_id
           ),
           '[]'::jsonb
         ) AS tasks
         FROM task_accounts AS relation
         LEFT JOIN tasks AS task
           ON task.workspace_id = relation.workspace_id
          AND task.task_id = relation.task_id
         WHERE relation.workspace_id = metric.workspace_id
           AND relation.media = metric.media
           AND relation.account_id = metric.account_id
           AND relation.valid_from <= metric.ds
           AND (relation.valid_to IS NULL OR relation.valid_to >= metric.ds)
       ) AS related ON true
       WHERE ${filter.whereSql}
       ORDER BY ${tableOrderBy(query.sortBy, query.sortDirection)}
       LIMIT $${filter.values.length + 1} OFFSET $${filter.values.length + 2}`,
      values,
    );
    return {
      rows: rows.rows.map(mapTableRow),
      total: Number(countResult.rows[0]?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async querySummary(input: SemanticQueryScope): Promise<MetricSummary> {
    return queryMetricSummary(this.pool, input);
  }

  async queryTrend(input: SemanticQueryScope): Promise<MetricTrendRow[]> {
    return queryMetricTrend(this.pool, input);
  }

  async queryDimension(input: SemanticDimensionQuery): Promise<SemanticDimensionRow[]> {
    return queryMetricDimension(this.pool, input);
  }

  async queryHealth(input: SemanticQueryScope): Promise<SemanticHealthResult> {
    return querySemanticHealth(this.pool, input);
  }

  async queryLineage(input: SemanticQueryScope): Promise<SemanticLineageResult> {
    const filter = buildMetricFilter(input);
    const result = await this.pool.query<{
      data_as_of: string | Date | null;
      canonical_rows: string | number;
      returned_accounts: string | number;
      account_days: string | number;
      expected_account_days?: string | number;
      requested_dates?: unknown;
    }>(
      `${input.filters?.taskId === undefined ? "" : `${EXPECTED_METRIC_CTE}, task_expected AS (
        SELECT metric.ds FROM expected_metric AS metric
        JOIN accounts AS account ON account.workspace_id=metric.workspace_id
          AND account.media=metric.media AND account.account_id=metric.account_id
        WHERE ${filter.whereSql}
      )`} SELECT max(metric.computed_at) AS data_as_of,
              count(*)::text AS canonical_rows,
              count(DISTINCT (metric.media, metric.account_id))::text AS returned_accounts,
              count(DISTINCT (metric.media, metric.account_id, metric.ds))::text AS account_days
              ${input.filters?.taskId === undefined ? "" : `, (SELECT count(*)::text FROM task_expected) AS expected_account_days,
                (SELECT coalesce(array_agg(DISTINCT ds::text ORDER BY ds::text),ARRAY[]::text[]) FROM task_expected) AS requested_dates`}
       FROM account_metrics_daily AS metric
       JOIN accounts AS account
         ON account.workspace_id = metric.workspace_id
        AND account.media = metric.media
        AND account.account_id = metric.account_id
       WHERE ${filter.whereSql}`,
      filter.values,
    );
    const row = result.rows[0];
    const accountCount = input.filters?.accountScopes?.length ??
      input.filters?.accountIds?.length ??
      (input.filters?.accountId === undefined ? 0 : 1);
    const dateFrom = Date.parse(`${input.dateFrom}T00:00:00.000Z`);
    const dateTo = Date.parse(`${input.dateTo}T00:00:00.000Z`);
    const days = Math.floor((dateTo - dateFrom) / 86_400_000) + 1;
    let expectedDays = Math.max(accountCount * days, 0);
    let requestedDates: string[] | undefined;
    if (input.filters?.taskId !== undefined) {
      const raw = row?.expected_account_days;
      if ((typeof raw !== "number" && (typeof raw !== "string" || !/^\d+$/.test(raw))) ||
        !Number.isSafeInteger(Number(raw)) || Number(raw) < 0) throw new SemanticQueryContractError("Invalid task coverage proof");
      expectedDays = Number(raw);
      const counts = [row?.canonical_rows, row?.returned_accounts, row?.account_days].map((value) => {
        if ((typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) ||
          !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new SemanticQueryContractError("Invalid task coverage proof");
        return Number(value);
      });
      if (counts[0] !== counts[2] || counts[1]! > counts[2]! || counts[2]! > expectedDays ||
        (input.filters.accountScopes !== undefined && expectedDays > input.filters.accountScopes.length * days)) {
        throw new SemanticQueryContractError("Inconsistent task coverage proof");
      }
      const dates = calendarDateSchema.array().max(366).safeParse(row?.requested_dates);
      if (!dates.success || dates.data.length > expectedDays || (dates.data.length === 0) !== (expectedDays === 0) ||
        dates.data.some((date, index) => date < input.dateFrom || date > input.dateTo || (index > 0 && date <= dates.data[index - 1]!)) ||
        (input.filters.accountScopes !== undefined && expectedDays > input.filters.accountScopes.length * dates.data.length)) {
        throw new SemanticQueryContractError("Invalid task effective dates");
      }
      requestedDates = dates.data;
    }
    return {
      dataAsOf: row?.data_as_of == null ? null : isoTimestamp(row.data_as_of),
      canonicalRows: Number(row?.canonical_rows ?? 0),
      returnedAccounts: Number(row?.returned_accounts ?? 0),
      requestedAccountDays: expectedDays,
      returnedAccountDays: Number(row?.account_days ?? 0),
      ...(requestedDates === undefined ? {} : { requestedDates }),
    };
  }
}
