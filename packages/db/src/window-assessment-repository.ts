import { dailyAssessmentInputSchema, metricValue, type DailyAssessmentInput } from "@ka/domain";
import type { Pool } from "pg";
import { EXPECTED_METRIC_CTE } from "./semantic-query-metrics.js";
import { buildMetricFilter, nullableNumber, SemanticQueryContractError } from "./semantic-query-support.js";
import type { SemanticQueryScope } from "./semantic-query-types.js";

const MAX_GROUPS = 10_000;
export interface WindowAccountAssessmentCounts { total: number; determinable: number; onTarget: number }
export interface AccountDailyAssessment {
  workspaceId: string; media: string; accountId: string; input: DailyAssessmentInput;
}
const assessmentFromSql = `FROM expected_metric AS metric
  JOIN accounts AS account ON account.workspace_id=metric.workspace_id
    AND account.media=metric.media AND account.account_id=metric.account_id
  LEFT JOIN task_accounts AS relation ON relation.workspace_id=metric.workspace_id
    AND relation.media=metric.media AND relation.account_id=metric.account_id
    AND relation.valid_from<=metric.ds AND (relation.valid_to IS NULL OR relation.valid_to>=metric.ds)
  LEFT JOIN LATERAL (
    SELECT price.id, price.price, price.effective_date
    FROM assessment_price_history AS price
    WHERE price.workspace_id=relation.workspace_id AND price.task_id=relation.task_id
      AND price.effective_date<=metric.ds
    ORDER BY price.effective_date DESC, price.id DESC LIMIT 1
  ) AS assessment ON true`;
function assessmentFilter(scope: SemanticQueryScope) {
  const filter = buildMetricFilter(scope);
  const span = (Date.parse(`${scope.dateTo}T00:00:00Z`) - Date.parse(`${scope.dateFrom}T00:00:00Z`)) / 86_400_000 + 1;
  if (span > 366 || !Array.isArray(scope.filters?.accountScopes) || scope.filters.accountScopes.length > 1000) {
    throw new SemanticQueryContractError("Assessment requires bounded approved account scope");
  }
  return { ...filter, span };
}
interface AssessmentGroupRow {
  ds: string;
  cash_cost: string | number | null;
  real_conversion: string | number | null;
  version_id: string | null;
  price: string | number | null;
  effective_date: string | null;
}

function decodedNumber(value: unknown): number | null {
  if (value === null) return null;
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !/^-?\d+(?:\.\d+)?$/.test(value))) {
    throw new SemanticQueryContractError("Invalid assessment numeric value");
  }
  return nullableNumber(value);
}

function decodeAssessment(row: AssessmentGroupRow): DailyAssessmentInput {
  const mapped = dailyAssessmentInputSchema.safeParse({
    ds: row.ds, cashCost: metricValue(decodedNumber(row.cash_cost)),
    realConversion: metricValue(decodedNumber(row.real_conversion)),
    price: row.version_id === null && row.price === null && row.effective_date === null ? null : {
      versionKey: row.version_id, value: decodedNumber(row.price), effectiveDate: row.effective_date,
    },
  });
  if (!mapped.success || (mapped.data.price !== null && mapped.data.price.effectiveDate! > mapped.data.ds)) {
    throw new SemanticQueryContractError("Invalid assessment history result");
  }
  return mapped.data;
}

function assertBounded(rows: unknown[]): void {
  if (rows.length > MAX_GROUPS || Buffer.byteLength(JSON.stringify(rows), "utf8") >= 16 * 1024 * 1024) {
    throw new SemanticQueryContractError("Assessment input exceeds query boundary");
  }
}

/** One SQL snapshot joins expected account-days to their actual effective history.
 * Groups collapse equal day/version members without averaging prices or CPA.
 * Public request authorization and the surrounding multi-query RR transaction belong to the service.
 */
export class WindowAssessmentRepository {
  constructor(private readonly connection: Pick<Pool, "query">) {}

