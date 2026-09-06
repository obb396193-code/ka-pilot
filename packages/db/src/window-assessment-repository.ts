import { dailyAssessmentInputSchema, metricValue, type DailyAssessmentInput } from "@ka/domain";
import type { Pool } from "pg";
import { EXPECTED_METRIC_CTE } from "./semantic-query-metrics.js";
import { buildMetricFilter, nullableNumber, SemanticQueryContractError } from "./semantic-query-support.js";
import type { SemanticQueryScope } from "./semantic-query-types.js";

const MAX_GROUPS = 10_000;
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

/** One SQL snapshot joins expected account-days to their actual effective history.
 * Groups collapse equal day/version members without averaging prices or CPA.
 * Public request authorization and the surrounding multi-query RR transaction belong to the service.
 */
export class WindowAssessmentRepository {
  constructor(private readonly connection: Pick<Pool, "query">) {}

  async load(scope: SemanticQueryScope): Promise<DailyAssessmentInput[]> {
    const filter = buildMetricFilter(scope);
    const span = (Date.parse(`${scope.dateTo}T00:00:00Z`) - Date.parse(`${scope.dateFrom}T00:00:00Z`)) / 86_400_000 + 1;
    if (span > 366 || !Array.isArray(scope.filters?.accountScopes) || scope.filters.accountScopes.length > 1000) {
      throw new SemanticQueryContractError("Assessment requires bounded approved account scope");
    }
    const result = await this.connection.query<AssessmentGroupRow>(`${EXPECTED_METRIC_CTE}
      SELECT metric.ds::text AS ds, assessment.id::text AS version_id,
        assessment.price, assessment.effective_date::text AS effective_date,
        ${["cash_cost", "real_conversion"].map((field) => `CASE
          WHEN count(metric.${field})=count(*) OR bool_or(metric.${field}::text IN ('NaN','Infinity','-Infinity'))
          THEN sum(metric.${field}) ELSE NULL END AS ${field}`).join(",\n")}
      FROM expected_metric AS metric
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
      ) AS assessment ON true
      WHERE ${filter.whereSql}
      GROUP BY metric.ds, assessment.id, assessment.price, assessment.effective_date
      ORDER BY metric.ds, assessment.id NULLS LAST
      LIMIT 10001`, filter.values);
    // SQL's extra row is an overflow sentinel, not silently truncated data.
    if (result.rows.length > MAX_GROUPS || Buffer.byteLength(JSON.stringify(result.rows), "utf8") >= 16 * 1024 * 1024) {
      throw new SemanticQueryContractError("Assessment input exceeds query boundary");
    }
    return result.rows.map((row) => {
      const mapped = dailyAssessmentInputSchema.safeParse({
        ds: row.ds,
        cashCost: metricValue(decodedNumber(row.cash_cost)),
        realConversion: metricValue(decodedNumber(row.real_conversion)),
        price: row.version_id === null && row.price === null && row.effective_date === null ? null : {
          versionKey: row.version_id, value: decodedNumber(row.price), effectiveDate: row.effective_date,
        },
      });
      if (!mapped.success) throw new SemanticQueryContractError("Invalid assessment history result");
      return mapped.data;
    });
  }
}