  /** One batch, not N per-account queries. Every expected day remains represented;
   * a duplicate tuple/day means ambiguous effective task/history and fails closed.
   */
  async loadByAccount(scope: SemanticQueryScope): Promise<AccountDailyAssessment[]> {
    const filter = assessmentFilter(scope);
    const result = await this.connection.query<AssessmentGroupRow & {
      workspace_id: string; media: string; account_id: string;
    }>(`${EXPECTED_METRIC_CTE}
      SELECT metric.workspace_id, metric.media, metric.account_id, metric.ds::text AS ds,
        metric.cash_cost, metric.real_conversion, assessment.id::text AS version_id,
        assessment.price, assessment.effective_date::text AS effective_date
      ${assessmentFromSql}
      WHERE ${filter.whereSql}
      ORDER BY metric.media COLLATE "C", metric.account_id COLLATE "C", metric.ds
      LIMIT 10001`, filter.values);
    assertBounded(result.rows);
    const seen = new Set<string>();
    const allowed = new Set(scope.filters!.accountScopes!.map((row) => JSON.stringify([row.media, row.accountId])));
    return result.rows.map((row) => {
      const key = JSON.stringify([row.media, row.account_id, row.ds]);
      if (row.workspace_id !== scope.workspaceId || !allowed.has(JSON.stringify([row.media, row.account_id])) ||
        (scope.filters?.media !== undefined && scope.filters.media !== row.media) ||
        (scope.filters?.accountId !== undefined && scope.filters.accountId !== row.account_id) ||
        (scope.filters?.accountIds !== undefined && !scope.filters.accountIds.includes(row.account_id)) ||
        row.ds < scope.dateFrom || row.ds > scope.dateTo || seen.has(key)) {
        throw new SemanticQueryContractError("Invalid account assessment scope");
      }
      seen.add(key);
      return { workspaceId: scope.workspaceId, media: row.media, accountId: row.account_id, input: decodeAssessment(row) };
    });
  }

  async loadAccountCounts(scope: SemanticQueryScope): Promise<WindowAccountAssessmentCounts> {
    const filter = assessmentFilter(scope);
    const result = await this.connection.query(`${EXPECTED_METRIC_CTE}, account_totals AS (
      SELECT metric.media, metric.account_id,
        count(*) AS members,
        count(DISTINCT metric.ds) AS eligible_days,
        count(metric.cash_cost)=count(*) AND count(metric.real_conversion)=count(*)
          AND count(assessment.price)=count(*) AS complete,
        bool_or(coalesce(metric.cash_cost::text IN ('NaN','Infinity','-Infinity'),false)
          OR coalesce(metric.real_conversion::text IN ('NaN','Infinity','-Infinity'),false)
          OR coalesce(assessment.price::text IN ('NaN','Infinity','-Infinity'),false)) AS corrupt,
        sum(metric.cash_cost) AS cash,
        sum(assessment.price * metric.real_conversion) AS target
      ${assessmentFromSql}
      WHERE ${filter.whereSql}
      GROUP BY metric.media, metric.account_id
    ) SELECT count(*)::int AS total,
      count(*) FILTER(WHERE complete)::int AS determinable,
      count(*) FILTER(WHERE complete AND cash<=target)::int AS on_target,
      coalesce(bool_or(corrupt OR members<>${scope.filters?.taskId === undefined ? `$${filter.values.length + 1}` : "eligible_days"}
        OR cash::text IN ('NaN','Infinity','-Infinity') OR target::text IN ('NaN','Infinity','-Infinity')),false) AS invalid
      FROM account_totals`, scope.filters?.taskId === undefined ? [...filter.values, filter.span] : filter.values);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (result.rows.length !== 1 || !row || row.invalid !== false ||
      ![row.total, row.determinable, row.on_target].every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 1000) ||
      (row.total as number) > scope.filters!.accountScopes!.length ||
      (row.determinable as number) > (row.total as number) || (row.on_target as number) > (row.determinable as number)) {
      throw new SemanticQueryContractError("Invalid assessment account counts");
    }
    return { total: row.total as number, determinable: row.determinable as number, onTarget: row.on_target as number };
  }

  async load(scope: SemanticQueryScope): Promise<DailyAssessmentInput[]> {
    const filter = assessmentFilter(scope);
    const result = await this.connection.query<AssessmentGroupRow>(`${EXPECTED_METRIC_CTE}
      SELECT metric.ds::text AS ds, assessment.id::text AS version_id,
        assessment.price, assessment.effective_date::text AS effective_date,
        ${["cash_cost", "real_conversion"].map((field) => `CASE
          WHEN count(metric.${field})=count(*) OR bool_or(metric.${field}::text IN ('NaN','Infinity','-Infinity'))
          THEN sum(metric.${field}) ELSE NULL END AS ${field}`).join(",\n")}
      ${assessmentFromSql}
      WHERE ${filter.whereSql}
      GROUP BY metric.ds, assessment.id, assessment.price, assessment.effective_date
      ORDER BY metric.ds, assessment.id NULLS LAST
      LIMIT 10001`, filter.values);
    // SQL's extra row is an overflow sentinel, not silently truncated data.
    assertBounded(result.rows);
    return result.rows.map(decodeAssessment);
  }
}
